/** Shared constants for the Google Maps MCP server. */

export const SERVER_NAME = "google-maps-mcp-server";
export const SERVER_VERSION = "1.0.0";

/** Maximum number of characters any single tool response may contain. */
export const CHARACTER_LIMIT = 25_000;

/** Timeout for a single Google Maps Platform request. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Largest static map image we are willing to inline into a response. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// --- Google Maps Platform endpoints -----------------------------------------
// Geocoding, Static Maps, Elevation and Time Zone still use the classic
// maps.googleapis.com endpoints. Places and Routes use the current
// ("New") APIs, which are the only ones available to new Google Cloud
// projects since March 2025.

export const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
export const ELEVATION_URL = "https://maps.googleapis.com/maps/api/elevation/json";
export const TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";
export const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";

export const PLACES_BASE_URL = "https://places.googleapis.com/v1";
export const PLACES_TEXT_SEARCH_URL = `${PLACES_BASE_URL}/places:searchText`;
export const PLACES_NEARBY_SEARCH_URL = `${PLACES_BASE_URL}/places:searchNearby`;

export const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
export const ROUTE_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

/** Field masks keep responses small — Google bills Places by the fields requested. */
export const PLACES_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "places.currentOpeningHours.openNow",
  "places.googleMapsUri",
].join(",");

export const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "businessStatus",
  "primaryTypeDisplayName",
  "types",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "regularOpeningHours",
  "currentOpeningHours",
  "editorialSummary",
  "accessibilityOptions",
  "reviews",
].join(",");

export const ROUTES_FIELD_MASK_BASE = [
  "routes.duration",
  "routes.staticDuration",
  "routes.distanceMeters",
  "routes.description",
  "routes.warnings",
  "routes.travelAdvisory",
  "routes.legs.duration",
  "routes.legs.distanceMeters",
  "routes.legs.startLocation",
  "routes.legs.endLocation",
].join(",");

export const ROUTES_FIELD_MASK_STEPS = [
  "routes.legs.steps.navigationInstruction",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.transitDetails",
].join(",");

export const ROUTES_FIELD_MASK_POLYLINE = "routes.polyline.encodedPolyline";

export const ROUTE_MATRIX_FIELD_MASK = [
  "originIndex",
  "destinationIndex",
  "duration",
  "distanceMeters",
  "status",
  "condition",
].join(",");

/** Human-facing deep link to Google Maps for a coordinate pair. */
export function googleMapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** Human-facing deep link to Google Maps for a place id. */
export function googleMapsPlaceLink(placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
}
