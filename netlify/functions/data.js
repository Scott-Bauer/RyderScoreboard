// netlify/functions/data.js
// Safe Netlify Function using @neondatabase/serverless
// Make sure DATABASE_URL is set in Netlify Environment Variables

const { Client } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const connString = process.env.DATABASE_URL;

  if (!connString) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing DATABASE_URL environment variable' })
    };
  }

  const client = new Client({ connectionString: connString });

  try {
    // Connect to DB with safe try/catch
    try {
      await client.connect();
    } catch (err) {
      console.error('Failed to connect to database:', err);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Database connection failed' })
      };
    }

    const method = event.httpMethod;

    // GET request: load data by key
    if (method === 'GET') {
      const key = event.queryStringParameters?.key || 'default';

      let res;
      try {
        res = await client.query('SELECT payload FROM app_data WHERE key = $1', [key]);
      } catch (err) {
        console.error('DB query failed:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'DB query failed' }) };
      }

      const payload = res.rowCount > 0 ? res.rows[0].payload : {};
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
    }

    // PUT request: save/update data
    if (method === 'PUT') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (err) {
        return { statusCode: 400, body: 'Invalid JSON body' };
      }

      const key = body.key || 'default';
      const payload = body.payload ?? {};

      try {
        await client.query(
          `INSERT INTO app_data (key, payload, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
          [key, payload]
        );
      } catch (err) {
        console.error('Failed to upsert data:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save data' }) };
      }

      return { statusCode: 204, body: '' };
    }

    // Method not allowed
    return { statusCode: 405, body: 'Method not allowed' };

  } catch (err) {
    // Catch any unexpected errors
    console.error('Unexpected function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected server error' }) };
  } finally {
    // Ensure client is closed
    try {
      await client.end();
    } catch (err) {
      console.warn('Failed to close client:', err);
    }
  }
};
