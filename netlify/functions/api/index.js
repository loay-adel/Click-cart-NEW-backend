const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");
const { ApolloServer } = require("apollo-server-express");
const jwt = require("jsonwebtoken");
const typeDefs = require("../../../src/schemas/typeDefs");
const resolvers = require("../../../src/resolvers/resolvers");
const db = require("../../../src/config/database");
const paymob = require("../../../src/services/paymobService");

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Paymob webhook endpoint
app.post("/webhook/paymob", async (req, res) => {
  try {
    const { hmac, obj } = req.body;
    const isValid = paymob.verifyHmac(obj, hmac);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid signature" });
    }
    const paymentData = JSON.parse(obj);
    const { order_id, transaction_id, success } = paymentData;
    if (success) {
      await db.query(
        `UPDATE orders SET is_paid = true, paid_at = NOW(), transaction_id = $1 WHERE id = $2`,
        [transaction_id, order_id]
      );
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Authentication middleware
const getUser = async (token) => {
  try {
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
      const { rows } = await db.query(
        "SELECT id, first_name, last_name, email, role FROM users WHERE id = $1",
        [decoded.id]
      );
      return rows[0];
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Setup Apollo Server
let server;
async function setupApollo() {
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      const token = req.headers.authorization || "";
      const user = await getUser(token.replace("Bearer ", ""));
      return { user };
    },
    introspection: true,
    playground: true,
  });
  await apolloServer.start();
  apolloServer.applyMiddleware({ app, path: "/graphql" });
}

// Initialize Apollo before handling requests
setupApollo();

// Export the handler for Netlify
exports.handler = serverless(app);
