/** Builds a fully configured McpServer instance. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerGeocodingTools } from "./tools/geocoding.js";
import { registerPlacesTools } from "./tools/places.js";
import { registerRoutesTools } from "./tools/routes.js";
import { registerStaticMapTool } from "./tools/staticMap.js";
import { registerTerrainTools } from "./tools/terrain.js";

const INSTRUCTIONS = `Google Maps Platform access.

Typical flow: turn a name or address into coordinates with google_maps_geocode, find
businesses with google_maps_search_places or google_maps_nearby_places, get opening hours
and phone numbers with google_maps_place_details, and plan the trip with
google_maps_directions. Use google_maps_static_map whenever a picture of the location helps
more than a description — it returns a real map image.

Coordinates are always decimal degrees, latitude first. Distances are metres and durations
are seconds unless a field name says otherwise.`;

/**
 * A fresh server per HTTP request keeps the stateless transport free of
 * cross-request state, so this is called once per connection.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerGeocodingTools(server);
  registerPlacesTools(server);
  registerRoutesTools(server);
  registerStaticMapTool(server);
  registerTerrainTools(server);

  return server;
}
