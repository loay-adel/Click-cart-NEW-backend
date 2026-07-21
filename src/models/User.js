const { pool } = require("../config/database");

const User = {
  findByEmail: async (email) => {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return rows[0];
  },

  findById: async (id) => {
    const { rows } = await pool.query(
      "SELECT id, first_name, last_name, email, phone, role, created_at FROM users WHERE id = $1",
      [id],
    );
    return rows[0];
  },

  findAll: async (limit = 10, offset = 0) => {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, phone, role, created_at 
       FROM users 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows;
  },

  create: async (userData) => {
    const {
      first_name,
      last_name,
      email,
      hashedPassword,
      phone,
      role = "customer",
    } = userData;
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, phone, role) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, first_name, last_name, email, phone, role`,
      [first_name, last_name, email, hashedPassword, phone, role],
    );
    return rows[0];
  },

  update: async (id, updates) => {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowedFields = ["first_name", "last_name", "email", "phone", "role"];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() 
       WHERE id = $${idx} 
       RETURNING id, first_name, last_name, email, phone, role`,
      values,
    );
    return rows[0];
  },

  delete: async (id) => {
    const { rows } = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [id],
    );
    return rows[0];
  },

  countAll: async () => {
    const result = await pool.query("SELECT COUNT(*) FROM users");
    return parseInt(result.rows[0].count);
  },
};

module.exports = User;
