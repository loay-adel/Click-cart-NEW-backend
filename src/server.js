require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ApolloServer } = require("apollo-server-express");
const jwt = require("jsonwebtoken");
const typeDefs = require("./schemas/typeDefs");
const resolvers = require("./resolvers/resolvers");
const { pool, ensureConnection } = require("./config/database");
const paymob = require("./services/paymobService");
const logger = require("./utils/logger");
const { authRateLimit, apiRateLimit } = require("./middleware/rateLimit");
const path = require("path");
// Validate critical environment variables
const requiredEnvVars = [
  "DATABASE_URL",
  "JWT_SECRET",
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_HMAC_SECRET",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

// Raw body for webhook verification (must be before express.json())
app.use("/webhook/paymob", express.raw({ type: "application/json" }));

// Regular JSON parsing for other routes
app.use(express.json());

// Rate limiting
app.use("/graphql", apiRateLimit);
app.use("/webhook", apiRateLimit);

// Webhook endpoint for Paymob callbacks
app.post("/webhook/paymob", async (req, res) => {
  try {
    const rawBody = req.body.toString();
    const payload = JSON.parse(rawBody);
    const { hmac, obj } = payload;

    if (!hmac || !obj) {
      logger.warn("Webhook missing hmac or obj");
      return res.status(400).json({ error: "Invalid payload structure" });
    }

    // Verify HMAC signature
    const isValid = paymob.verifyHmac(obj, hmac);
    if (!isValid) {
      logger.error("Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Validate order_id
    const orderId = parseInt(obj.order_id || obj.merchant_order_id);
    if (!orderId || isNaN(orderId)) {
      logger.warn("Webhook invalid order_id:", obj.order_id);
      return res.status(400).json({ error: "Invalid order ID" });
    }

    // Verify order exists
    const orderCheck = await pool.query(
      "SELECT id, status FROM orders WHERE id = $1 AND deleted_at IS NULL",
      [orderId],
    );

    if (orderCheck.rows.length === 0) {
      logger.warn("Webhook order not found:", orderId);
      return res.status(404).json({ error: "Order not found" });
    }

    if (obj.success === true || obj.success === "true") {
      await pool.query(
        `UPDATE orders 
         SET status = 'paid', is_paid = true, paid_at = NOW(), transaction_id = $1
         WHERE id = $2 AND deleted_at IS NULL`,
        [obj.id || obj.transaction_id, orderId],
      );
      logger.info(
        `✅ Payment successful for order ${orderId}, transaction ${obj.id}`,
      );
    } else {
      logger.info(`❌ Payment failed for order ${orderId}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error("Webhook error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const dbHealthy = await ensureConnection();
    if (!dbHealthy) {
      return res.status(503).json({
        status: "ERROR",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      });
    }
    res.status(200).json({
      status: "OK",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "ERROR",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Authentication middleware for context
const getUser = async (token) => {
  try {
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await pool.query(
        "SELECT id, first_name, last_name, email, role FROM users WHERE id = $1",
        [decoded.id],
      );
      return rows[0];
    }
    return null;
  } catch (error) {
    return null;
  }
};

async function startServer() {
  // Ensure database is reachable before starting
  const dbHealthy = await ensureConnection();
  if (!dbHealthy) {
    console.error("❌ Cannot start server: Database unreachable");
    process.exit(1);
  }

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace("Bearer ", "");
      const user = await getUser(token);
      return { user, token, req };
    },
    formatError: (error) => {
      // Don't leak internal errors in production
      if (process.env.NODE_ENV === "production") {
        if (
          error.message.includes("Database") ||
          error.message.includes("pool")
        ) {
          logger.error("GraphQL error:", error);
          return new Error("Internal server error");
        }
      }
      return error;
    },
    introspection: process.env.NODE_ENV !== "production",
    playground: process.env.NODE_ENV !== "production",
  });

  await server.start();
  server.applyMiddleware({ app });

  const PORT = process.env.PORT || 5000;

  const serverInstance = app.listen(PORT, () => {
    console.log(
      `🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`,
    );
    console.log(`💳 Paymob webhook: http://localhost:${PORT}/webhook/paymob`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    serverInstance.close(async () => {
      console.log("HTTP server closed");
      await pool.end();
      console.log("Database pool closed");
      process.exit(0);
    });

    // Force shutdown after 30s
    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  serverInstance.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${PORT} is already in use. Try: PORT=5001 npm start`,
      );
      process.exit(1);
    }
  });
}

startServer();
