const { pool } = require("../config/database");

const Product = {
  findAll: async (limit = 10, offset = 0) => {
    const result = await pool.query(
      `SELECT id, title, description, price, category, thumbnail, rating, 
              available_quantity as "availableQuantity", discount,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM products 
       WHERE deleted_at IS NULL
       ORDER BY id 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },
  
  countAll: async () => {
    const result = await pool.query("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL");
    return parseInt(result.rows[0].count);
  },
  
  findById: async (id) => {
    const result = await pool.query(
      `SELECT id, title, description, price, category, thumbnail, rating, 
              available_quantity as "availableQuantity", discount,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM products 
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  },
  
  search: async (searchTerm, limit = 10, offset = 0) => {
    const result = await pool.query(
      `SELECT id, title, description, price, category, thumbnail, rating, 
              available_quantity as "availableQuantity", discount
       FROM products 
       WHERE deleted_at IS NULL AND (title ILIKE $1 OR description ILIKE $1)
       LIMIT $2 OFFSET $3`,
      [`%${searchTerm}%`, limit, offset]
    );
    return result.rows;
  },
  
  countSearch: async (searchTerm) => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND (title ILIKE $1 OR description ILIKE $1)",
      [`%${searchTerm}%`]
    );
    return parseInt(result.rows[0].count);
  },
  
  findByCategory: async (category, limit = 10, offset = 0) => {
    const result = await pool.query(
      `SELECT id, title, description, price, category, thumbnail, rating, 
              available_quantity as "availableQuantity", discount
       FROM products 
       WHERE deleted_at IS NULL AND category ILIKE $1 
       LIMIT $2 OFFSET $3`,
      [`%${category}%`, limit, offset]
    );
    return result.rows;
  },
  
  countByCategory: async (category) => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND category ILIKE $1",
      [`%${category}%`]
    );
    return parseInt(result.rows[0].count);
  },
  
  updateStock: async (client, productId, quantity) => {
    const result = await client.query(
      `UPDATE products 
       SET available_quantity = available_quantity - $1,
           updated_at = NOW()
       WHERE id = $2 AND available_quantity >= $1 AND deleted_at IS NULL
       RETURNING id, available_quantity`,
      [quantity, productId]
    );
    return result.rows[0];
  },
  
  create: async (productData) => {
    const { title, description, price, category, thumbnail, availableQuantity, discount } = productData;
    const result = await pool.query(
      `INSERT INTO products (title, description, price, category, thumbnail, available_quantity, discount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [title, description, price, category, thumbnail, availableQuantity, discount || 0]
    );
    return result.rows[0];
  },
  
  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let idx = 1;
    
    const allowedFields = ["title", "description", "price", "category", "thumbnail", "availableQuantity", "discount"];
    const dbFields = { availableQuantity: "available_quantity" };
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const dbField = dbFields[key] || key;
        fields.push(`${dbField} = $${idx++}`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      throw new Error("No valid fields to update");
    }
    
    values.push(id);
    const result = await pool.query(
      `UPDATE products SET ${fields.join(", ")}, updated_at = NOW() 
       WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values
    );
    return result.rows[0];
  },
  
  delete: async (id) => {
    const result = await pool.query(
      `UPDATE products SET deleted_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows[0];
  },
  
  findByPriceRange: async (minPrice, maxPrice, limit = 10, offset = 0) => {
    const result = await pool.query(
      `SELECT id, title, description, price, category, thumbnail, rating, 
              available_quantity as "availableQuantity", discount
       FROM products 
       WHERE deleted_at IS NULL AND price BETWEEN $1 AND $2 
       LIMIT $3 OFFSET $4`,
      [minPrice, maxPrice, limit, offset]
    );
    return result.rows;
  },
  
  countByPriceRange: async (minPrice, maxPrice) => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND price BETWEEN $1 AND $2",
      [minPrice, maxPrice]
    );
    return parseInt(result.rows[0].count);
  }
};

module.exports = Product;
