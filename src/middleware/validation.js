const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password.length >= 6;
};

const validateOrderInput = (totalPrice, items) => {
  if (totalPrice <= 0) throw new Error("Total price must be positive");
  if (!items || items.length === 0) throw new Error("Order must have items");
  items.forEach(item => {
    if (item.quantity <= 0) throw new Error("Quantity must be positive");
    if (item.price < 0) throw new Error("Price cannot be negative");
  });
  return true;
};

module.exports = { validateEmail, validatePassword, validateOrderInput };
