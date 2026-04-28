const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");
const { ApolloServer } = require("apollo-server-express");
const jwt = require("jsonwebtoken");
const typeDefs = require("../../../src/schemas/typeDefs");
const resolvers = require("../../../src/resolvers/resolvers");
const { pool } = require("../../../src/config/database");

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
      const { rows } = await pool.query(
        "SELECT id, first_name, last_name, email, role FROM users WHERE id = $1",
        [decoded.id]
      );
      return rows[0];
    }
    return null;
  } catch (error) {
    console.error("Auth error:", error.message);
    return null;
  }
};

// Create Apollo Server
let apolloServer;
async function startApolloServer() {
  if (!apolloServer) {
    apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      context: async ({ req }) => {
        const token = req.headers.authorization || "";
        const user = await getUser(token.replace("Bearer ", ""));
        return { user, db: pool };
      },
      introspection: true,
      formatError: (error) => {
        console.error("GraphQL Error:", error);
        return {
          message: error.message,
          path: error.path,
        };
      },
    });
    await apolloServer.start();
    apolloServer.applyMiddleware({ app, path: "/graphql" });
  }
}

// Handler wrapper
const handler = async (event, context) => {
  // Ensure database connection is alive
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    console.error("Database connection error:", error.message);
  }
  
  await startApolloServer();
  const handlerFunc = serverless(app);
  return handlerFunc(event, context);
};

exports.handler = handler;
