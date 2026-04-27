const { Pool } = require("pg");

// Parse the DATABASE_URL and force IPv4
const databaseUrl = process.env.DATABASE_URL;

const fixedUrl = databaseUrl?.replace(/\[::\]/g, "127.0.0.1");

const pool = new Pool({
  connectionString: fixedUrl,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,

  family: 4,
});

pool.on("connect", () => {
  console.log(" Database connected successfully");
});

pool.on("error", (err) => {
  console.error("❌ Database error:", err.message);
});

module.exports = pool;
