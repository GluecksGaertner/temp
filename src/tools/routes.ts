/** Routing tools, backed by the Routes API. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ROUTES_FIELD_MASK_BASE,
  ROUTES_FIELD_MASK_POLYLINE,
  ROUTES_FIELD_MASK_STEPS,
  ROUTES_URL,
  ROUTE_MATRIX_FIELD_MASK,
  ROUTE_MATRIX_URL,
} from "../constants.js";
import { GoogleMapsError, postModern } from "../services/googleClient.js";
import {
  durationSeconds,
  formatDistance,
  formatDuration,
  guarded,
  stripHtml,
  toolResult,
} from "../services/format.js";
import {
  ResponseFormat,
  languageField,
  regionField,
  responseFormatField,
  toRoutesWaypoint,
  travelModeField,
  waypointField,
  withDefaults,
  type TravelModeValue,
} from "../schemas/common.js";
import type {
  ComputeRoutesResponse,
  Route,
  RouteMatrixElement,
  RouteStep,
} from "../types.js";

const API = "Routes API";

/** Traffic-aware routing and avoidance options only apply to motorised modes. */
function isMotorised(mode: TravelModeValue): boolean {
  return mode === "DRIVE" || mode === "TWO_WHEELER";
}

/** Rejects a departure time that Google would refuse anyway, with a clearer message. */
function validateDepartureTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new GoogleMapsError(
      `'${value}' is not a valid RFC 3339 timestamp.`,
      "Use a format like 2026-08-22T17:30:00Z.",
    );
  }
  if (parsed < Date.now() - 60_000) {
    throw new GoogleMapsError(
      "departure_time lies in the past.",
      "The Routes API only accepts a departure time in the future; omit it to depart now.",
    );
  }
  return new Date(parsed).toISOString();
}

function describeStep(step: RouteStep): string {
  const instruction = stripHtml(step.navigationInstruction?.instructions) || step.travelMode || "Continue";
  const transit = step.transitDetails;
  const parts = [instruction];

  if (transit) {
    const line = transit.transitLine?.nameShort ?? transit.transitLine?.name;
    const vehicle = transit.transitLine?.vehicle?.name?.text;
    const from = transit.stopDetails?.departureStop?.name;
    const to = transit.stopDetails?.arrivalStop?.name;
    const label = [vehicle, line].filter(Boolean).join(" ");
    if (label || from || to) {
      parts.push(`(${[label, from && to ? `${from} → ${to}` : undefined].filter(Boolean).join(", ")})`);
    }
    if (transit.headsign) parts.push(`towards ${transit.headsign}`);
  }

  const metrics = [formatDistance(step.distanceMeters), formatDuration(step.staticDuration)]
    .filter((value) => value !== "unknown")
    .join(", ");
  return metrics ? `${parts.join(" ")} — ${metrics}` : parts.join(" ");
}

function summariseRoute(
  route: Route,
  includeSteps: boolean,
  includePolyline: boolean,
): Record<string, unknown> {
  const steps = includeSteps
    ? (route.legs ?? []).flatMap((leg) => (leg.steps ?? []).map(describeStep))
    : undefined;

  const toll = route.travelAdvisory?.tollInfo?.estimatedPrice?.[0];
  return {
    description: route.description,
    distance_meters: route.distanceMeters,
    distance_text: formatDistance(route.distanceMeters),
    duration_seconds: durationSeconds(route.duration),
    duration_text: formatDuration(route.duration),
    duration_without_traffic_text:
      route.staticDuration && route.staticDuration !== route.duration
        ? formatDuration(route.staticDuration)
        : undefined,
    estimated_toll: toll ? `${toll.units ?? "0"} ${toll.currencyCode ?? ""}`.trim() : undefined,
    warnings: route.warnings?.length ? route.warnings : undefined,
    ...(includePolyline && route.polyline?.encodedPolyline
      ? { encoded_polyline: route.polyline.encodedPolyline }
      : {}),
    ...(steps ? { steps } : {}),
  };
}

