const { pool } = require("../config/database");

const Wishlist = {
  findByUser: async (userId) => {
    const result = await pool.query(
      `SELECT w.*, p.id as product_id, p.title, p.price, p.thumbnail
       FROM wishlist_items w
       LEFT JOIN products p ON w.product_name ILIKE p.title
       WHERE w.user_id = $1 
       ORDER BY w.added_at DESC`,
      [userId]
    );
    return result.rows;
  },
  
  addItem: async (userId, productName) => {
    const result = await pool.query(
      `INSERT INTO wishlist_items (user_id, product_name) 
       VALUES ($1, $2) 
       RETURNING *`,
      [userId, productName]
    );
    return result.rows[0];
  },
  
  removeItem: async (userId, wishlistItemId) => {
    const result = await pool.query(
      "DELETE FROM wishlist_items WHERE id = $1 AND user_id = $2 RETURNING id",
      [wishlistItemId, userId]
    );
    return result.rows[0];
  },
  
  clear: async (userId) => {
    await pool.query("DELETE FROM wishlist_items WHERE user_id = $1", [userId]);
    return true;
  }
};

module.exports = Wishlist;
