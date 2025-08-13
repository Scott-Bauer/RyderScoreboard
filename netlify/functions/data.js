// netlify/functions/data.js
import { Client } from "@neondatabase/serverless"; // serverless Postgres driver
// If you prefer using 'pg', follow Neon docs to override pg with @neondatabase/serverless

const connString = process.env.DATABASE_URL;
if (!connString) throw new Error("Missing DATABASE_URL env var");

export async function handler(event) {
  // Route: GET?key=xxx  OR  PUT with JSON body { key: "...", payload: {...} }
  const method = event.httpMethod;
  const client = new Client({ connectionString: connString });

  try {
    await client.connect();

    if (method === "GET") {
      const key = (event.queryStringParameters && event.queryStringParameters.key) || "default";
      const res = await client.query(
        "SELECT payload FROM app_data WHERE key = $1",
        [key]
      );
      if (res.rowCount === 0) {
        return { statusCode: 200, body: JSON.stringify({}) };
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(res.rows[0].payload)
      };
    }

    if (method === "PUT") {
      // expecting raw JSON body: { key: "golf-2025-08", payload: { ... } }
      const body = JSON.parse(event.body || "{}");
      const key = body.key || "default";
      const payload = body.payload || {};

      // upsert
      await client.query(
        `INSERT INTO app_data (key, payload, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        [key, payload]
      );

      return { statusCode: 204, body: "" };
    }

    return { statusCode: 405, body: "Method not allowed" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  } finally {
    // Important: close client each invocation (serverless-friendly)
    try { await client.end(); } catch (e) {}
  }
}
