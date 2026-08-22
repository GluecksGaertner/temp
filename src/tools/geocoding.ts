/** Address <-> coordinate tools, backed by the Geocoding API. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GEOCODING_URL, googleMapsLink } from "../constants.js";
import { getClassic } from "../services/googleClient.js";
import { guarded, toolResult } from "../services/format.js";
import {
  ResponseFormat,
  languageField,
  latitudeField,
  longitudeField,
  regionField,
  responseFormatField,
  withDefaults,
} from "../schemas/common.js";
import type { GeocodeResponse, GeocodeResult } from "../types.js";

const API = "Geocoding API";

/** Shared normalisation so both directions return the same record shape. */
function normalise(result: GeocodeResult): Record<string, unknown> {
  const { lat, lng } = result.geometry.location;
  return {
    formatted_address: result.formatted_address,
    latitude: lat,
    longitude: lng,
    place_id: result.place_id,
    location_type: result.geometry.location_type,
    types: result.types,
    google_maps_url: googleMapsLink(lat, lng),
  };
}

function renderMarkdown(title: string, results: Record<string, unknown>[]): string {
  const lines = [`# ${title}`, "", `${results.length} result(s).`, ""];
  for (const [index, item] of results.entries()) {
    lines.push(`## ${index + 1}. ${item.formatted_address as string}`);
    lines.push(`- **Coordinates**: ${item.latitude}, ${item.longitude}`);
    if (item.location_type) lines.push(`- **Precision**: ${item.location_type as string}`);
    lines.push(`- **Place ID**: \`${item.place_id as string}\``);
    lines.push(`- **Map**: ${item.google_maps_url as string}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function registerGeocodingTools(server: McpServer): void {
  server.registerTool(
    "google_maps_geocode",
    {
      title: "Geocode an address",
      description: `Convert a street address, place name or postal code into geographic coordinates.

Use this whenever you have a human-readable location and need latitude/longitude or a Google place id — for example before calling google_maps_nearby_places or google_maps_static_map.

Args:
  - address (string): The address or place name to look up, e.g. "Marienplatz 1, München".
  - language (string, optional): Result language, e.g. "de".
  - region (string, optional): ccTLD bias for ambiguous names, e.g. "de".
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns a list of matches, each with:
  { "formatted_address": string, "latitude": number, "longitude": number,
    "place_id": string, "location_type": string, "types": string[],
    "google_maps_url": string }

Examples:
  - "Where is the Brandenburg Gate?" -> address="Brandenburger Tor, Berlin"
  - "Coordinates of postcode 80331" -> address="80331 München, Germany"
  - Don't use when: you already have coordinates and want an address (use google_maps_reverse_geocode).

Errors:
  - Returns "No result for '<address>'" when the address cannot be matched — try a more complete address.`,
      inputSchema: {
        address: z
          .string()
          .min(1, "Address must not be empty")
          .max(300, "Address must not exceed 300 characters")
          .describe("Street address, place name or postal code to geocode"),
        language: languageField,
        region: regionField,
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ address, language, region, response_format }) =>
      guarded(async () => {
        const defaults = withDefaults(language, region);
        const data = await getClassic<GeocodeResponse>(
          GEOCODING_URL,
          { address, language: defaults.language, region: defaults.region },
          API,
        );

        const results = (data.results ?? []).map(normalise);
        if (results.length === 0) {
          return toolResult(
            `No result for '${address}'. Try adding the city or country, or search for the place with google_maps_search_places instead.`,
            { query: address, count: 0, results: [] },
          );
        }

        const structured = { query: address, count: results.length, results };
        const text =
          response_format === ResponseFormat.JSON
            ? JSON.stringify(structured, null, 2)
            : renderMarkdown(`Geocoding: ${address}`, results);
        return toolResult(text, structured);
      }),
  );

  server.registerTool(
    "google_maps_reverse_geocode",
    {
      title: "Reverse geocode coordinates",
      description: `Convert latitude/longitude into the nearest human-readable address.

Use this to answer "where am I?" or to turn a GPS fix from the phone into a street address.

Args:
  - latitude (number): Latitude in decimal degrees, -90 to 90.
  - longitude (number): Longitude in decimal degrees, -180 to 180.
  - language (string, optional): Result language, e.g. "de".
  - result_types (string[], optional): Restrict results to address types such as
    "street_address", "route", "locality", "postal_code", "country".
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns matches ordered from most to least specific, each with:
  { "formatted_address": string, "latitude": number, "longitude": number,
    "place_id": string, "types": string[], "google_maps_url": string }

Examples:
  - "What address is at 48.1372, 11.5756?" -> latitude=48.1372, longitude=11.5756
  - "Which city is this?" -> add result_types=["locality"]
  - Don't use when: you have an address and want coordinates (use google_maps_geocode).

Errors:
  - Returns "No address found" for coordinates over open water or unmapped terrain.`,
      inputSchema: {
        latitude: latitudeField,
        longitude: longitudeField,
        language: languageField,
        result_types: z
          .array(z.string().min(1))
          .max(10)
          .optional()
          .describe("Optional address types to filter by, e.g. ['locality'] for just the city"),
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ latitude, longitude, language, result_types, response_format }) =>
      guarded(async () => {
        const defaults = withDefaults(language);
        const data = await getClassic<GeocodeResponse>(
          GEOCODING_URL,
          {
            latlng: `${latitude},${longitude}`,
            language: defaults.language,
            result_type: result_types?.length ? result_types.join("|") : undefined,
          },
          API,
        );

        const results = (data.results ?? []).map(normalise);
        if (results.length === 0) {
          return toolResult(
            `No address found near ${latitude}, ${longitude}. The point may be over water or in unmapped terrain.`,
            { latitude, longitude, count: 0, results: [] },
          );
        }

        const structured = { latitude, longitude, count: results.length, results };
        const text =
          response_format === ResponseFormat.JSON
            ? JSON.stringify(structured, null, 2)
            : renderMarkdown(`Address at ${latitude}, ${longitude}`, results);
        return toolResult(text, structured);
      }),
  );
}

/** Re-exported for tools that need a coordinate for a free-text location. */
export async function geocodeToLatLng(
  address: string,
  language?: string,
  region?: string,
): Promise<{ latitude: number; longitude: number; formatted_address: string } | undefined> {
  const data = await getClassic<GeocodeResponse>(
    GEOCODING_URL,
    { address, language, region },
    API,
  );
  const first = data.results?.[0];
  if (!first) return undefined;
  return {
    latitude: first.geometry.location.lat,
    longitude: first.geometry.location.lng,
    formatted_address: first.formatted_address,
  };
}
