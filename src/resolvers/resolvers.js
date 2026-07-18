const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const paymob = require("../services/paymobService");
const { pool, withTransaction } = require("../config/database");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");
const logger = require("../utils/logger");
const {
  validateEmail,
  validatePassword,
  validateOrderInput,
  sanitizeString,
  validateId,
} = require("../middleware/validation");

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
};

const paginate = (rows, limit, offset, total) => {
  return {
    products: rows,
    total: parseInt(total),
    page: Math.floor(offset / limit) + 1,
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit),
  };
};

const resolvers = {
  Query: {
    products: async (_, { limit = 10, offset = 0 }) => {
      try {
        const total = await Product.countAll();
        const rows = await Product.findAll(limit, offset);
        return paginate(rows, limit, offset, total);
      } catch (error) {
        logger.error("Error fetching products:", error.message);
        throw new Error("Failed to fetch products");
      }
    },

    product: async (_, { id }) => {
      if (!validateId(id)) throw new Error("Invalid product ID");
      try {
        return await Product.findById(id);
      } catch (error) {
        logger.error("Error fetching product:", error.message);
        throw new Error("Failed to fetch product");
      }
    },

    productsByCategory: async (_, { category, limit = 10, offset = 0 }) => {
      try {
        const total = await Product.countByCategory(category);
        const rows = await Product.findByCategory(category, limit, offset);
        return paginate(rows, limit, offset, total);
      } catch (error) {
        logger.error("Error in productsByCategory:", error.message);
        throw new Error("Failed to fetch products by category");
      }
    },

    searchProducts: async (_, { searchTerm, limit = 10, offset = 0 }) => {
      try {
        const sanitized = sanitizeString(searchTerm);
        const total = await Product.countSearch(sanitized);
        const rows = await Product.search(sanitized, limit, offset);
        return paginate(rows, limit, offset, total);
      } catch (error) {
        logger.error("Error in searchProducts:", error.message);
        throw new Error("Failed to search products");
      }
    },

    productsByPriceRange: async (
      _,
      { minPrice, maxPrice, limit = 10, offset = 0 },
    ) => {
      try {
        const total = await Product.countByPriceRange(minPrice, maxPrice);
        const rows = await Product.findByPriceRange(
          minPrice,
          maxPrice,
          limit,
          offset,
        );
        return paginate(rows, limit, offset, total);
      } catch (error) {
        logger.error("Error in productsByPriceRange:", error.message);
        throw new Error("Failed to fetch products by price range");
      }
    },

    userOrders: async (_, { userId, limit = 10, offset = 0 }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId && user.role !== "admin") {
        throw new Error("Unauthorized: Can only view your own orders");
      }
      try {
        return await Order.findByUser(userId, limit, offset);
      } catch (error) {
        logger.error("Error in userOrders:", error.message);
        throw new Error("Failed to fetch orders");
      }
    },

    order: async (_, { id }, { user }) => {
      if (!user) throw new Error("Authentication required");
      try {
        const order = await Order.findById(id);
        if (!order) throw new Error("Order not found");
        if (order.user_id != user.id && user.role !== "admin") {
          throw new Error("Unauthorized");
        }
        return order;
      } catch (error) {
        logger.error("Error in order:", error.message);
        throw new Error("Failed to fetch order");
      }
    },

    allOrders: async (_, { limit = 10, offset = 0 }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        return await Order.findAll(limit, offset);
      } catch (error) {
        logger.error("Error in allOrders:", error.message);
        throw new Error("Failed to fetch orders");
      }
    },

    cart: async (_, { userId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");
      try {
        const rows = await Cart.findByUser(userId);
        return rows.map((item) => ({
          id: item.id.toString(),
          user_id: item.user_id.toString(),
          product_id: item.product_id.toString(),
          quantity: item.quantity,
          subtotal: item.quantity * parseFloat(item.price),
          product: {
            id: item.product_id.toString(),
            title: item.title,
            price: parseFloat(item.price),
            thumbnail: item.thumbnail,
            availableQuantity: item.availableQuantity,
          },
        }));
      } catch (error) {
        logger.error("Error in cart:", error.message);
        throw new Error("Failed to fetch cart");
      }
    },

    cartTotal: async (_, { userId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");
      try {
        return await Cart.getTotal(userId);
      } catch (error) {
        logger.error("Error in cartTotal:", error.message);
        throw new Error("Failed to calculate cart total");
      }
    },

    wishlist: async (_, { userId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");
      try {
        return await Wishlist.findByUser(userId);
      } catch (error) {
        logger.error("Error in wishlist:", error.message);
        throw new Error("Failed to fetch wishlist");
      }
    },

    me: async (_, __, { user }) => {
      if (!user) throw new Error("Not authenticated");
      return user;
    },

    userStats: async (_, { userId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId && user.role !== "admin") {
        throw new Error("Unauthorized");
      }
      try {
        const result = await pool.query(
          `SELECT COUNT(*) as "totalOrders", COALESCE(SUM(total_price), 0) as "totalSpent",
                  COALESCE(AVG(total_price), 0) as "averageOrderValue", MAX(created_at) as "lastOrderDate"
           FROM orders WHERE user_id = $1 AND is_paid = true AND deleted_at IS NULL`,
          [userId],
        );
        return {
          totalOrders: parseInt(result.rows[0].totalOrders),
          totalSpent: parseFloat(result.rows[0].totalSpent),
          averageOrderValue: parseFloat(result.rows[0].averageOrderValue),
          lastOrderDate: result.rows[0].lastOrderDate,
        };
      } catch (error) {
        logger.error("Error in userStats:", error.message);
        throw new Error("Failed to fetch user statistics");
      }
    },

    allUsers: async (_, { limit = 10, offset = 0 }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        return await User.findAll(limit, offset);
      } catch (error) {
        logger.error("Error in allUsers:", error.message);
        throw new Error("Failed to fetch users");
      }
    },
  },

  Mutation: {
    register: async (_, { first_name, last_name, email, password, phone }) => {
      // Validation
      if (!validateEmail(email)) throw new Error("Invalid email format");
      if (!validatePassword(password)) {
        throw new Error(
          "Password must be at least 8 characters with uppercase, lowercase, number, and special character",
        );
      }

      const sanitizedFirst = sanitizeString(first_name);
      const sanitizedLast = sanitizeString(last_name);

      try {
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
          throw new Error("User already exists with this email");
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await User.create({
          first_name: sanitizedFirst,
          last_name: sanitizedLast,
          email: email.toLowerCase().trim(),
          hashedPassword,
          phone: phone ? sanitizeString(phone) : null,
        });

        const token = generateToken(user);
        return { token, user };
      } catch (error) {
        logger.error("Error in register:", error.message);
        throw new Error(error.message || "Registration failed");
      }
    },

    login: async (_, { email, password }) => {
      if (!validateEmail(email)) throw new Error("Invalid email format");

      try {
        const user = await User.findByEmail(email);
        if (!user) {
          throw new Error("Invalid email or password");
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          throw new Error("Invalid email or password");
        }

        delete user.password;
        const token = generateToken(user);
        return { token, user };
      } catch (error) {
        logger.error("Error in login:", error.message);
        throw new Error(error.message || "Login failed");
      }
    },

    placeOrder: async (
      _,
      {
        userId,
        shippingAddress,
        shippingFullName,
        shippingCity,
        paymentMethod,
      },
      { user },
    ) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      try {
        // Get cart items
        const cartItems = await Cart.findByUser(userId);
        if (!cartItems || cartItems.length === 0) {
          throw new Error("Cart is empty");
        }

        // Calculate total
        let totalPrice = 0;
        const orderItems = cartItems.map((item) => {
          const itemTotal = item.quantity * parseFloat(item.price);
          totalPrice += itemTotal;
          return {
            productId: item.product_id,
            quantity: item.quantity,
            price: parseFloat(item.price),
          };
        });

        validateOrderInput(totalPrice, orderItems);

        // Create order with transaction
        const order = await Order.create(
          {
            user_id: userId,
            total_price: totalPrice,
            shipping_address: sanitizeString(shippingAddress),
            shipping_full_name: sanitizeString(shippingFullName),
            shipping_city: sanitizeString(shippingCity),
            payment_method: paymentMethod,
          },
          orderItems,
        );

        // Deduct stock atomically
        await withTransaction(async (client) => {
          for (const item of orderItems) {
            const updated = await Product.updateStock(
              client,
              item.productId,
              item.quantity,
            );
            if (!updated) {
              throw new Error(
                `Insufficient stock for product ${item.productId}`,
              );
            }
          }
        });

        // Clear cart
        await Cart.clear(userId);

        return order;
      } catch (error) {
        logger.error("Error in placeOrder:", error.message);
        throw new Error(error.message || "Failed to place order");
      }
    },

    createOrder: async (
      _,
      {
        userId,
        totalPrice,
        shippingAddress,
        shippingFullName,
        shippingCity,
        paymentMethod,
        items,
      },
      { user },
    ) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      validateOrderInput(totalPrice, items);

      try {
        const order = await Order.create(
          {
            user_id: userId,
            total_price: totalPrice,
            shipping_address: sanitizeString(shippingAddress),
            shipping_full_name: sanitizeString(shippingFullName),
            shipping_city: sanitizeString(shippingCity),
            payment_method: paymentMethod,
          },
          items,
        );

        // Deduct stock
        await withTransaction(async (client) => {
          for (const item of items) {
            const updated = await Product.updateStock(
              client,
              item.productId,
              item.quantity,
            );
            if (!updated) {
              throw new Error(
                `Insufficient stock for product ${item.productId}`,
              );
            }
          }
        });

        return order;
      } catch (error) {
        logger.error("Error in createOrder:", error.message);
        throw new Error(error.message || "Failed to create order");
      }
    },

    updateOrderStatus: async (_, { orderId, status }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        return await Order.updateStatus(orderId, status);
      } catch (error) {
        logger.error("Error in updateOrderStatus:", error.message);
        throw new Error(error.message || "Failed to update order status");
      }
    },

    updatePaymentStatus: async (
      _,
      { orderId, isPaid, paymentMethod },
      { user },
    ) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        const result = await pool.query(
          `UPDATE orders SET is_paid = $1, payment_method = COALESCE($2, payment_method), 
           status = CASE WHEN $1 THEN 'paid' ELSE status END,
           updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
          [isPaid, paymentMethod, orderId],
        );
        return result.rows[0];
      } catch (error) {
        logger.error("Error in updatePaymentStatus:", error.message);
        throw new Error("Failed to update payment status");
      }
    },

    updateDeliveryStatus: async (_, { orderId, isDelivered }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }
      try {
        if (isDelivered) {
          return await Order.markAsDelivered(orderId);
        } else {
          const result = await pool.query(
            `UPDATE orders SET is_delivered = false, delivered_at = NULL, updated_at = NOW() 
             WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
            [orderId],
          );
          return result.rows[0];
        }
      } catch (error) {
        logger.error("Error in updateDeliveryStatus:", error.message);
        throw new Error("Failed to update delivery status");
      }
    },

    cancelOrder: async (_, { orderId, userId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId && user.role !== "admin") {
        throw new Error("Unauthorized");
      }
      try {
        const order = await Order.findById(orderId);
        if (!order) throw new Error("Order not found");
        if (order.status === "cancelled")
          throw new Error("Order already cancelled");
        if (order.status === "delivered")
          throw new Error("Cannot cancel delivered order");

        // Restore stock
        const items = await Order.getItems(orderId);
        await withTransaction(async (client) => {
          for (const item of items) {
            await client.query(
              `UPDATE products SET available_quantity = available_quantity + $1 WHERE id = $2`,
              [item.quantity, item.product_id],
            );
          }
        });

        await Order.cancel(orderId);
        return true;
      } catch (error) {
        logger.error("Error in cancelOrder:", error.message);
        throw new Error(error.message || "Failed to cancel order");
      }
    },

    addToCart: async (_, { userId, productId, quantity }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");
      if (!validateId(productId)) throw new Error("Invalid product ID");
      if (!Number.isInteger(quantity) || quantity <= 0)
        throw new Error("Quantity must be positive");

      try {
        const product = await Product.findById(productId);
        if (!product) throw new Error("Product not found");
        if (product.availableQuantity < quantity)
          throw new Error("Insufficient stock");

        return await Cart.addItem(userId, productId, quantity);
      } catch (error) {
        logger.error("Error in addToCart:", error.message);
        throw new Error(error.message || "Failed to add to cart");
      }
    },

    removeFromCart: async (_, { userId, productId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      try {
        await Cart.removeItem(userId, productId);
        return true;
      } catch (error) {
        logger.error("Error in removeFromCart:", error.message);
        throw new Error("Failed to remove from cart");
      }
    },

    updateCartItem: async (_, { userId, productId, quantity }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");
      if (!Number.isInteger(quantity) || quantity < 0)
        throw new Error("Invalid quantity");

      try {
        if (quantity > 0) {
          const product = await Product.findById(productId);
          if (!product) throw new Error("Product not found");
          if (product.availableQuantity < quantity)
            throw new Error("Insufficient stock");
        }
        return await Cart.updateItem(userId, productId, quantity);
      } catch (error) {
        logger.error("Error in updateCartItem:", error.message);
        throw new Error(error.message || "Failed to update cart");
      }
    },

    clearCart: async (_, { userId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      try {
        await Cart.clear(userId);
        return true;
      } catch (error) {
        logger.error("Error in clearCart:", error.message);
        throw new Error("Failed to clear cart");
      }
    },

    addToWishlist: async (_, { userId, productName }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      try {
        return await Wishlist.addItem(userId, sanitizeString(productName));
      } catch (error) {
        logger.error("Error in addToWishlist:", error.message);
        throw new Error("Failed to add to wishlist");
      }
    },

    removeFromWishlist: async (_, { userId, wishlistItemId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      try {
        await Wishlist.removeItem(userId, wishlistItemId);
        return true;
      } catch (error) {
        logger.error("Error in removeFromWishlist:", error.message);
        throw new Error("Failed to remove from wishlist");
      }
    },

    clearWishlist: async (_, { userId }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      try {
        await Wishlist.clear(userId);
        return true;
      } catch (error) {
        logger.error("Error in clearWishlist:", error.message);
        throw new Error("Failed to clear wishlist");
      }
    },

    createProduct: async (_, { input }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      try {
        return await Product.create({
          title: sanitizeString(input.title),
          description: sanitizeString(input.description),
          price: input.price,
          category: sanitizeString(input.category),
          thumbnail: sanitizeString(input.thumbnail),
          availableQuantity: input.availableQuantity,
          discount: input.discount || 0,
        });
      } catch (error) {
        logger.error("Error in createProduct:", error.message);
        throw new Error("Failed to create product");
      }
    },

    updateProduct: async (_, { id, input }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      try {
        return await Product.update(id, input);
      } catch (error) {
        logger.error("Error in updateProduct:", error.message);
        throw new Error("Failed to update product");
      }
    },

    deleteProduct: async (_, { id }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      try {
        await Product.delete(id);
        return true;
      } catch (error) {
        logger.error("Error in deleteProduct:", error.message);
        throw new Error("Failed to delete product");
      }
    },

    bulkUpdateStock: async (_, { updates }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      try {
        await withTransaction(async (client) => {
          for (const update of updates) {
            await client.query(
              `UPDATE products SET available_quantity = $1, updated_at = NOW() WHERE id = $2`,
              [update.quantity, update.productId],
            );
          }
        });
        return true;
      } catch (error) {
        logger.error("Error in bulkUpdateStock:", error.message);
        throw new Error("Failed to update stock");
      }
    },

    initiatePayment: async (_, { userId, orderId, billingData }, { user }) => {
      if (!user) throw new Error("Authentication required");
      if (user.id != userId) throw new Error("Unauthorized");

      try {
        const order = await Order.findById(orderId);
        if (!order) throw new Error("Order not found");
        if (order.user_id != userId) throw new Error("Unauthorized");
        if (order.status === "paid") throw new Error("Order already paid");

        const token = await paymob.authenticate();
        const paymobOrderId = await paymob.createOrder(
          token,
          order.total_price,
          orderId,
          userId,
          billingData,
        );

        const paymentKey = await paymob.generatePaymentKey(
          token,
          paymobOrderId,
          order.total_price,
          user.email,
          billingData,
        );

        return {
          success: true,
          paymentKey,
          iframeId: paymob.iframeId,
          redirectUrl: `https://accept.paymob.com/api/acceptance/iframes/${paymob.iframeId}?payment_token=${paymentKey}`,
          transactionId: paymobOrderId.toString(),
          message: "Payment initiated successfully",
        };
      } catch (error) {
        logger.error("Error in initiatePayment:", error.message);
        throw new Error(error.message || "Failed to initiate payment");
      }
    },

    verifyPayment: async (_, { orderId, hmac, paymentData }) => {
      try {
        const isValid = paymob.verifyHmac(JSON.parse(paymentData), hmac);
        if (!isValid) {
          logger.warn("Invalid payment HMAC for order:", orderId);
          throw new Error("Invalid payment signature");
        }

        const data = JSON.parse(paymentData);
        if (data.success) {
          await Order.markAsPaid(orderId, data.id || data.transaction_id);
          return true;
        }
        return false;
      } catch (error) {
        logger.error("Error in verifyPayment:", error.message);
        throw new Error("Failed to verify payment");
      }
    },

    refundPayment: async (_, { orderId, transactionId, amount }, { user }) => {
      if (!user || user.role !== "admin") {
        throw new Error("Unauthorized: Admin access required");
      }

      try {
        const result = await paymob.refundTransaction(transactionId, amount);
        await pool.query(
          `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
          [orderId],
        );
        return {
          success: true,
          message: "Refund processed successfully",
          transactionId: result.id?.toString(),
        };
      } catch (error) {
        logger.error("Error in refundPayment:", error.message);
        throw new Error(error.message || "Failed to process refund");
      }
    },

    getPaymentStatus: async (_, { orderId }, { user }) => {
      if (!user) throw new Error("Authentication required");

      try {
        const order = await Order.findById(orderId);
        if (!order) throw new Error("Order not found");
        if (order.user_id != user.id && user.role !== "admin") {
          throw new Error("Unauthorized");
        }

        if (!order.transaction_id) {
          return { pending: true, success: false };
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
          data: JSON.stringify(status),
        };
      } catch (error) {
        logger.error("Error in getPaymentStatus:", error.message);
        throw new Error("Failed to get payment status");
      }
    },
  },

  Order: {
    items: async (order) => {
      return await Order.getItems(order.id);
    },
    user: async (order) => {
      return await User.findById(order.user_id);
    },
  },

  OrderItem: {
    product: async (item) => {
      return await Product.findById(item.product_id);
    },
  },

  WishlistItem: {
    product: async (item) => {
      if (!item.product_id) return null;
      return await Product.findById(item.product_id);
    },
  },
};

module.exports = resolvers;
