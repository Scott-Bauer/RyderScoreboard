// netlify/functions/data.js
// CommonJS-style Netlify Function using @neondatabase/serverless
// Make sure you have DATABASE_URL set in Netlify Environment Variables.

const { Client } = require('@neondatabase/serverless');

const connString = process.env.NETLIFY_DATABASE_URL;
if (!connString) {
  console.error('Missing DATABASE_URL environment variable');
}

function getClient() {
  return new Client({ connectionString: connString });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const client = getClient();

  try {
    await client.connect();

    if (method === 'GET') {
      // GET /.netlify/functions/data?key=your-key
      const key = (event.queryStringParameters && event.queryStringParameters.key) || 'default';
      const res = await client.query('SELECT payload FROM app_data WHERE key = $1', [key]);

      if (res.rowCount === 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(res.rows[0].payload)
      };
    }

    if (method === 'PUT') {
      // PUT /.netlify/functions/data
      // body: { "key": "golf-2025-08-15", "payload": { ... } }
      let body = {};
      try {
        body = JSON.parse(event.body || '{}');
      } catch (e) {
        return { statusCode: 400, body: 'Invalid JSON body' };
      }

      const key = body.key || 'default';
      const payload = body.payload ?? {};

      // Upsert into app_data (key primary)
      await client.query(
        `INSERT INTO app_data (key, payload, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        [key, payload]
      );

      return { statusCode: 204, body: '' };
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  } finally {
    try { await client.end(); } catch (e) { /* ignore close errors */ }
  }
};
