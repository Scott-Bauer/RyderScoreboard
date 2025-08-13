
// netlify/functions/data.js
export async function handler(event) {
  const connString = process.env.NETLIFY_DATABASE_URL;
  
  if (!connString) {
    console.error("Missing DATABASE_URL environment variable");
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "Database configuration missing" }) 
    };
  }

  const method = event.httpMethod;
  
  try {
    // Import pg dynamically
    const { Client } = await import('pg');
    const client = new Client({ 
      connectionString: connString,
      ssl: { rejectUnauthorized: false }
    });
    
    await client.connect();
    console.log("Database connected successfully");

    if (method === "GET") {
      const key = (event.queryStringParameters && event.queryStringParameters.key) || "default";
      console.log("GET request for key:", key);
      
      const res = await client.query(
        "SELECT payload FROM app_data WHERE key = $1",
        [key]
      );
      
      await client.end();
      
      if (res.rowCount === 0) {
        console.log("No data found for key:", key);
        return { 
          statusCode: 200, 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}) 
        };
      }
      
      console.log("Data found for key:", key);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(res.rows[0].payload)
      };
    }

    if (method === "PUT") {
      console.log("PUT request received");
      
      if (!event.body) {
        await client.end();
        return { 
          statusCode: 400, 
          body: JSON.stringify({ error: "No body provided" }) 
        };
      }

      let body;
      try {
        body = JSON.parse(event.body);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        await client.end();
        return { 
          statusCode: 400, 
          body: JSON.stringify({ error: "Invalid JSON in request body" }) 
        };
      }

      const key = body.key || "default";
      const payload = body.payload || {};
      
      console.log("Saving data for key:", key);

      await client.query(
        `INSERT INTO app_data (key, payload, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        [key, JSON.stringify(payload)]
      );
      
      await client.end();
      console.log("Data saved successfully");
      
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true }) 
      };
    }

    await client.end();
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: "Method not allowed" }) 
    };

  } catch (err) {
    console.error("Function error:", err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: "Internal server error", 
        details: err.message 
      }) 
    };
  }
}
