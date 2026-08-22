/** Renders a map image, backed by the Maps Static API. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MAX_IMAGE_BYTES, STATIC_MAP_URL } from "../constants.js";
import { GoogleMapsError, getBinary } from "../services/googleClient.js";
import { errorResult } from "../services/format.js";
import { languageField, regionField, withDefaults } from "../schemas/common.js";

const API = "Maps Static API";

const MARKER_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function registerStaticMapTool(server: McpServer): void {
  server.registerTool(
    "google_maps_static_map",
    {
      title: "Render a map image",
      description: `Render a map as an image and return it inline, so the user can actually see the location.

This is the tool to reach for whenever showing beats describing: pinning a meeting point, illustrating a route, or giving someone on a phone a picture of where they are.

Args:
  - center (string, optional): Map centre — an address or a "lat,lng" pair. May be omitted when
    markers or path_polyline are given; Google then frames the content automatically.
  - zoom (number, optional): 0 (whole world) to 21 (building level). Typical: 12 city, 15 district, 17 street.
    Omit together with center to auto-fit.
  - markers (string[], optional): Up to 10 places to pin, as addresses or "lat,lng" pairs.
    They are labelled A, B, C … in the given order.
  - path_polyline (string, optional): An encoded polyline to draw, as returned by
    google_maps_directions with include_polyline=true.
  - width / height (number): Image size in pixels, 100-640 each (default: 640 x 480).
  - scale (1 | 2): 2 doubles the pixel density for a sharper image (default: 1).
  - map_type ("roadmap" | "satellite" | "terrain" | "hybrid"): Map style (default: "roadmap").
  - language / region (string, optional): Label language and ccTLD bias.

Returns: a PNG image content block. There is no text payload — describe the image to the user yourself.

Examples:
  - "Show me where the hotel is" -> markers=["Hotel Adlon, Berlin"], zoom=16
  - "Map of both offices" -> markers=["Office A address", "Office B address"] and no center/zoom
  - "Draw the route" -> path_polyline from google_maps_directions
  - Don't use when: the user needs an address or coordinates as text (use the geocoding tools).

Errors:
  - Returns an error if neither center nor markers nor path_polyline is given — there would be nothing to show.
  - Returns an error if the rendered image exceeds 4 MB.`,
      inputSchema: {
        center: z
          .string()
          .min(1)
          .max(300)
          .optional()
          .describe("Map centre as an address or 'lat,lng' pair"),
        zoom: z
          .number()
          .int()
          .min(0)
          .max(21)
          .optional()
          .describe("Zoom level, 0 (world) to 21 (building)"),
        markers: z
          .array(z.string().min(1).max(300))
          .max(10, "At most 10 markers are supported")
          .optional()
          .describe("Places to pin, labelled A, B, C … in order"),
        path_polyline: z
          .string()
          .min(1)
          .max(20_000)
          .optional()
          .describe("Encoded polyline to draw on the map"),
        width: z.number().int().min(100).max(640).default(640).describe("Image width in pixels"),
        height: z.number().int().min(100).max(640).default(480).describe("Image height in pixels"),
        scale: z
          .union([z.literal(1), z.literal(2)])
          .default(1)
          .describe("Pixel density multiplier; 2 renders a sharper image"),
        map_type: z
          .enum(["roadmap", "satellite", "terrain", "hybrid"])
          .default("roadmap")
          .describe("Visual style of the map"),
        language: languageField,
        region: regionField,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params): Promise<CallToolResult> => {
      try {
        if (!params.center && !params.markers?.length && !params.path_polyline) {
          throw new GoogleMapsError(
            "Nothing to render.",
            "Provide 'center', at least one entry in 'markers', or a 'path_polyline'.",
          );
        }

        const { language, region } = withDefaults(params.language, params.region);

        const markerParams = (params.markers ?? []).map(
          (location, index) =>
            `color:red|label:${MARKER_LABELS[index % MARKER_LABELS.length]}|${location}`,
        );

        const { bytes, mimeType } = await getBinary(
          STATIC_MAP_URL,
          {
            center: params.center,
            zoom: params.zoom,
            size: `${params.width}x${params.height}`,
            scale: params.scale,
            maptype: params.map_type,
            markers: markerParams.length ? markerParams : undefined,
            path: params.path_polyline ? `color:0x0066ffcc|weight:5|enc:${params.path_polyline}` : undefined,
            language,
            region,
            format: "png",
          },
          API,
        );

        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          throw new GoogleMapsError(
            `The rendered map is ${(bytes.byteLength / 1_048_576).toFixed(1)} MB, above the ${
              MAX_IMAGE_BYTES / 1_048_576
            } MB limit.`,
            "Reduce 'scale', 'width' or 'height'.",
          );
        }

        return {
          content: [
            {
              type: "image",
              data: bytes.toString("base64"),
              mimeType,
            },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
