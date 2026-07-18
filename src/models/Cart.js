const { pool } = require("../config/database");

const Cart = {
  findByUser: async (userId) => {
    const result = await pool.query(
      `SELECT c.id, c.user_id, c.product_id, c.quantity,
              p.title, p.price, p.thumbnail, p.available_quantity as "availableQuantity"
       FROM cart_items c 
       JOIN products p ON c.product_id = p.id 
       WHERE c.user_id = $1`,
      [userId]
    );
    return result.rows;
  },
  
  addItem: async (userId, productId, quantity) => {
    const existing = await pool.query(
      "SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2",
      [userId, productId]
    );
    
    if (existing.rows.length > 0) {
      const result = await pool.query(
        `UPDATE cart_items SET quantity = quantity + $1, updated_at = NOW()
         WHERE user_id = $2 AND product_id = $3
         RETURNING *`,
        [quantity, userId, productId]
      );
      return result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO cart_items (user_id, product_id, quantity) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [userId, productId, quantity]
      );
      return result.rows[0];
    }
  },
  
  updateItem: async (userId, productId, quantity) => {
    if (quantity <= 0) {
      return Cart.removeItem(userId, productId);
    }
    const result = await pool.query(
      `UPDATE cart_items SET quantity = $1, updated_at = NOW()
       WHERE user_id = $2 AND product_id = $3
       RETURNING *`,
      [quantity, userId, productId]
    );
    return result.rows[0];
  },
  
  removeItem: async (userId, productId) => {
    const result = await pool.query(
      "DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 RETURNING id",
      [userId, productId]
    );
    return result.rows[0];
  },
  
  clear: async (userId) => {
    await pool.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
    return true;
  },
  
  getTotal: async (userId) => {
    const result = await pool.query(
      `SELECT COALESCE(SUM(c.quantity * p.price), 0) as total 
       FROM cart_items c 
       JOIN products p ON c.product_id = p.id 
       WHERE c.user_id = $1`,
      [userId]
    );
    return parseFloat(result.rows[0].total);
  }
};

module.exports = Cart;
