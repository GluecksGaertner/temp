/** Formatting helpers shared by every tool. */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CHARACTER_LIMIT } from "../constants.js";
import { GoogleMapsError } from "./googleClient.js";

/** Wraps text plus structured data into a tool result, truncating if oversized. */
export function toolResult(text: string, structuredContent?: Record<string, unknown>): CallToolResult {
  let body = text;
  if (body.length > CHARACTER_LIMIT) {
    body =
      `${body.slice(0, CHARACTER_LIMIT)}\n\n[Response truncated at ${CHARACTER_LIMIT} characters. ` +
      `Narrow the request — lower 'max_results', shrink the radius, or set 'include_steps' to false.]`;
  }
  return structuredContent
    ? { content: [{ type: "text", text: body }], structuredContent }
    : { content: [{ type: "text", text: body }] };
}

/** Wraps an error into a tool result the agent can recover from. */
export function errorResult(error: unknown): CallToolResult {
  const message =
    error instanceof GoogleMapsError
      ? `Error: ${error.agentMessage}`
      : `Error: ${error instanceof Error ? error.message : String(error)}`;
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Runs a tool body, turning any throw into a well-formed error result. */
export async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    return errorResult(error);
  }
}

/** 1234 -> "1.2 km", 640 -> "640 m" */
export function formatDistance(meters: number | undefined): string {
  if (meters === undefined || Number.isNaN(meters)) return "unknown";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Accepts either seconds or a protobuf duration string like "930s". */
export function formatDuration(value: number | string | undefined): string {
  const seconds = typeof value === "string" ? Number.parseFloat(value.replace(/s$/, "")) : value;
  if (seconds === undefined || Number.isNaN(seconds)) return "unknown";

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (total < 60) return `${total} s`;
  return `${minutes} min`;
}

/** Parses a protobuf duration string into seconds, for structured output. */
export function durationSeconds(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const seconds = typeof value === "string" ? Number.parseFloat(value.replace(/s$/, "")) : value;
  return Number.isNaN(seconds) ? undefined : seconds;
}

/** Strips the HTML that some Google APIs embed in navigation instructions. */
export function stripHtml(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, " — ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Places API price levels are enum strings; render them as the familiar € scale. */
export function formatPriceLevel(level: string | undefined): string | undefined {
  switch (level) {
    case "PRICE_LEVEL_FREE":
      return "free";
    case "PRICE_LEVEL_INEXPENSIVE":
      return "€";
    case "PRICE_LEVEL_MODERATE":
      return "€€";
    case "PRICE_LEVEL_EXPENSIVE":
      return "€€€";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "€€€€";
    default:
      return undefined;
  }
}

/** Renders a rating as "4.5 ★ (1,203 reviews)". */
export function formatRating(rating?: number, count?: number): string | undefined {
  if (rating === undefined) return undefined;
  const reviews = count === undefined ? "" : ` (${count.toLocaleString("en-US")} reviews)`;
  return `${rating.toFixed(1)} ★${reviews}`;
}
