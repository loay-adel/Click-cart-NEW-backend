const { Pool } = require("pg");

// Configure for Netlify Functions
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase
  },
  max: 1, // Netlify functions are single-threaded
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Keep connection alive
  keepAlive: true,
});

// Log connection events
pool.on('connect', () => {
  console.log('✅ Database connected');
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err.message);
});

// Ensure connection is established
const ensureConnection = async () => {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
};

module.exports = { pool, ensureConnection };
