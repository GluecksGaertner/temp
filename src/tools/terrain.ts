/** Elevation and time-zone tools. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ELEVATION_URL, TIMEZONE_URL } from "../constants.js";
import { getClassic } from "../services/googleClient.js";
import { guarded, toolResult } from "../services/format.js";
import {
  ResponseFormat,
  languageField,
  latitudeField,
  longitudeField,
  parseLatLng,
  responseFormatField,
  withDefaults,
} from "../schemas/common.js";
import type { ElevationResponse, TimeZoneResponse } from "../types.js";

export function registerTerrainTools(server: McpServer): void {
  server.registerTool(
    "google_maps_elevation",
    {
      title: "Get elevation for coordinates",
      description: `Look up the height above sea level for one or more coordinates.

Useful for hiking and cycling questions, flood or view assessments, and for comparing two points.

Args:
  - locations (string[]): 1-50 coordinate pairs as "lat,lng" strings, e.g. ["47.4210,10.9855"].
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns:
  { "count": number,
    "results": [ { "latitude": number, "longitude": number,
                   "elevation_meters": number, "resolution_meters": number } ] }

Examples:
  - "How high is the Zugspitze?" -> geocode it first, then locations=["47.4210,10.9855"]
  - "How much do we climb between these two points?" -> pass both and compare
  - Don't use when: you only have an address (call google_maps_geocode first).

Errors:
  - Returns an error naming the offending entry if a location is not a valid "lat,lng" pair.`,
      inputSchema: {
        locations: z
          .array(z.string().min(1))
          .min(1, "At least one location is required")
          .max(50, "At most 50 locations are supported")
          .describe("Coordinate pairs as 'lat,lng' strings"),
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ locations, response_format }) =>
      guarded(async () => {
        const parsed: string[] = [];
        for (const location of locations) {
          const coordinate = parseLatLng(location);
          if (!coordinate) {
            return toolResult(
              `Error: '${location}' is not a valid coordinate pair. Use the format "52.5200,13.4050", ` +
                `or call google_maps_geocode to turn an address into coordinates first.`,
            );
          }
          parsed.push(`${coordinate.latitude},${coordinate.longitude}`);
        }

        const data = await getClassic<ElevationResponse>(
          ELEVATION_URL,
          { locations: parsed.join("|") },
          "Elevation API",
        );

        const results = (data.results ?? []).map((result) => ({
          latitude: result.location.lat,
          longitude: result.location.lng,
          elevation_meters: Math.round(result.elevation * 10) / 10,
          resolution_meters: result.resolution,
        }));

        if (results.length === 0) {
          return toolResult("No elevation data available for the given locations.", {
            count: 0,
            results: [],
          });
        }

        const structured = { count: results.length, results };
        if (response_format === ResponseFormat.JSON) {
          return toolResult(JSON.stringify(structured, null, 2), structured);
        }

        const lines = ["# Elevation", "", "| Latitude | Longitude | Elevation |", "| --- | --- | --- |"];
        for (const result of results) {
          lines.push(
            `| ${result.latitude} | ${result.longitude} | ${result.elevation_meters} m |`,
          );
        }
        return toolResult(lines.join("\n"), structured);
      }),
  );

  server.registerTool(
    "google_maps_timezone",
    {
      title: "Get the time zone at a location",
      description: `Determine the time zone, UTC offset and current local time at a coordinate.

Use this when planning across regions: "what time is it there now?", "is that within their office hours?".

Args:
  - latitude (number): Latitude in decimal degrees.
  - longitude (number): Longitude in decimal degrees.
  - timestamp (string, optional): RFC 3339 instant to evaluate, e.g. "2026-12-24T12:00:00Z".
    Defaults to now; matters because it decides whether daylight saving applies.
  - language (string, optional): Language of the time-zone name.
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns:
  { "time_zone_id": string, "time_zone_name": string, "utc_offset_hours": number,
    "dst_offset_hours": number, "local_time": string, "reference_time": string }

Examples:
  - "What time is it in Tokyo right now?" -> geocode Tokyo, then pass its coordinates
  - "Will they be on summer time on 24 December?" -> pass timestamp="2026-12-24T12:00:00Z"
  - Don't use when: you need the time zone of an address (geocode it first).

Errors:
  - Returns an error for coordinates in international waters, where no time zone is defined.`,
      inputSchema: {
        latitude: latitudeField,
        longitude: longitudeField,
        timestamp: z
          .string()
          .optional()
          .describe("RFC 3339 instant to evaluate; defaults to the current time"),
        language: languageField,
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ latitude, longitude, timestamp, language, response_format }) =>
      guarded(async () => {
        const defaults = withDefaults(language);

        const reference = timestamp ? Date.parse(timestamp) : Date.now();
        if (Number.isNaN(reference)) {
          return toolResult(
            `Error: '${timestamp}' is not a valid RFC 3339 timestamp. Use a format like 2026-12-24T12:00:00Z.`,
          );
        }

        const data = await getClassic<TimeZoneResponse>(
          TIMEZONE_URL,
          {
            location: `${latitude},${longitude}`,
            timestamp: Math.floor(reference / 1000),
            language: defaults.language,
          },
          "Time Zone API",
        );

        if (!data.timeZoneId) {
          return toolResult(
            `No time zone is defined at ${latitude}, ${longitude}. The point is probably in international waters.`,
          );
        }

        const offsetSeconds = (data.rawOffset ?? 0) + (data.dstOffset ?? 0);
        const structured = {
          time_zone_id: data.timeZoneId,
          time_zone_name: data.timeZoneName,
          utc_offset_hours: offsetSeconds / 3600,
          dst_offset_hours: (data.dstOffset ?? 0) / 3600,
          local_time: new Date(reference + offsetSeconds * 1000).toISOString().replace("Z", ""),
          reference_time: new Date(reference).toISOString(),
        };

        if (response_format === ResponseFormat.JSON) {
          return toolResult(JSON.stringify(structured, null, 2), structured);
        }

        const sign = offsetSeconds >= 0 ? "+" : "-";
        const lines = [
          `# Time zone at ${latitude}, ${longitude}`,
          "",
          `- **Zone**: ${structured.time_zone_name ?? structured.time_zone_id} (\`${structured.time_zone_id}\`)`,
          `- **UTC offset**: ${sign}${Math.abs(structured.utc_offset_hours)} h`,
          `- **Daylight saving**: ${structured.dst_offset_hours > 0 ? "in effect" : "not in effect"}`,
          `- **Local time**: ${structured.local_time.replace("T", " ").slice(0, 19)}`,
          `- **Reference (UTC)**: ${structured.reference_time.replace("T", " ").slice(0, 19)}`,
        ];
        return toolResult(lines.join("\n"), structured);
      }),
  );
}
