import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || "10000", 10);
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Configure it in the hosting provider's private environment settings.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.parseInt(process.env.PG_POOL_MAX || "10", 10),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  ...(process.env.DATABASE_SSL === "true"
    ? { ssl: { rejectUnauthorized: true } }
    : {}),
});

pool.on("error", (error) => {
  // Never print connection strings or credentials.
  console.error("Unexpected idle PostgreSQL client error:", error.message);
});

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

async function route(request, response) {
  const headers = corsHeaders(request);
  const url = new URL(request.url || "/", "http://localhost");

  if (request.method === "OPTIONS") {
    if (request.headers.origin && !allowedOrigins.has(request.headers.origin)) {
      sendJson(response, 403, { error: "Origin is not allowed." });
      return;
    }
    response.writeHead(204, headers);
    response.end();
    return;
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { status: "ok", service: "aidflow-api" }, headers);
    return;
  }

  if (url.pathname === "/api/ready" && request.method === "GET") {
    try {
      await pool.query("SELECT 1");
      sendJson(response, 200, { status: "ready", database: "connected" }, headers);
    } catch {
      sendJson(response, 503, { status: "not_ready", database: "unavailable" }, headers);
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    response.setHeader("allow", "GET, OPTIONS");
    sendJson(response, 404, { error: "API route not found." }, headers);
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

const server = createServer((request, response) => {
  // Reject unsupported methods before routing; no state-changing route is public.
  if (!["GET", "OPTIONS"].includes(request.method || "")) {
    sendJson(response, 405, { error: "Method not allowed." }, {
      allow: "GET, OPTIONS",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    return;
  }
  route(request, response).catch((error) => {
    console.error("API request failed:", error.message);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error." });
    else response.destroy();
  });
});

async function start() {
  // Apply idempotent DDL before declaring the service ready.
  const schema = await readFile(path.join(here, "schema.sql"), "utf8");
  await pool.query(schema);
  await pool.query("SELECT 1");
  server.listen(port, "0.0.0.0", () => {
    console.log(`AidFlow API listening on port ${port}`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down gracefully.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch(async (error) => {
  console.error("AidFlow API failed to start:", error.message);
  await pool.end();
  process.exit(1);
});
