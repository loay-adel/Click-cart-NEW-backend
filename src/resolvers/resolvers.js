const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const paymob = require("../services/paymobService");
const { pool } = require("../config/database");

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET || "your_super_secret_key_change_this";
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: "7d" }
  );
};

const paginate = (rows, limit, offset, total) => {
  return {
    products: rows,
    total: parseInt(total),
    page: Math.floor(offset / limit) + 1,
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit)
  };
};

const resolvers = {
  Query: {
    products: async (_, { limit = 10, offset = 0 }) => {
      try {
        console.log("Fetching products...");
        
        const countResult = await pool.query("SELECT COUNT(*) FROM products");
        const total = countResult.rows[0].count;
        
        const { rows } = await pool.query(
          `SELECT id, title, description, price, category, thumbnail, rating, 
                  available_quantity as "availableQuantity", discount,
                  created_at as "createdAt", updated_at as "updatedAt" 
           FROM products ORDER BY id LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        
        console.log(`Found ${rows.length} products`);
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in products:", error.message);
        throw new Error("Failed to fetch products: " + error.message);
      }
    },
    
    product: async (_, { id }) => {
      try {
        const { rows } = await pool.query(
          `SELECT id, title, description, price, category, thumbnail, rating, 
                  available_quantity as "availableQuantity", discount 
           FROM products WHERE id = $1`,
          [id]
        );
        return rows[0];
      } catch (error) {
        console.error("Error in product:", error.message);
        throw new Error("Failed to fetch product");
      }
    },
    
    productsByCategory: async (_, { category, limit = 10, offset = 0 }) => {
      try {
        const countResult = await pool.query(
          "SELECT COUNT(*) FROM products WHERE category ILIKE $1",
          [`%${category}%`]
        );
        const total = countResult.rows[0].count;
        const { rows } = await pool.query(
          "SELECT * FROM products WHERE category ILIKE $1 LIMIT $2 OFFSET $3",
          [`%${category}%`, limit, offset]
        );
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in productsByCategory:", error);
        throw new Error("Failed to fetch products by category");
      }
    },
    
    searchProducts: async (_, { searchTerm, limit = 10, offset = 0 }) => {
      try {
        const countResult = await pool.query(
          "SELECT COUNT(*) FROM products WHERE title ILIKE $1 OR description ILIKE $1",
          [`%${searchTerm}%`]
        );
        const total = countResult.rows[0].count;
        const { rows } = await pool.query(
          `SELECT * FROM products 
           WHERE title ILIKE $1 OR description ILIKE $1 
           LIMIT $2 OFFSET $3`,
          [`%${searchTerm}%`, limit, offset]
        );
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in searchProducts:", error);
        throw new Error("Failed to search products");
      }
    },
    
    productsByPriceRange: async (_, { minPrice, maxPrice, limit = 10, offset = 0 }) => {
      try {
        const countResult = await pool.query(
          "SELECT COUNT(*) FROM products WHERE price BETWEEN $1 AND $2",
          [minPrice, maxPrice]
        );
        const total = countResult.rows[0].count;
        const { rows } = await pool.query(
          "SELECT * FROM products WHERE price BETWEEN $1 AND $2 LIMIT $3 OFFSET $4",
          [minPrice, maxPrice, limit, offset]
        );
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in productsByPriceRange:", error);
        throw new Error("Failed to fetch products by price range");
      }
    },
    
    userOrders: async (_, { userId, limit = 10, offset = 0 }) => {
      try {
        const { rows } = await pool.query(
          `SELECT o.*, COUNT(oi.id) as item_count, SUM(oi.quantity) as total_items
           FROM orders o
           LEFT JOIN order_items oi ON o.id = oi.order_id
           WHERE o.user_id = $1
           GROUP BY o.id
           ORDER BY o.created_at DESC 
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        );
        return rows;
      } catch (error) {
        console.error("Error in userOrders:", error);
        throw new Error("Failed to fetch orders");
      }
    },
    
    order: async (_, { id }) => {
      try {
        const { rows } = await pool.query(
          `SELECT o.*, COUNT(oi.id) as item_count, SUM(oi.quantity) as total_items
           FROM orders o
           LEFT JOIN order_items oi ON o.id = oi.order_id
           WHERE o.id = $1
           GROUP BY o.id`,
          [id]
        );
        if (rows[0]) {
          const itemsResult = await pool.query(
            `SELECT oi.*, p.title, p.thumbnail 
             FROM order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = $1`,
            [id]
          );
          rows[0].items = itemsResult.rows;
        }
        return rows[0];
      } catch (error) {
        console.error("Error in order:", error);
        throw new Error("Failed to fetch order");
      }
    },
    
    allOrders: async (_, { limit = 10, offset = 0 }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        const { rows } = await pool.query(
          `SELECT o.*, u.email, u.first_name, u.last_name, COUNT(oi.id) as item_count
           FROM orders o
           JOIN users u ON o.user_id = u.id
           LEFT JOIN order_items oi ON o.id = oi.order_id
           GROUP BY o.id, u.id
           ORDER BY o.created_at DESC 
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        return rows;
      } catch (error) {
        console.error("Error in allOrders:", error);
        throw new Error("Failed to fetch orders");
      }
    },
    
    cart: async (_, { userId }) => {
      try {
        const { rows } = await pool.query(
          `SELECT c.id, c.user_id, c.product_id, c.quantity,
                  p.title, p.price, p.thumbnail
           FROM cart_items c 
           JOIN products p ON c.product_id = p.id 
           WHERE c.user_id = $1`,
          [userId]
        );
        
        return rows.map(item => ({
          id: item.id.toString(),
          user_id: item.user_id.toString(),
          product_id: item.product_id.toString(),
          quantity: item.quantity,
          subtotal: item.quantity * parseFloat(item.price),
          product: {
            id: item.product_id.toString(),
            title: item.title,
            price: parseFloat(item.price),
            thumbnail: item.thumbnail
          }
        }));
      } catch (error) {
        console.error("Error in cart:", error);
        throw new Error("Failed to fetch cart");
      }
    },
    
    cartTotal: async (_, { userId }) => {
      try {
        const { rows } = await pool.query(
          "SELECT SUM(c.quantity * p.price) as total FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.user_id = $1",
          [userId]
        );
        return parseFloat(rows[0].total) || 0;
      } catch (error) {
        console.error("Error in cartTotal:", error);
        throw new Error("Failed to calculate cart total");
      }
    },
    
    wishlist: async (_, { userId }) => {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM wishlist_items WHERE user_id = $1 ORDER BY added_at DESC",
          [userId]
        );
        return rows;
      } catch (error) {
        console.error("Error in wishlist:", error);
        throw new Error("Failed to fetch wishlist");
      }
    },
    
    me: async (_, __, { user }) => {
      if (!user) throw new Error("Not authenticated");
      return user;
    },
    
    userStats: async (_, { userId }) => {
      try {
        const result = await pool.query(
          `SELECT COUNT(*) as "totalOrders", COALESCE(SUM(total_price), 0) as "totalSpent",
                  COALESCE(AVG(total_price), 0) as "averageOrderValue", MAX(created_at) as "lastOrderDate"
           FROM orders WHERE user_id = $1 AND is_paid = true`,
          [userId]
        );
        return {
          totalOrders: parseInt(result.rows[0].totalOrders),
          totalSpent: parseFloat(result.rows[0].totalSpent),
          averageOrderValue: parseFloat(result.rows[0].averageOrderValue),
          lastOrderDate: result.rows[0].lastOrderDate
        };
      } catch (error) {
        console.error("Error in userStats:", error);
        throw new Error("Failed to fetch user statistics");
      }
    },
    
    allUsers: async (_, { limit = 10, offset = 0 }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        const { rows } = await pool.query(
          "SELECT id, first_name, last_name, email, phone, role, created_at FROM users LIMIT $1 OFFSET $2",
          [limit, offset]
        );
        return rows;
      } catch (error) {
        console.error("Error in allUsers:", error);
        throw new Error("Failed to fetch users");
      }
    }
  },
  
  Mutation: {
    register: async (_, { first_name, last_name, email, password, phone }) => {
      try {
        const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existingUser.rows.length > 0) {
          throw new Error("User already exists with this email");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
          `INSERT INTO users (first_name, last_name, email, password, phone, role) 
           VALUES ($1, $2, $3, $4, $5, 'customer') 
           RETURNING id, first_name, last_name, email, phone, role, created_at`,
          [first_name, last_name, email, hashedPassword, phone]
        );
        const user = result.rows[0];
        const token = generateToken(user);
        return { token, user };
      } catch (error) {
        console.error("Error in register:", error);
        throw new Error(error.message || "Registration failed");
      }
    },
    
    login: async (_, { email, password }) => {
      try {
        const result = await pool.query(
          "SELECT id, first_name, last_name, email, password, phone, role FROM users WHERE email = $1",
          [email.toLowerCase()]
        );
        if (result.rows.length === 0) {
          throw new Error("Invalid email or password");
        }
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          throw new Error("Invalid email or password");
        }
        delete user.password;
        const token = generateToken(user);
        return { token, user };
      } catch (error) {
        console.error("Error in login:", error);
        throw new Error(error.message || "Login failed");
      }
    },
    
    // Add other mutations here (addToCart, placeOrder, etc.)
    // Keep them the same but change db to pool
  },
  
  Order: {
    items: async (order) => {
      const { rows } = await pool.query(
        `SELECT oi.*, p.title, p.thumbnail FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
        [order.id]
      );
      return rows;
    },
    user: async (order) => {
      const { rows } = await pool.query(
        "SELECT id, first_name, last_name, email, phone, role FROM users WHERE id = $1",
        [order.user_id]
      );
      return rows[0];
    }
  },
  
  OrderItem: {
    product: async (item) => {
      const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [item.product_id]);
      return rows[0];
    }
  },
  
  WishlistItem: {
    product: async (item) => {
      const { rows } = await pool.query("SELECT * FROM products WHERE title ILIKE $1 LIMIT 1", [item.product_name]);
      return rows[0];
    }
  }
};

module.exports = resolvers;
