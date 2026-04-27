const db = require("../config/database");

const Product = {
  // Get all products with pagination
  findAll: async (limit = 10, offset = 0) => {
    const result = await db.query(
      `SELECT id, title, description, price, category, thumbnail, rating, 
              available_quantity as "availableQuantity", discount
       FROM products 
       ORDER BY id 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },
  
  // Get product by ID
  findById: async (id) => {
    const result = await db.query(
      `SELECT id, title, description, price, category, thumbnail, rating, 
              available_quantity as "availableQuantity", discount
       FROM products 
       WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  },
  
  // Search products
  search: async (searchTerm, limit = 10, offset = 0) => {
    const result = await db.query(
      `SELECT * FROM products 
       WHERE title ILIKE $1 OR description ILIKE $1 
       LIMIT $2 OFFSET $3`,
      [`%${searchTerm}%`, limit, offset]
    );
    return result.rows;
  },
  
  // Get products by category
  findByCategory: async (category, limit = 10, offset = 0) => {
    const result = await db.query(
      `SELECT * FROM products 
       WHERE category ILIKE $1 
       LIMIT $2 OFFSET $3`,
      [`%${category}%`, limit, offset]
    );
    return result.rows;
  },
  
  // Update stock
  updateStock: async (productId, quantity) => {
    const result = await db.query(
      `UPDATE products 
       SET available_quantity = available_quantity - $1,
           updated_at = NOW()
       WHERE id = $2 
       RETURNING available_quantity`,
      [quantity, productId]
    );
    return result.rows[0];
  },
  
  // Create new product (admin)
  create: async (productData) => {
    const { title, description, price, category, thumbnail, availableQuantity, discount } = productData;
    const result = await db.query(
      `INSERT INTO products (title, description, price, category, thumbnail, available_quantity, discount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [title, description, price, category, thumbnail, availableQuantity, discount || 0]
    );
    return result.rows[0];
  },
  
  // Update product (admin)
  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let idx = 1;
    
    if (updates.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(updates.title);
    }
    if (updates.price !== undefined) {
      fields.push(`price = $${idx++}`);
      values.push(updates.price);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.availableQuantity !== undefined) {
      fields.push(`available_quantity = $${idx++}`);
      values.push(updates.availableQuantity);
    }
    
    values.push(id);
    const result = await db.query(
      `UPDATE products SET ${fields.join(", ")}, updated_at = NOW() 
       WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  },
  
  // Delete product (admin)
  delete: async (id) => {
    const result = await db.query(
      `DELETE FROM products WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.rows[0];
  }
};

module.exports = Product;
