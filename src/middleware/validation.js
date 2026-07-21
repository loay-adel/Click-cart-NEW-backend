const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  const strongRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongRegex.test(password);
};

const validateOrderInput = (totalPrice, items) => {
  if (totalPrice <= 0) throw new Error("Total price must be positive");
  if (!items || items.length === 0) throw new Error("Order must have items");
  items.forEach((item) => {
    if (item.quantity <= 0) throw new Error("Quantity must be positive");
    if (item.price < 0) throw new Error("Price cannot be negative");
  });
  return true;
};

const sanitizeString = (str) => {
  if (!str || typeof str !== "string") return "";
  return str.trim().replace(/[<>]/g, "");
};

const validateId = (id) => {
  const num = parseInt(id);
  return !isNaN(num) && num > 0;
};

module.exports = {
  validateEmail,
  validatePassword,
  validateOrderInput,
  sanitizeString,
  validateId,
};
