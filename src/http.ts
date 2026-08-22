/**
 * Streamable HTTP transport.
 *
 * This is the mode the Claude mobile and web apps use: they speak MCP over
 * HTTPS to a public URL, so the server runs stateless (a new transport and a
 * new McpServer per request) and is protected by a shared secret.
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type NextFunction, type Request, type Response } from "express";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { createServer } from "./server.js";

/** JSON-RPC error body for requests rejected before they reach the SDK. */
function rpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/** Constant-time-ish comparison so the token cannot be probed by timing. */
function tokensMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * Accepts the shared secret either as a bearer token or as a trailing path
 * segment. Clients that cannot set custom headers — the Claude connector UI
 * among them — can then still authenticate via the URL.
 */
function makeAuthMiddleware(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!token) {
      next();
      return;
    }

    const header = req.header("authorization") ?? "";
    const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const fromPath = typeof req.params.token === "string" ? req.params.token : "";

    if ((bearer && tokensMatch(token, bearer)) || (fromPath && tokensMatch(token, fromPath))) {
      next();
      return;
    }

    // Deliberately no WWW-Authenticate header: this server implements a shared
    // secret, not OAuth, and advertising Bearer would send spec-compliant MCP
    // clients into an authorization-server discovery loop that cannot succeed.
    rpcError(
      res,
      401,
      -32001,
      "Unauthorized: pass MCP_AUTH_TOKEN as an 'Authorization: Bearer <token>' header or as the last URL path segment (/mcp/<token>).",
    );
  };
}

/**
 * DNS-rebinding protection: reject browser origins we do not know. Requests
 * without an Origin header (native clients, curl) are always allowed.
 */
function makeOriginMiddleware(allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header("origin");
    if (!origin) {
      next();
      return;
    }
    if (allowed.length === 0 || allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      next();
      return;
    }
    rpcError(res, 403, -32001, `Forbidden origin: ${origin}`);
  };
}

async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  // Stateless mode: one transport and one server per request. This avoids
  // request-id collisions between concurrent clients and lets the process be
  // scaled horizontally without sticky sessions.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createServer();

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[mcp] request failed:", error);
    if (!res.headersSent) {
      rpcError(res, 500, -32603, "Internal server error");
    }
  }
}

export async function runHttp(): Promise<void> {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "4mb" }));

  const token = process.env.MCP_AUTH_TOKEN?.trim() || undefined;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const requireAuth = makeAuthMiddleware(token);
  const checkOrigin = makeOriginMiddleware(allowedOrigins);

  // Both spellings: bare /mcp for clients that send an Authorization header,
  // and /mcp/<token> for clients that can only be given a URL.
  const MCP_PATHS = ["/mcp", "/mcp/:token"];

  app.options(MCP_PATHS, checkOrigin, (_req, res) => {
    res.sendStatus(204);
  });

  app.get("/healthz", (_req, res) => {
    res.json({
      status: "ok",
      server: SERVER_NAME,
      version: SERVER_VERSION,
      api_key_configured: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
      auth_required: Boolean(token),
    });
  });

  app.post(MCP_PATHS, checkOrigin, requireAuth, handleMcpRequest);

  // The stateless transport has no server-initiated stream to attach to, but
  // some clients probe with GET before posting; answer explicitly rather than
  // letting them see a 404.
  app.get(MCP_PATHS, checkOrigin, requireAuth, (_req, res) => {
    rpcError(res, 405, -32000, "This server is stateless; use POST for MCP requests.");
  });

  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  await new Promise<void>((resolve) => {
    app.listen(port, host, () => {
      console.error(`[${SERVER_NAME}] streamable HTTP transport on http://${host}:${port}/mcp`);
      if (!token) {
        console.error(
          "[warning] MCP_AUTH_TOKEN is not set — anyone who can reach this URL can spend your Google Maps quota.",
        );
      }
      resolve();
    });
  });
}
