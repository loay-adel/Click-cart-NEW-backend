const db = require("../config/database");

const Order = {
  // Create new order
  create: async (orderData) => {
    const { user_id, total_price, shipping_address, shipping_full_name, shipping_city, payment_method } = orderData;
    const result = await db.query(
      `INSERT INTO orders (user_id, total_price, shipping_address, shipping_full_name, shipping_city, payment_method) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [user_id, total_price, shipping_address, shipping_full_name, shipping_city, payment_method]
    );
    return result.rows[0];
  },
  
  // Find order by ID
  findById: async (id) => {
    const result = await db.query(
      `SELECT o.*, u.email, u.first_name, u.last_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0];
  },
  
  // Get user orders
  findByUser: async (userId, limit = 10, offset = 0) => {
    const result = await db.query(
      `SELECT o.*, COUNT(oi.id) as item_count
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },
  
  // Update payment status
  markAsPaid: async (orderId, transactionId) => {
    const result = await db.query(
      `UPDATE orders 
       SET is_paid = true, paid_at = NOW(), transaction_id = $1
       WHERE id = $2 
       RETURNING *`,
      [transactionId, orderId]
    );
    return result.rows[0];
  },
  
  // Cancel order
  cancel: async (orderId) => {
    const result = await db.query(
      `DELETE FROM orders WHERE id = $1 RETURNING *`,
      [orderId]
    );
    return result.rows[0];
  }
};

module.exports = Order;
