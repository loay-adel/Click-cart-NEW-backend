const db = require("../config/database");

const User = {
  findByEmail: async (email) => {
    const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    return rows[0];
  },
  
  create: async (userData) => {
    const { first_name, last_name, email, hashedPassword, role = 'customer' } = userData;
    const { rows } = await db.query(
      "INSERT INTO users (first_name, last_name, email, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, role",
      [first_name, last_name, email, hashedPassword, role]
    );
    return rows[0];
  }
};

module.exports = User;
