#!/usr/bin/env node
/**
 * Google Maps MCP server.
 *
 * Two transports:
 *   stdio (default) — for Claude Code, Claude Desktop and other local clients.
 *   http            — streamable HTTP, for the Claude mobile and web apps.
 *
 * Select with TRANSPORT=stdio|http or the --http / --stdio flag.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { runHttp } from "./http.js";
import { createServer } from "./server.js";

const USAGE = `${SERVER_NAME} ${SERVER_VERSION}

Usage:
  google-maps-mcp-server [--stdio | --http]

Transports:
  --stdio   (default) Speak MCP over stdin/stdout, for local clients.
  --http    Serve streamable HTTP on $PORT (default 3000) at /mcp.

Environment:
  GOOGLE_MAPS_API_KEY  required  Google Maps Platform API key.
  TRANSPORT            optional  "stdio" or "http"; overridden by the flags above.
  PORT                 optional  HTTP port (default 3000).
  HOST                 optional  HTTP bind address (default 0.0.0.0).
  MCP_AUTH_TOKEN       optional  Shared secret for the HTTP transport.
  ALLOWED_ORIGINS      optional  Comma-separated Origin allowlist.
  DEFAULT_LANGUAGE     optional  Fallback result language, e.g. "de".
  DEFAULT_REGION       optional  Fallback ccTLD bias, e.g. "de".
`;

/** Warn loudly but do not exit: the key is only needed once a tool is called. */
function warnIfUnconfigured(): void {
  if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    console.error(
      "[warning] GOOGLE_MAPS_API_KEY is not set. The server will start, but every tool call will fail " +
        "until the key is configured.",
    );
  }
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout carries the protocol, so all logging goes to stderr.
  console.error(`[${SERVER_NAME}] stdio transport ready`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  warnIfUnconfigured();

  const transport = args.includes("--http")
    ? "http"
    : args.includes("--stdio")
      ? "stdio"
      : (process.env.TRANSPORT ?? "stdio").toLowerCase();

  if (transport === "http") {
    await runHttp();
  } else if (transport === "stdio") {
    await runStdio();
  } else {
    console.error(`Unknown transport '${transport}'. Use "stdio" or "http".`);
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  console.error("[fatal]", error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
