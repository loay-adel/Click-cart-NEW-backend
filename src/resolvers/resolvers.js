const db = require("../config/database");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const paymob = require("../services/paymobService");
const Product = require("../models/Product");
const Order = require("../models/Order");

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
    // Using Product model
    products: async (_, { limit = 10, offset = 0 }) => {
      try {
        const countResult = await db.query("SELECT COUNT(*) FROM products");
        const total = countResult.rows[0].count;
        const rows = await Product.findAll(limit, offset);
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in products:", error);
        throw new Error("Failed to fetch products");
      }
    },
    
    // Using Product model
    product: async (_, { id }) => {
      try {
        const product = await Product.findById(id);
        if (!product) throw new Error("Product not found");
        return product;
      } catch (error) {
        console.error("Error in product:", error);
        throw new Error("Failed to fetch product");
      }
    },
    
    // Using Product model
    productsByCategory: async (_, { category, limit = 10, offset = 0 }) => {
      try {
        const countResult = await db.query(
          "SELECT COUNT(*) FROM products WHERE category ILIKE $1",
          [`%${category}%`]
        );
        const total = countResult.rows[0].count;
        const rows = await Product.findByCategory(category, limit, offset);
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in productsByCategory:", error);
        throw new Error("Failed to fetch products by category");
      }
    },
    
    // Using Product model
    searchProducts: async (_, { searchTerm, limit = 10, offset = 0 }) => {
      try {
        const countResult = await db.query(
          "SELECT COUNT(*) FROM products WHERE title ILIKE $1 OR description ILIKE $1",
          [`%${searchTerm}%`]
        );
        const total = countResult.rows[0].count;
        const rows = await Product.search(searchTerm, limit, offset);
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in searchProducts:", error);
        throw new Error("Failed to search products");
      }
    },
    
    // Keep raw SQL for complex queries
    productsByPriceRange: async (_, { minPrice, maxPrice, limit = 10, offset = 0 }) => {
      try {
        const countResult = await db.query(
          "SELECT COUNT(*) FROM products WHERE price BETWEEN $1 AND $2",
          [minPrice, maxPrice]
        );
        const total = countResult.rows[0].count;
        const { rows } = await db.query(
          "SELECT * FROM products WHERE price BETWEEN $1 AND $2 LIMIT $3 OFFSET $4",
          [minPrice, maxPrice, limit, offset]
        );
        return paginate(rows, limit, offset, total);
      } catch (error) {
        console.error("Error in productsByPriceRange:", error);
        throw new Error("Failed to fetch products by price range");
      }
    },
    
    // Using Order model
    userOrders: async (_, { userId, limit = 10, offset = 0 }) => {
      try {
        const rows = await Order.findByUser(userId, limit, offset);
        return rows;
      } catch (error) {
        console.error("Error in userOrders:", error);
        throw new Error("Failed to fetch orders");
      }
    },
    
    // Using Order model
    order: async (_, { id }) => {
      try {
        const order = await Order.findById(id);
        if (!order) throw new Error("Order not found");
        
        // Get order items separately
        const itemsResult = await db.query(
          `SELECT oi.*, p.title, p.thumbnail 
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = $1`,
          [id]
        );
        order.items = itemsResult.rows;
        return order;
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
        const { rows } = await db.query(
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
        const { rows } = await db.query(
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
        const { rows } = await db.query(
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
        const { rows } = await db.query(
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
        const result = await db.query(
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
        const { rows } = await db.query(
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
        const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existingUser.rows.length > 0) {
          throw new Error("User already exists with this email");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
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
        const result = await db.query(
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
    
    addToCart: async (_, { userId, productId, quantity }) => {
      try {
        console.log(`Adding to cart: user ${userId}, product ${productId}, quantity ${quantity}`);
        
        const productCheck = await db.query(
          "SELECT id, price, title FROM products WHERE id = $1",
          [productId]
        );
        
        if (productCheck.rows.length === 0) {
          throw new Error(`Product with ID ${productId} does not exist`);
        }
        
        const product = productCheck.rows[0];
        const productPrice = parseFloat(product.price);
        
        const existing = await db.query(
          "SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2",
          [userId, productId]
        );
        
        let cartItem;
        if (existing.rows.length > 0) {
          const newQuantity = existing.rows[0].quantity + quantity;
          const result = await db.query(
            `UPDATE cart_items 
             SET quantity = $1, updated_at = NOW() 
             WHERE user_id = $2 AND product_id = $3 
             RETURNING id, user_id, product_id, quantity`,
            [newQuantity, userId, productId]
          );
          cartItem = result.rows[0];
        } else {
          const result = await db.query(
            `INSERT INTO cart_items (user_id, product_id, quantity) 
             VALUES ($1, $2, $3) 
             RETURNING id, user_id, product_id, quantity`,
            [userId, productId, quantity]
          );
          cartItem = result.rows[0];
        }
        
        return {
          id: cartItem.id.toString(),
          user_id: cartItem.user_id.toString(),
          product_id: cartItem.product_id.toString(),
          quantity: cartItem.quantity,
          subtotal: cartItem.quantity * productPrice,
          product: {
            id: product.id.toString(),
            title: product.title,
            price: productPrice,
            thumbnail: product.thumbnail || null
          }
        };
      } catch (error) {
        console.error("Error in addToCart:", error);
        throw new Error(error.message || "Failed to add to cart");
      }
    },
    
    // Using Order model
    placeOrder: async (_, { userId, shippingAddress, shippingFullName, shippingCity, paymentMethod }) => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        
        const cartItems = await client.query(
          `SELECT c.*, p.price, p.title 
           FROM cart_items c 
           JOIN products p ON c.product_id = p.id 
           WHERE c.user_id = $1`,
          [userId]
        );
        
        if (cartItems.rows.length === 0) {
          throw new Error("Cart is empty");
        }
        
        let totalPrice = 0;
        const items = cartItems.rows.map(item => {
          const itemTotal = item.quantity * parseFloat(item.price);
          totalPrice += itemTotal;
          return {
            productId: item.product_id,
            quantity: item.quantity,
            price: parseFloat(item.price)
          };
        });
        
        const shippingPrice = 10;
        const taxPrice = totalPrice * 0.14;
        const grandTotal = totalPrice + shippingPrice + taxPrice;
        
        const orderData = {
          user_id: userId,
          total_price: grandTotal,
          shipping_address: shippingAddress,
          shipping_full_name: shippingFullName,
          shipping_city: shippingCity,
          payment_method: paymentMethod
        };
        
        const order = await Order.create(orderData);
        
        for (const item of items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)`,
            [order.id, item.productId, item.quantity, item.price]
          );
          
          await Product.updateStock(item.productId, item.quantity);
        }
        
        await client.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
        await client.query("COMMIT");
        
        return order;
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error in placeOrder:", error);
        throw new Error(error.message || "Failed to place order");
      } finally {
        client.release();
      }
    },
    
    removeFromCart: async (_, { userId, productId }) => {
      try {
        const result = await db.query(
          "DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2",
          [userId, productId]
        );
        return result.rowCount > 0;
      } catch (error) {
        console.error("Error in removeFromCart:", error);
        throw new Error("Failed to remove from cart");
      }
    },
    
    updateCartItem: async (_, { userId, productId, quantity }) => {
      try {
        const product = await db.query("SELECT price FROM products WHERE id = $1", [productId]);
        const { rows } = await db.query(
          `UPDATE cart_items SET quantity = $1 WHERE user_id = $2 AND product_id = $3 RETURNING *`,
          [quantity, userId, productId]
        );
        if (rows.length === 0) {
          throw new Error("Item not found in cart");
        }
        return {
          id: rows[0].id.toString(),
          user_id: rows[0].user_id.toString(),
          product_id: rows[0].product_id.toString(),
          quantity: rows[0].quantity,
          subtotal: rows[0].quantity * product.rows[0].price
        };
      } catch (error) {
        console.error("Error in updateCartItem:", error);
        throw new Error("Failed to update cart item");
      }
    },
    
    clearCart: async (_, { userId }) => {
      try {
        await db.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
        return true;
      } catch (error) {
        console.error("Error in clearCart:", error);
        throw new Error("Failed to clear cart");
      }
    },
    
    addToWishlist: async (_, { userId, productName }) => {
      try {
        const { rows } = await db.query(
          `INSERT INTO wishlist_items (user_id, product_name) 
           VALUES ($1, $2) 
           ON CONFLICT (user_id, product_name) DO NOTHING
           RETURNING id, user_id, product_name, added_at`,
          [userId, productName]
        );
        return rows[0] || { id: 0, user_id: userId, product_name: productName, added_at: new Date() };
      } catch (error) {
        console.error("Error in addToWishlist:", error);
        throw new Error("Failed to add to wishlist");
      }
    },
    
    removeFromWishlist: async (_, { userId, wishlistItemId }) => {
      try {
        const result = await db.query(
          "DELETE FROM wishlist_items WHERE id = $1 AND user_id = $2",
          [wishlistItemId, userId]
        );
        return result.rowCount > 0;
      } catch (error) {
        console.error("Error in removeFromWishlist:", error);
        throw new Error("Failed to remove from wishlist");
      }
    },
    
    clearWishlist: async (_, { userId }) => {
      try {
        await db.query("DELETE FROM wishlist_items WHERE user_id = $1", [userId]);
        return true;
      } catch (error) {
        console.error("Error in clearWishlist:", error);
        throw new Error("Failed to clear wishlist");
      }
    },
    
    initiatePayment: async (_, { userId, orderId, billingData }) => {
      try {
        const orderResult = await db.query(
          "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
          [orderId, userId]
        );
        if (orderResult.rows.length === 0) {
          throw new Error("Order not found");
        }
        const order = orderResult.rows[0];
        const userResult = await db.query(
          "SELECT email, first_name, last_name, phone FROM users WHERE id = $1",
          [userId]
        );
        const user = userResult.rows[0];
        const token = await paymob.authenticate();
        const paymentOrderId = await paymob.createOrder(token, order.total_price, orderId, userId);
        const paymentKey = await paymob.generatePaymentKey(
          token, paymentOrderId, order.total_price, userId,
          billingData.email || user.email,
          {
            first_name: billingData.first_name,
            last_name: billingData.last_name,
            phone_number: billingData.phone_number,
            email: billingData.email,
            apartment: billingData.apartment,
            floor: billingData.floor,
            street: billingData.street,
            building: billingData.building,
            city: billingData.city
          }
        );
        await db.query(
          "UPDATE orders SET payment_method = $1 WHERE id = $2",
          [`paymob_order_${paymentOrderId}`, orderId]
        );
        return {
          success: true,
          paymentKey: paymentKey,
          iframeId: process.env.PAYMOB_IFRAME_ID,
          redirectUrl: `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentKey}`,
          message: "Payment initiated successfully"
        };
      } catch (error) {
        console.error("Error in initiatePayment:", error);
        throw new Error(error.message || "Failed to initiate payment");
      }
    },
    
    verifyPayment: async (_, { orderId, hmac, paymentData }) => {
      try {
        const isValid = paymob.verifyHmac(JSON.parse(paymentData), hmac);
        if (!isValid) {
          throw new Error("Invalid payment signature");
        }
        const paymentInfo = JSON.parse(paymentData);
        await Order.markAsPaid(orderId, paymentInfo.transaction_id);
        return true;
      } catch (error) {
        console.error("Error in verifyPayment:", error);
        throw new Error("Payment verification failed");
      }
    },
    
    refundPayment: async (_, { orderId, transactionId, amount }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        const refundResult = await paymob.refundTransaction(transactionId, amount);
        if (refundResult.success) {
          await db.query(
            `UPDATE orders SET is_refunded = true, refunded_at = NOW(), refund_amount = $1 WHERE id = $2`,
            [amount, orderId]
          );
        }
        return {
          success: refundResult.success,
          message: refundResult.success ? "Refund processed successfully" : "Refund failed"
        };
      } catch (error) {
        console.error("Error in refundPayment:", error);
        throw new Error("Failed to process refund");
      }
    },
    
    getPaymentStatus: async (_, { orderId }) => {
      try {
        const orderResult = await db.query(
          "SELECT transaction_id, is_paid FROM orders WHERE id = $1",
          [orderId]
        );
        if (orderResult.rows.length === 0) {
          throw new Error("Order not found");
        }
        const order = orderResult.rows[0];
        if (!order.transaction_id) {
          return { success: order.is_paid, pending: !order.is_paid, error_occured: false };
        }
        const status = await paymob.getTransactionStatus(order.transaction_id);
        return {
          id: status.id,
          pending: status.pending,
          amount_cents: status.amount_cents,
          success: status.success,
          is_refunded: status.is_refunded,
          captured_amount: status.captured_amount,
          error_occured: status.error_occured,
          data: status.data
        };
      } catch (error) {
        console.error("Error in getPaymentStatus:", error);
        throw new Error("Failed to get payment status");
      }
    },
    
    // Using Product model
    createProduct: async (_, { input }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        const product = await Product.create(input);
        return product;
      } catch (error) {
        console.error("Error in createProduct:", error);
        throw new Error("Failed to create product");
      }
    },
    
    // Using Product model
    updateProduct: async (_, { id, input }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        const product = await Product.update(id, input);
        if (!product) throw new Error("Product not found");
        return product;
      } catch (error) {
        console.error("Error in updateProduct:", error);
        throw new Error("Failed to update product");
      }
    },
    
    // Using Product model
    deleteProduct: async (_, { id }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        const product = await Product.delete(id);
        return !!product;
      } catch (error) {
        console.error("Error in deleteProduct:", error);
        throw new Error("Failed to delete product");
      }
    },
    
    bulkUpdateStock: async (_, { updates }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error("Unauthorized: Admin access required");
      }
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const update of updates) {
          await Product.updateStock(update.productId, -update.quantity);
        }
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("Error in bulkUpdateStock:", error);
        throw new Error("Failed to update stock");
      } finally {
        client.release();
      }
    }
  },
  
  Order: {
    items: async (order) => {
      const { rows } = await db.query(
        `SELECT oi.*, p.title, p.thumbnail FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
        [order.id]
      );
      return rows;
    },
    user: async (order) => {
      const { rows } = await db.query(
        "SELECT id, first_name, last_name, email, phone, role FROM users WHERE id = $1",
        [order.user_id]
      );
      return rows[0];
    }
  },
  
  OrderItem: {
    product: async (item) => {
      const { rows } = await db.query("SELECT * FROM products WHERE id = $1", [item.product_id]);
      return rows[0];
    }
  },
  
  WishlistItem: {
    product: async (item) => {
      const { rows } = await db.query("SELECT * FROM products WHERE title ILIKE $1 LIMIT 1", [item.product_name]);
      return rows[0];
    }
  }
};

module.exports = resolvers;
