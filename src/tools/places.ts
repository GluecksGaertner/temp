/** Place discovery tools, backed by the Places API (New). */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  PLACES_BASE_URL,
  PLACES_NEARBY_SEARCH_URL,
  PLACES_SEARCH_FIELD_MASK,
  PLACES_TEXT_SEARCH_URL,
  PLACE_DETAILS_FIELD_MASK,
  googleMapsPlaceLink,
} from "../constants.js";
import { getModern, postModern } from "../services/googleClient.js";
import {
  formatPriceLevel,
  formatRating,
  guarded,
  toolResult,
} from "../services/format.js";
import {
  ResponseFormat,
  languageField,
  latitudeField,
  longitudeField,
  regionField,
  responseFormatField,
  withDefaults,
} from "../schemas/common.js";
import type { Place, PlacesSearchResponse } from "../types.js";

const API = "Places API (New)";

/** Flattens the Places API record into a compact, agent-friendly shape. */
function summarisePlace(place: Place): Record<string, unknown> {
  const openNow = place.currentOpeningHours?.openNow ?? place.regularOpeningHours?.openNow;
  return {
    place_id: place.id,
    name: place.displayName?.text,
    address: place.formattedAddress ?? place.shortFormattedAddress,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    rating: place.rating,
    review_count: place.userRatingCount,
    price_level: formatPriceLevel(place.priceLevel),
    category: place.primaryTypeDisplayName?.text,
    business_status: place.businessStatus,
    open_now: openNow,
    google_maps_url: place.googleMapsUri ?? (place.id ? googleMapsPlaceLink(place.id) : undefined),
  };
}

function renderPlaceList(title: string, places: Record<string, unknown>[]): string {
  const lines = [`# ${title}`, "", `${places.length} place(s) found.`, ""];
  for (const [index, place] of places.entries()) {
    lines.push(`## ${index + 1}. ${(place.name as string) ?? "Unnamed place"}`);
    if (place.category) lines.push(`- **Category**: ${place.category as string}`);
    if (place.address) lines.push(`- **Address**: ${place.address as string}`);

    const rating = formatRating(place.rating as number | undefined, place.review_count as number | undefined);
    if (rating) lines.push(`- **Rating**: ${rating}`);
    if (place.price_level) lines.push(`- **Price**: ${place.price_level as string}`);
    if (place.open_now !== undefined) {
      lines.push(`- **Open now**: ${place.open_now ? "yes" : "no"}`);
    }
    if (place.business_status && place.business_status !== "OPERATIONAL") {
      lines.push(`- **Status**: ${place.business_status as string}`);
    }
    if (place.latitude !== undefined) {
      lines.push(`- **Coordinates**: ${place.latitude}, ${place.longitude}`);
    }
    lines.push(`- **Place ID**: \`${(place.place_id as string) ?? "unknown"}\``);
    if (place.google_maps_url) lines.push(`- **Map**: ${place.google_maps_url as string}`);
    lines.push("");
  }
  lines.push("Call google_maps_place_details with a Place ID for phone number, website and opening hours.");
  return lines.join("\n");
}

