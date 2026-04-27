class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

const handleError = (error, context = "") => {
  console.error(`Error in ${context}:`, error.message);

  if (error.code === "23505") {
    throw new AppError("Duplicate entry found", 400);
  }
  if (error.code === "23503") {
    throw new AppError("Referenced record doesn't exist", 400);
  }

  throw new AppError(error.message, 500);
};

module.exports = { AppError, handleError };
