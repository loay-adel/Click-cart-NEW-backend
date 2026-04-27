const jwt = require("jsonwebtoken");

// Verify JWT token from request headers
const verifyToken = (token) => {
  try {
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    return decoded;
  } catch (error) {
    return null;
  }
};

// Middleware to protect GraphQL resolvers
const authMiddleware = (resolver) => {
  return async (parent, args, context, info) => {
    const token = context.token || context.req?.headers?.authorization?.replace("Bearer ", "");
    
    if (!token) {
      throw new Error("Authentication required");
    }
    
    const user = verifyToken(token);
    if (!user) {
      throw new Error("Invalid or expired token");
    }
    
    context.user = user;
    return resolver(parent, args, context, info);
  };
};

// Role-based authorization
const requireRole = (roles) => (resolver) => {
  return async (parent, args, context, info) => {
    const user = context.user;
    
    if (!user) {
      throw new Error("Authentication required");
    }
    
    if (!roles.includes(user.role)) {
      throw new Error(`Access denied. Required role: ${roles.join(" or ")}`);
    }
    
    return resolver(parent, args, context, info);
  };
};

module.exports = { verifyToken, authMiddleware, requireRole };