export function registerPlacesTools(server: McpServer): void {
  server.registerTool(
    "google_maps_search_places",
    {
      title: "Search places by text",
      description: `Search for businesses and points of interest using a free-text query, optionally biased towards a location.

This is the tool for questions like "Italian restaurants near me", "pharmacy open now in Hamburg" or "EV charging on the A9".

Args:
  - query (string): What to look for, e.g. "vegan restaurant" or "Apotheke".
  - latitude (number, optional): Centre of the search bias.
  - longitude (number, optional): Centre of the search bias. Pass together with latitude.
  - radius_meters (number, optional): Bias radius, 1-50000 (default: 5000). Only used with coordinates.
  - open_now (boolean, optional): Only return places that are currently open.
  - min_rating (number, optional): Only return places rated at least this, 0.0-5.0.
  - max_results (number): How many places to return, 1-20 (default: 10).
  - language / region (string, optional): Result language and ccTLD bias.
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns:
  { "query": string, "count": number,
    "places": [ { "place_id": string, "name": string, "address": string,
                  "latitude": number, "longitude": number, "rating": number,
                  "review_count": number, "price_level": string, "category": string,
                  "open_now": boolean, "google_maps_url": string } ] }

Examples:
  - "Coffee near the Munich central station" -> query="coffee", latitude=48.1402, longitude=11.5600, radius_meters=800
  - "Which hardware stores are open right now in Cologne?" -> query="Baumarkt Köln", open_now=true
  - Don't use when: you want everything of one category within a radius (use google_maps_nearby_places).

Errors:
  - Returns "No places found" when the query matches nothing — broaden the query or drop open_now/min_rating.`,
      inputSchema: {
        query: z
          .string()
          .min(1, "Query must not be empty")
          .max(300, "Query must not exceed 300 characters")
          .describe("Free-text search, e.g. 'vegan restaurant' or 'Apotheke Notdienst'"),
        latitude: latitudeField.optional(),
        longitude: longitudeField.optional(),
        radius_meters: z
          .number()
          .int()
          .min(1)
          .max(50_000)
          .default(5_000)
          .describe("Bias radius around latitude/longitude in metres"),
        open_now: z.boolean().optional().describe("Only include places open at the time of the call"),
        min_rating: z
          .number()
          .min(0)
          .max(5)
          .optional()
          .describe("Only include places with at least this average rating"),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Maximum number of places to return"),
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

        if ((params.latitude === undefined) !== (params.longitude === undefined)) {
          return toolResult(
            "Error: latitude and longitude must be provided together. Pass both, or neither to search without a location bias.",
          );
        }

        const body: Record<string, unknown> = {
          textQuery: params.query,
          maxResultCount: params.max_results,
          ...(language ? { languageCode: language } : {}),
          ...(region ? { regionCode: region } : {}),
          ...(params.open_now !== undefined ? { openNow: params.open_now } : {}),
          ...(params.min_rating !== undefined ? { minRating: params.min_rating } : {}),
          ...(params.latitude !== undefined && params.longitude !== undefined
            ? {
                locationBias: {
                  circle: {
                    center: { latitude: params.latitude, longitude: params.longitude },
                    radius: params.radius_meters,
                  },
                },
              }
            : {}),
        };

        const data = await postModern<PlacesSearchResponse>(
          PLACES_TEXT_SEARCH_URL,
          body,
          PLACES_SEARCH_FIELD_MASK,
          API,
        );

        const places = (data.places ?? []).map(summarisePlace);
        if (places.length === 0) {
          return toolResult(
            `No places found for '${params.query}'. Broaden the query, increase radius_meters, or remove the open_now / min_rating filters.`,
            { query: params.query, count: 0, places: [] },
          );
        }

        const structured = { query: params.query, count: places.length, places };
        const text =
          params.response_format === ResponseFormat.JSON
            ? JSON.stringify(structured, null, 2)
            : renderPlaceList(`Places matching '${params.query}'`, places);
        return toolResult(text, structured);
      }),
  );

  server.registerTool(
    "google_maps_nearby_places",
    {
      title: "List nearby places by category",
      description: `List places of given categories within a radius around a coordinate, ranked by popularity or distance.

Use this when the question is categorical rather than textual: "what supermarkets are within 1 km?", "nearest petrol stations".

Args:
  - latitude (number): Centre of the search.
  - longitude (number): Centre of the search.
  - radius_meters (number): Search radius, 1-50000 (default: 1500).
  - included_types (string[], optional): Google place types such as "restaurant", "supermarket",
    "pharmacy", "gas_station", "atm", "hospital", "parking", "train_station", "cafe", "hotel".
    Omit to return all categories.
  - rank_by ("POPULARITY" | "DISTANCE"): Result ordering (default: "POPULARITY").
  - max_results (number): How many places to return, 1-20 (default: 10).
  - language / region (string, optional): Result language and ccTLD bias.
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns the same place records as google_maps_search_places.

Examples:
  - "Nearest pharmacy" -> latitude/longitude of the user, included_types=["pharmacy"], rank_by="DISTANCE", max_results=3
  - "Restaurants within 500 m" -> included_types=["restaurant"], radius_meters=500
  - Don't use when: you have a free-text query like "the best ramen" (use google_maps_search_places).

Errors:
  - Returns an error naming the offending value if a place type is not recognised by Google.`,
      inputSchema: {
        latitude: latitudeField,
        longitude: longitudeField,
        radius_meters: z
          .number()
          .int()
          .min(1)
          .max(50_000)
          .default(1_500)
          .describe("Search radius in metres"),
        included_types: z
          .array(z.string().min(1))
          .max(50)
          .optional()
          .describe("Google place types to include, e.g. ['restaurant', 'cafe']"),
        rank_by: z
          .enum(["POPULARITY", "DISTANCE"])
          .default("POPULARITY")
          .describe("Order results by popularity or by distance from the centre"),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Maximum number of places to return"),
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

        const body: Record<string, unknown> = {
          maxResultCount: params.max_results,
          rankPreference: params.rank_by,
          locationRestriction: {
            circle: {
              center: { latitude: params.latitude, longitude: params.longitude },
              radius: params.radius_meters,
            },
          },
          ...(params.included_types?.length ? { includedTypes: params.included_types } : {}),
          ...(language ? { languageCode: language } : {}),
          ...(region ? { regionCode: region } : {}),
        };

        const data = await postModern<PlacesSearchResponse>(
          PLACES_NEARBY_SEARCH_URL,
          body,
          PLACES_SEARCH_FIELD_MASK,
          API,
        );

        const places = (data.places ?? []).map(summarisePlace);
        const where = `${params.latitude}, ${params.longitude}`;
        if (places.length === 0) {
          return toolResult(
            `No places found within ${params.radius_meters} m of ${where}. Increase radius_meters or drop included_types.`,
            { latitude: params.latitude, longitude: params.longitude, count: 0, places: [] },
          );
        }

        const structured = {
          latitude: params.latitude,
          longitude: params.longitude,
          radius_meters: params.radius_meters,
          count: places.length,
          places,
        };
        const text =
          params.response_format === ResponseFormat.JSON
            ? JSON.stringify(structured, null, 2)
            : renderPlaceList(`Places within ${params.radius_meters} m of ${where}`, places);
        return toolResult(text, structured);
      }),
  );

  server.registerTool(
    "google_maps_place_details",
    {
      title: "Get details for a place",
      description: `Fetch the full profile of a single place: opening hours, phone number, website, description and recent reviews.

Call this after google_maps_search_places or google_maps_nearby_places, using the place_id from those results.

Args:
  - place_id (string): Google place id, e.g. "ChIJAVkDPzdOqEcRcDteW0YgIQQ".
  - include_reviews (boolean): Include up to five recent reviews (default: false).
  - language (string, optional): Result language, e.g. "de".
  - response_format ("markdown" | "json"): Output format (default: "markdown").

Returns:
  { "place_id": string, "name": string, "address": string, "latitude": number,
    "longitude": number, "rating": number, "review_count": number,
    "price_level": string, "category": string, "types": string[],
    "phone": string, "website": string, "google_maps_url": string,
    "open_now": boolean, "opening_hours": string[], "summary": string,
    "reviews": [ { "rating": number, "when": string, "author": string, "text": string } ] }

Examples:
  - "When does this restaurant close?" -> place_id from a previous search
  - "Phone number of the pharmacy you just found" -> place_id from that result
  - Don't use when: you do not have a place id yet (search first).

Errors:
  - Returns a not-found error if the place id is stale or came from a different Google API.`,
      inputSchema: {
        place_id: z
          .string()
          .min(1, "Place id must not be empty")
          .max(300)
          .describe("Google place id from a previous search result"),
        include_reviews: z
          .boolean()
          .default(false)
          .describe("Include up to five recent user reviews in the response"),
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
    async ({ place_id, include_reviews, language, response_format }) =>
      guarded(async () => {
        const defaults = withDefaults(language);
        const id = place_id.replace(/^places\//, "");

        const place = await getModern<Place>(
          `${PLACES_BASE_URL}/places/${encodeURIComponent(id)}`,
          { languageCode: defaults.language },
          PLACE_DETAILS_FIELD_MASK,
          API,
        );

        const hours =
          place.currentOpeningHours?.weekdayDescriptions ??
          place.regularOpeningHours?.weekdayDescriptions ??
          [];
        const reviews = include_reviews
          ? (place.reviews ?? []).slice(0, 5).map((review) => ({
              rating: review.rating,
              when: review.relativePublishTimeDescription,
              author: review.authorAttribution?.displayName,
              text: review.text?.text,
            }))
          : [];

        const structured: Record<string, unknown> = {
          ...summarisePlace(place),
          types: place.types,
          phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber,
          website: place.websiteUri,
          opening_hours: hours,
          summary: place.editorialSummary?.text,
          accessibility: place.accessibilityOptions,
          ...(include_reviews ? { reviews } : {}),
        };

        if (response_format === ResponseFormat.JSON) {
          return toolResult(JSON.stringify(structured, null, 2), structured);
        }

        const lines = [`# ${(structured.name as string) ?? "Place"}`, ""];
        if (structured.summary) lines.push(`${structured.summary as string}`, "");
        if (structured.category) lines.push(`- **Category**: ${structured.category as string}`);
        if (structured.address) lines.push(`- **Address**: ${structured.address as string}`);
        if (structured.phone) lines.push(`- **Phone**: ${structured.phone as string}`);
        if (structured.website) lines.push(`- **Website**: ${structured.website as string}`);

        const rating = formatRating(
          structured.rating as number | undefined,
          structured.review_count as number | undefined,
        );
        if (rating) lines.push(`- **Rating**: ${rating}`);
        if (structured.price_level) lines.push(`- **Price**: ${structured.price_level as string}`);
        if (structured.open_now !== undefined) {
          lines.push(`- **Open now**: ${structured.open_now ? "yes" : "no"}`);
        }
        if (structured.business_status && structured.business_status !== "OPERATIONAL") {
          lines.push(`- **Status**: ${structured.business_status as string}`);
        }
        if (structured.latitude !== undefined) {
          lines.push(`- **Coordinates**: ${structured.latitude}, ${structured.longitude}`);
        }
        if (structured.google_maps_url) {
          lines.push(`- **Map**: ${structured.google_maps_url as string}`);
        }

        if (hours.length) {
          lines.push("", "## Opening hours", ...hours.map((line) => `- ${line}`));
        }
        if (reviews.length) {
          lines.push("", "## Recent reviews");
          for (const review of reviews) {
            lines.push(
              `- **${review.rating ?? "?"} ★** by ${review.author ?? "anonymous"} (${review.when ?? "unknown date"}): ${
                review.text ? review.text.replace(/\s+/g, " ").slice(0, 400) : "no text"
              }`,
            );
          }
        }

        return toolResult(lines.join("\n"), structured);
      }),
  );
}
