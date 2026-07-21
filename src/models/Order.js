const { pool, withTransaction } = require("../config/database");

const Order = {
  create: async (orderData, orderItems = []) => {
    const {
      user_id,
      total_price,
      shipping_address,
      shipping_full_name,
      shipping_city,
      payment_method,
    } = orderData;

    return await withTransaction(async (client) => {
      const orderResult = await client.query(
        `INSERT INTO orders (
          user_id, total_price, shipping_address, shipping_full_name, 
          shipping_city, payment_method, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW()) 
        RETURNING *`,
        [
          user_id,
          total_price,
          shipping_address,
          shipping_full_name,
          shipping_city,
          payment_method,
        ],
      );

      const order = orderResult.rows[0];
      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          await client.query(
            `INSERT INTO order_items (
              order_id, product_id, quantity, price, title, thumbnail
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              order.id,
              item.productId || item.product_id,
              item.quantity,
              item.price,
              item.title || null,
              item.thumbnail || null,
            ],
          );
          await client.query(
            `UPDATE products 
             SET available_quantity = available_quantity - $1,
                 updated_at = NOW()
             WHERE id = $2 AND available_quantity >= $1`,
            [item.quantity, item.productId || item.product_id],
          );
        }
      }

      return order;
    });
  },

  findById: async (id) => {
    const result = await pool.query(
      `SELECT o.*, u.email, u.first_name, u.last_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1 AND o.deleted_at IS NULL`,
      [id],
    );
    return result.rows[0];
  },

  findAll: async (limit = 10, offset = 0) => {
    const result = await pool.query(
      `SELECT o.*, COUNT(oi.id) as item_count,
              u.first_name, u.last_name, u.email
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.deleted_at IS NULL
       GROUP BY o.id, u.first_name, u.last_name, u.email
       ORDER BY o.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return result.rows;
  },

  findByUser: async (userId, limit = 10, offset = 0) => {
    const result = await pool.query(
      `SELECT o.*, COUNT(oi.id) as item_count
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1 AND o.deleted_at IS NULL
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows;
  },

  updateStatus: async (orderId, status) => {
    const result = await pool.query(
      `UPDATE orders 
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [status, orderId],
    );
    return result.rows[0];
  },

  markAsPaid: async (orderId, transactionId) => {
    const result = await pool.query(
      `UPDATE orders 
       SET is_paid = true, status = 'paid', paid_at = NOW(), transaction_id = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [transactionId, orderId],
    );
    return result.rows[0];
  },

  markAsDelivered: async (orderId) => {
    const result = await pool.query(
      `UPDATE orders 
       SET is_delivered = true, delivered_at = NOW(), status = 'delivered', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [orderId],
    );
    return result.rows[0];
  },

  getItems: async (orderId) => {
    const result = await pool.query(
      `SELECT oi.*, p.title as product_title, p.thumbnail as product_thumbnail
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId],
    );
    return result.rows;
  },

  cancel: async (orderId) => {
    const result = await pool.query(
      `UPDATE orders 
       SET status = 'cancelled', deleted_at = NOW(), updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [orderId],
    );
    return result.rows[0];
  },

  delete: async (orderId) => {
    const result = await pool.query(
      "DELETE FROM orders WHERE id = $1 RETURNING *",
      [orderId],
    );
    return result.rows[0];
  },
};

module.exports = Order;