export function registerRoutesTools(server: McpServer): void {
  server.registerTool(
    "google_maps_directions",
    {
      title: "Get directions between places",
      description: `Compute one or more routes between an origin and a destination, with distance, travel time and optional turn-by-turn steps.

Handles driving, walking, cycling, public transport and two-wheeler trips, and accounts for live traffic when driving.

Args:
  - origin (string): Start — an address, a "lat,lng" pair, or "place_id:ChIJ...".
  - destination (string): End — same formats as origin.
  - waypoints (string[], optional): Up to 10 stops to visit in order between origin and destination.
  - travel_mode ("DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TWO_WHEELER"): Default "DRIVE".
  - departure_time (string, optional): RFC 3339 timestamp in the future, e.g. "2026-08-22T17:30:00Z".
    Used for traffic prediction when driving and for timetables on TRANSIT.
  - avoid_tolls / avoid_highways / avoid_ferries (boolean): Route restrictions. Driving modes only.
  - alternatives (boolean): Also return alternative routes (default: false).
  - include_steps (boolean): Include turn-by-turn instructions (default: false — they are long).
  - include_polyline (boolean): Include the encoded route polyline, which google_maps_static_map
    can draw (default: false — it is long).
  - units ("METRIC" | "IMPERIAL"): Unit system for Google's own text (default: "METRIC").
  - language / region (string, optional): Instruction language and ccTLD bias.
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns:
  { "origin": string, "destination": string, "travel_mode": string, "count": number,
    "routes": [ { "description": string, "distance_meters": number, "distance_text": string,
                  "duration_seconds": number, "duration_text": string,
                  "duration_without_traffic_text": string, "estimated_toll": string,
                  "warnings": string[], "encoded_polyline": string, "steps": string[] } ] }

Examples:
  - "How long does it take to drive from Munich to Berlin?" -> origin="München", destination="Berlin"
  - "Walk me to the station" -> origin="52.5200,13.4050", destination="Berlin Hauptbahnhof", travel_mode="WALK", include_steps=true
  - "Next train connection" -> travel_mode="TRANSIT", departure_time set to the desired departure
  - Don't use when: you need travel times for many origin/destination pairs (use google_maps_distance_matrix).

Errors:
  - Returns "No route found" when the two points are not connected for the chosen mode (e.g. driving across an ocean).
  - Returns a clear message if avoid_* is combined with a non-driving travel mode.`,
      inputSchema: {
        origin: waypointField,
        destination: waypointField,
        waypoints: z
          .array(waypointField)
          .max(10, "At most 10 intermediate waypoints are supported")
          .optional()
          .describe("Intermediate stops, visited in the given order"),
        travel_mode: travelModeField,
        departure_time: z
          .string()
          .optional()
          .describe("RFC 3339 departure timestamp in the future, e.g. '2026-08-22T17:30:00Z'"),
        avoid_tolls: z.boolean().default(false).describe("Avoid toll roads (driving modes only)"),
        avoid_highways: z.boolean().default(false).describe("Avoid motorways (driving modes only)"),
        avoid_ferries: z.boolean().default(false).describe("Avoid ferries (driving modes only)"),
        alternatives: z.boolean().default(false).describe("Also return alternative routes"),
        include_steps: z
          .boolean()
          .default(false)
          .describe("Include turn-by-turn navigation instructions"),
        include_polyline: z
          .boolean()
          .default(false)
          .describe(
            "Include the encoded polyline of the route, for drawing it with google_maps_static_map",
          ),
        units: z.enum(["METRIC", "IMPERIAL"]).default("METRIC").describe("Unit system"),
        language: languageField,
        region: regionField,
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) =>
      guarded(async () => {
        const { language, region } = withDefaults(params.language, params.region);
        const motorised = isMotorised(params.travel_mode);
        const wantsAvoidance = params.avoid_tolls || params.avoid_highways || params.avoid_ferries;

        if (wantsAvoidance && !motorised) {
          return toolResult(
            `Error: avoid_tolls / avoid_highways / avoid_ferries only apply to DRIVE and TWO_WHEELER. ` +
              `Remove them or set travel_mode to a driving mode.`,
          );
        }

        const departureTime = validateDepartureTime(params.departure_time);

        const body: Record<string, unknown> = {
          origin: toRoutesWaypoint(params.origin),
          destination: toRoutesWaypoint(params.destination),
          travelMode: params.travel_mode,
          computeAlternativeRoutes: params.alternatives,
          units: params.units,
          ...(params.waypoints?.length
            ? { intermediates: params.waypoints.map(toRoutesWaypoint) }
            : {}),
          ...(motorised ? { routingPreference: "TRAFFIC_AWARE" } : {}),
          ...(departureTime ? { departureTime } : {}),
          ...(wantsAvoidance
            ? {
                routeModifiers: {
                  avoidTolls: params.avoid_tolls,
                  avoidHighways: params.avoid_highways,
                  avoidFerries: params.avoid_ferries,
                },
              }
            : {}),
          ...(language ? { languageCode: language } : {}),
          ...(region ? { regionCode: region } : {}),
        };

        const fieldMask = [
          ROUTES_FIELD_MASK_BASE,
          ...(params.include_steps ? [ROUTES_FIELD_MASK_STEPS] : []),
          ...(params.include_polyline ? [ROUTES_FIELD_MASK_POLYLINE] : []),
        ].join(",");

        const data = await postModern<ComputeRoutesResponse>(ROUTES_URL, body, fieldMask, API);
        const routes = (data.routes ?? []).map((route) =>
          summariseRoute(route, params.include_steps, params.include_polyline),
        );

        if (routes.length === 0) {
          return toolResult(
            `No route found from '${params.origin}' to '${params.destination}' by ${params.travel_mode}. ` +
              `Check the spelling of both places, or try a different travel_mode.`,
            { origin: params.origin, destination: params.destination, count: 0, routes: [] },
          );
        }

        const structured = {
          origin: params.origin,
          destination: params.destination,
          travel_mode: params.travel_mode,
          count: routes.length,
          routes,
        };

        if (params.response_format === ResponseFormat.JSON) {
          return toolResult(JSON.stringify(structured, null, 2), structured);
        }

        const lines = [
          `# ${params.origin} → ${params.destination}`,
          "",
          `Travel mode: ${params.travel_mode}${departureTime ? `, departing ${departureTime}` : ""}`,
          "",
        ];
        for (const [index, route] of routes.entries()) {
          const label = (route.description as string) ?? `Route ${index + 1}`;
          lines.push(`## ${index + 1}. ${label}`);
          lines.push(`- **Distance**: ${route.distance_text as string}`);
          lines.push(`- **Duration**: ${route.duration_text as string}`);
          if (route.duration_without_traffic_text) {
            lines.push(`- **Without traffic**: ${route.duration_without_traffic_text as string}`);
          }
          if (route.estimated_toll) lines.push(`- **Estimated toll**: ${route.estimated_toll as string}`);
          if (route.encoded_polyline) {
            lines.push(`- **Polyline**: \`${route.encoded_polyline as string}\``);
          }
          for (const warning of (route.warnings as string[] | undefined) ?? []) {
            lines.push(`- **Warning**: ${warning}`);
          }
          const steps = route.steps as string[] | undefined;
          if (steps?.length) {
            lines.push("", "### Steps");
            steps.forEach((step, stepIndex) => lines.push(`${stepIndex + 1}. ${step}`));
          }
          lines.push("");
        }
        return toolResult(lines.join("\n"), structured);
      }),
  );

  server.registerTool(
    "google_maps_distance_matrix",
    {
      title: "Compare travel times for many pairs",
      description: `Compute distance and travel time for every combination of a set of origins and a set of destinations.

Use this to answer "which of these three offices is closest?" or "how long from each hotel to the venue?" in a single call, instead of many google_maps_directions calls.

Args:
  - origins (string[]): 1-25 start points — addresses, "lat,lng" pairs or "place_id:..." values.
  - destinations (string[]): 1-25 end points, same formats.
  - travel_mode ("DRIVE" | "WALK" | "BICYCLE" | "TRANSIT" | "TWO_WHEELER"): Default "DRIVE".
  - departure_time (string, optional): RFC 3339 timestamp in the future, for traffic and timetables.
  - response_format ("markdown" | "json"): Output format (default: "markdown").

The number of origins multiplied by destinations must not exceed 100.

Returns:
  { "travel_mode": string, "origins": string[], "destinations": string[],
    "elements": [ { "origin": string, "destination": string, "distance_meters": number,
                    "distance_text": string, "duration_seconds": number,
                    "duration_text": string, "routable": boolean } ] }

Examples:
  - "Which of our three warehouses is closest to the customer?" -> origins=[3 warehouses], destinations=[customer]
  - "Travel times between all four venues" -> origins and destinations both the four venues
  - Don't use when: you need turn-by-turn instructions (use google_maps_directions).

Errors:
  - Returns an error if origins × destinations exceeds 100.
  - Individual unroutable pairs are marked "routable": false instead of failing the whole call.`,
      inputSchema: {
        origins: z
          .array(waypointField)
          .min(1, "At least one origin is required")
          .max(25, "At most 25 origins are supported")
          .describe("Start points"),
        destinations: z
          .array(waypointField)
          .min(1, "At least one destination is required")
          .max(25, "At most 25 destinations are supported")
          .describe("End points"),
        travel_mode: travelModeField,
        departure_time: z
          .string()
          .optional()
          .describe("RFC 3339 departure timestamp in the future"),
        response_format: responseFormatField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) =>
      guarded(async () => {
        const pairs = params.origins.length * params.destinations.length;
        if (pairs > 100) {
          return toolResult(
            `Error: ${params.origins.length} origins × ${params.destinations.length} destinations = ${pairs} pairs, ` +
              `which exceeds the limit of 100. Split the request into smaller batches.`,
          );
        }

        const departureTime = validateDepartureTime(params.departure_time);
        const motorised = isMotorised(params.travel_mode);

        const body: Record<string, unknown> = {
          origins: params.origins.map((value) => ({ waypoint: toRoutesWaypoint(value) })),
          destinations: params.destinations.map((value) => ({ waypoint: toRoutesWaypoint(value) })),
          travelMode: params.travel_mode,
          ...(motorised ? { routingPreference: "TRAFFIC_AWARE" } : {}),
          ...(departureTime ? { departureTime } : {}),
        };

        const elements = await postModern<RouteMatrixElement[]>(
          ROUTE_MATRIX_URL,
          body,
          ROUTE_MATRIX_FIELD_MASK,
          API,
        );

        const rows = (Array.isArray(elements) ? elements : []).map((element) => {
          const originIndex = element.originIndex ?? 0;
          const destinationIndex = element.destinationIndex ?? 0;
          const routable = element.condition === "ROUTE_EXISTS";
          return {
            origin: params.origins[originIndex] ?? `origin ${originIndex}`,
            destination: params.destinations[destinationIndex] ?? `destination ${destinationIndex}`,
            distance_meters: routable ? element.distanceMeters : undefined,
            distance_text: routable ? formatDistance(element.distanceMeters) : "no route",
            duration_seconds: routable ? durationSeconds(element.duration) : undefined,
            duration_text: routable ? formatDuration(element.duration) : "no route",
            routable,
          };
        });

        rows.sort((a, b) => (a.duration_seconds ?? Infinity) - (b.duration_seconds ?? Infinity));

        const structured = {
          travel_mode: params.travel_mode,
          origins: params.origins,
          destinations: params.destinations,
          count: rows.length,
          elements: rows,
        };

        if (params.response_format === ResponseFormat.JSON) {
          return toolResult(JSON.stringify(structured, null, 2), structured);
        }

        const lines = [
          `# Travel matrix (${params.travel_mode})`,
          "",
          "Sorted by travel time, fastest first.",
          "",
          "| From | To | Distance | Duration |",
          "| --- | --- | --- | --- |",
        ];
        for (const row of rows) {
          lines.push(
            `| ${row.origin} | ${row.destination} | ${row.distance_text} | ${row.duration_text} |`,
          );
        }
        return toolResult(lines.join("\n"), structured);
      }),
  );
}
