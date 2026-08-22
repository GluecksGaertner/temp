/** Zod building blocks reused across tools. */

import { z } from "zod";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export const responseFormatField = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for a readable summary, 'json' for the full structured data");

export const latitudeField = z
  .number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90")
  .describe("Latitude in decimal degrees, e.g. 52.5200");

export const longitudeField = z
  .number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180")
  .describe("Longitude in decimal degrees, e.g. 13.4050");

export const languageField = z
  .string()
  .min(2)
  .max(10)
  .optional()
  .describe(
    "IETF language code for the results, e.g. 'de' or 'en-GB'. Defaults to the server's DEFAULT_LANGUAGE.",
  );

export const regionField = z
  .string()
  .min(2)
  .max(3)
  .optional()
  .describe(
    "ccTLD region bias for ambiguous names, e.g. 'de' or 'ch'. Defaults to the server's DEFAULT_REGION.",
  );

/** A place either as free text ("Brandenburger Tor, Berlin") or as coordinates. */
export const waypointField = z
  .string()
  .min(1, "A waypoint must not be empty")
  .max(300, "A waypoint must not exceed 300 characters")
  .describe(
    "An address or place name ('Hauptbahnhof München'), a 'latitude,longitude' pair ('48.1402,11.5600'), " +
      "or a Google place id prefixed with 'place_id:' ('place_id:ChIJ...').",
  );

export const TravelMode = z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT", "TWO_WHEELER"]);
export type TravelModeValue = z.infer<typeof TravelMode>;

export const travelModeField = TravelMode.default("DRIVE").describe(
  "How the trip is made: DRIVE (car), WALK, BICYCLE, TRANSIT (public transport) or TWO_WHEELER (motorcycle/scooter).",
);

/** Applies the server-wide defaults when a call leaves them out. */
export function withDefaults(language?: string, region?: string): {
  language?: string;
  region?: string;
} {
  return {
    language: language ?? process.env.DEFAULT_LANGUAGE?.trim() ?? undefined,
    region: region ?? process.env.DEFAULT_REGION?.trim() ?? undefined,
  };
}

/** Coordinate pair, matched loosely so "52.52, 13.405" is accepted too. */
const LATLNG_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

/**
 * Converts a free-form waypoint into the Routes API `Waypoint` shape.
 * Coordinates and place ids are passed through structurally so Google does not
 * have to geocode them again.
 */
export function toRoutesWaypoint(value: string): Record<string, unknown> {
  const trimmed = value.trim();

  if (trimmed.toLowerCase().startsWith("place_id:")) {
    return { placeId: trimmed.slice("place_id:".length).trim() };
  }

  const match = LATLNG_PATTERN.exec(trimmed);
  if (match?.[1] && match[2]) {
    return {
      location: {
        latLng: { latitude: Number.parseFloat(match[1]), longitude: Number.parseFloat(match[2]) },
      },
    };
  }

  return { address: trimmed };
}

/** True when the string is a bare "lat,lng" pair. */
export function parseLatLng(value: string): { latitude: number; longitude: number } | undefined {
  const match = LATLNG_PATTERN.exec(value);
  if (!match?.[1] || !match[2]) return undefined;
  return {
    latitude: Number.parseFloat(match[1]),
    longitude: Number.parseFloat(match[2]),
  };
}
