/**
 * Thin HTTP client for the Google Maps Platform.
 *
 * Centralises API-key handling, timeouts and error translation so that the
 * individual tool modules only deal with domain logic.
 */

import { REQUEST_TIMEOUT_MS } from "../constants.js";

/** An error that carries a message safe to hand back to the agent. */
export class GoogleMapsError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "GoogleMapsError";
  }

  /** Message plus an actionable next step, if we have one. */
  get agentMessage(): string {
    return this.hint ? `${this.message} ${this.hint}` : this.message;
  }
}

/**
 * Reads the API key from the environment.
 * Throws a descriptive error rather than leaking an undefined key into a URL.
 */
export function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new GoogleMapsError(
      "GOOGLE_MAPS_API_KEY is not configured on the MCP server.",
      "Set the environment variable to a Google Maps Platform API key and restart the server.",
    );
  }
  return key;
}

type QueryValue = string | number | boolean | undefined | null;

/** Builds a query string, dropping undefined/null values. */
export function buildQuery(params: Record<string, QueryValue | QueryValue[]>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        search.append(key, String(item));
      }
    } else {
      search.set(key, String(value));
    }
  }
  return search;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GoogleMapsError(
        `The Google Maps request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        "Try again, or narrow the request (smaller radius, fewer origins/destinations).",
      );
    }
    throw new GoogleMapsError(
      "Could not reach the Google Maps Platform.",
      "Check the MCP server's network access and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** True when a 400 is really an authentication problem wearing a bad disguise. */
function looksLikeKeyProblem(status: string, message: string): boolean {
  const haystack = `${status} ${message}`.toLowerCase();
  return (
    haystack.includes("unauthenticated") ||
    haystack.includes("permission_denied") ||
    haystack.includes("api key") ||
    haystack.includes("api_key")
  );
}

/** Turns an HTTP error response from any Maps API into an actionable message. */
async function throwForStatus(response: Response, api: string): Promise<never> {
  let detail = "";
  let googleStatus = "";
  try {
    const body = (await response.json()) as { error?: { message?: string; status?: string } };
    detail = (body?.error?.message ?? "").trim();
    googleStatus = body?.error?.status ?? "";
  } catch {
    // Body was not JSON — the status code alone has to carry the message.
  }

  const suffix = detail ? ` Google said: ${detail}` : "";
  switch (response.status) {
    case 400:
      // The modern APIs report an invalid or unenabled key as 400
      // INVALID_ARGUMENT, which would otherwise send the agent hunting for a
      // bad parameter that does not exist.
      if (looksLikeKeyProblem(googleStatus, detail)) {
        throw new GoogleMapsError(
          `The ${api} rejected the API key.${suffix}`,
          `Check GOOGLE_MAPS_API_KEY, and make sure the ${api} is enabled for that Google Cloud project.`,
        );
      }
      throw new GoogleMapsError(
        `The ${api} request was rejected as invalid.${suffix}`,
        "Check the coordinates, place id or travel mode you passed.",
      );
    case 401:
    case 403:
      throw new GoogleMapsError(
        `Access to the ${api} was denied.${suffix}`,
        `Enable the ${api} in the Google Cloud project and make sure the API key's restrictions allow it.`,
      );
    case 404:
      throw new GoogleMapsError(
        `The requested resource was not found in the ${api}.${suffix}`,
        "Verify the identifier — place ids expire and are not interchangeable between APIs.",
      );
    case 429:
      throw new GoogleMapsError(
        `The ${api} rate limit or quota was exceeded.${suffix}`,
        "Wait a moment before retrying, or raise the quota in the Google Cloud console.",
      );
    default:
      throw new GoogleMapsError(
        `The ${api} returned HTTP ${response.status}.${suffix}`,
        "This is usually transient — retrying once is reasonable.",
      );
  }
}

/** GET against a classic maps.googleapis.com endpoint (key goes in the query string). */
export async function getClassic<T>(
  url: string,
  params: Record<string, QueryValue | QueryValue[]>,
  api: string,
): Promise<T> {
  const query = buildQuery({ ...params, key: getApiKey() });
  const response = await fetchWithTimeout(`${url}?${query.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) await throwForStatus(response, api);

  const data = (await response.json()) as T & { status?: string; error_message?: string };
  assertClassicStatus(data, api);
  return data;
}

/**
 * The classic APIs answer HTTP 200 even for logical failures and signal the
 * real outcome in a `status` field.
 */
function assertClassicStatus(
  data: { status?: string; error_message?: string },
  api: string,
): void {
  const status = data.status;
  if (!status || status === "OK" || status === "ZERO_RESULTS") return;

  const detail = data.error_message ? ` Google said: ${data.error_message.trim()}` : "";
  switch (status) {
    case "REQUEST_DENIED":
      throw new GoogleMapsError(
        `The ${api} denied the request.${detail}`,
        `Enable the ${api} for this Google Cloud project and check the API key restrictions.`,
      );
    case "OVER_QUERY_LIMIT":
    case "OVER_DAILY_LIMIT":
      throw new GoogleMapsError(
        `The ${api} quota is exhausted.${detail}`,
        "Check billing and quotas in the Google Cloud console.",
      );
    case "INVALID_REQUEST":
      throw new GoogleMapsError(
        `The ${api} considered the request invalid.${detail}`,
        "Check that all required parameters are present and well-formed.",
      );
    case "NOT_FOUND":
      throw new GoogleMapsError(
        `The ${api} could not find the referenced location.${detail}`,
        "Try a more complete address or a coordinate pair instead.",
      );
    default:
      throw new GoogleMapsError(`The ${api} returned status ${status}.${detail}`);
  }
}

/** POST against a modern *.googleapis.com endpoint (key goes in a header). */
export async function postModern<T>(
  url: string,
  body: unknown,
  fieldMask: string,
  api: string,
): Promise<T> {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) await throwForStatus(response, api);
  return (await response.json()) as T;
}

/** GET against a modern *.googleapis.com endpoint (key and field mask in headers). */
export async function getModern<T>(
  url: string,
  params: Record<string, QueryValue>,
  fieldMask: string,
  api: string,
): Promise<T> {
  const query = buildQuery(params);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetchWithTimeout(`${url}${suffix}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": fieldMask,
    },
  });
  if (!response.ok) await throwForStatus(response, api);
  return (await response.json()) as T;
}

/** GET binary content (used for static map images). */
export async function getBinary(
  url: string,
  params: Record<string, QueryValue | QueryValue[]>,
  api: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const query = buildQuery({ ...params, key: getApiKey() });
  const response = await fetchWithTimeout(`${url}?${query.toString()}`, { method: "GET" });

  if (!response.ok) {
    // The Static Maps API explains failures in a plain-text body.
    const text = await response.text().catch(() => "");
    const detail = text.trim() ? ` Google said: ${text.trim()}` : "";
    if (response.status === 403) {
      throw new GoogleMapsError(
        `Access to the ${api} was denied.${detail}`,
        `Enable the ${api} in the Google Cloud project and check the API key restrictions.`,
      );
    }
    throw new GoogleMapsError(`The ${api} returned HTTP ${response.status}.${detail}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  return { bytes, mimeType };
}
