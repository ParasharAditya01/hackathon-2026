import { createServer } from "node:http";
import crypto from "node:crypto";
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
    "access-control-allow-methods": "GET, POST, OPTIONS",
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

  if (url.pathname === "/api/aid-batches" && request.method === "POST") {
    let body = ""; for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 16384) { sendJson(response,413,{error:"Request body is too large."},headers); return; } }
    let input; try { input=JSON.parse(body||"{}"); } catch { sendJson(response,400,{error:"Request body must be valid JSON."},headers); return; }
    const donor=typeof input.donor==="string"?input.donor.trim():"",name=typeof input.name==="string"?input.name.trim():"",type=input.type,quantity=Number(input.quantity);
    const pickupAt=new Date(input.pickupAt),deadline=new Date(input.deadline),location=typeof input.location==="string"?input.location.trim():"",handling=typeof input.handling==="string"?input.handling.trim():"";
    const types=new Set(["prepared","perishable","raw","medical","infant_formula","essential"]);
    if(!donor||donor.length>180||!name||name.length>180||!types.has(type)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100000||!Number.isFinite(pickupAt.getTime())||!Number.isFinite(deadline.getTime())||pickupAt>=deadline||deadline<=new Date()||!location||location.length>300||handling.length>500){sendJson(response,400,{error:"Check donor, batch name, aid type, quantity, pickup window, future safe-use deadline, location, and handling notes."},headers);return;}
    const client=await pool.connect();
    try{await client.query("BEGIN");const id="B-"+crypto.randomUUID().replaceAll("-","").slice(0,5).toUpperCase();
      await client.query(`INSERT INTO aid_batches (id,donor,name,aid_type,original_quantity,available_quantity,reserved_quantity,picked_quantity,delivered_quantity,rejected_quantity,pickup_at,safe_use_deadline,location,handling_notes) VALUES ($1,$2,$3,$4,$5,$5,0,0,0,0,$6,$7,$8,$9)`,[id,donor,name,type,quantity,pickupAt.toISOString(),deadline.toISOString(),location,handling]);
      const saved=await client.query("INSERT INTO submission_confirmations (action,reference_id) VALUES ($1,$2) RETURNING token",["aid_batch_registered",id]);await client.query("COMMIT");
      sendJson(response,201,{status:"confirmed",token:saved.rows[0].token,batch:{id,donor,name,type,quantity,pickupAt:pickupAt.toISOString(),deadline:deadline.toISOString(),location,handling}},headers);
    }catch(error){await client.query("ROLLBACK").catch(()=>{});if(error.code==="23505")sendJson(response,409,{error:"A conflicting batch reference was generated. Please retry."},headers);else{console.error("Aid batch registration failed:",error.message);sendJson(response,500,{error:"The batch could not be saved. Your entries have not been confirmed."},headers);}}finally{client.release();}return;
  }
  const confirmationMatch = url.pathname.match(/^\/api\/confirmations\/([0-9a-f-]{36})$/i);
  if(confirmationMatch&&request.method==="GET"){try{const result=await pool.query("SELECT action,reference_id FROM submission_confirmations WHERE token=$1 AND created_at>NOW()-INTERVAL '24 hours'",[confirmationMatch[1]]);const record=result.rows[0];if(!record||record.action!=="aid_batch_registered"){sendJson(response,404,{status:"unverified",error:"No valid recent confirmation was found."},headers);return;}sendJson(response,200,{status:"confirmed",actionLabel:"Aid batch registration",reference:record.reference_id},headers);}catch(error){console.error("Confirmation verification failed:",error.message);sendJson(response,503,{status:"unverified",error:"Confirmation service is temporarily unavailable."},headers);}return;}
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
  if (!["GET", "POST", "OPTIONS"].includes(request.method || "")) {
    sendJson(response, 405, { error: "Method not allowed." }, {
      allow: "GET, POST, OPTIONS",
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
