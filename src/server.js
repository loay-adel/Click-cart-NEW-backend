require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ApolloServer } = require("apollo-server-express");
const jwt = require("jsonwebtoken");
const typeDefs = require("./schemas/typeDefs");
const resolvers = require("./resolvers/resolvers");
const db = require("./config/database");
const paymob = require("./services/paymobService");

const app = express();
app.use(cors());
app.use(express.json());

// Webhook endpoint for Paymob callbacks
app.post("/webhook/paymob", async (req, res) => {
  try {
    const { hmac, obj } = req.body;

    // Verify HMAC signature
    const isValid = paymob.verifyHmac(obj, hmac);

    if (!isValid) {
      console.error("Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Parse payment data
    const paymentData = JSON.parse(obj);
    const { order_id, transaction_id, success, amount_cents } = paymentData;

    if (success) {
      // Update order status
      await db.query(
        `UPDATE orders 
         SET is_paid = true, 
             paid_at = NOW(),
             transaction_id = $1
         WHERE id = $2`,
        [transaction_id, order_id],
      );

      console.log(`✅ Payment successful for order ${order_id}`);
    } else {
      console.log(`❌ Payment failed for order ${order_id}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Authentication middleware for context
const getUser = async (token) => {
  try {
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
      const { rows } = await db.query(
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
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      const token = req.headers.authorization || "";
      const user = await getUser(token.replace("Bearer ", ""));
      return { user };
    },
  });

  await server.start();
  server.applyMiddleware({ app });

  const PORT = process.env.PORT || 5000;

  const serverInstance = app.listen(PORT, () => {
    console.log(
      `🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`,
    );
    console.log(`💳 Paymob webhook: http://localhost:${PORT}/webhook/paymob`);
    console.log(`❤️ Health check: http://localhost:${PORT}/health`);
  });

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
