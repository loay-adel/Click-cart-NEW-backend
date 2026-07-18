class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const handleError = (error, context = "") => {
  if (error.code === "23505") {
    throw new AppError("Duplicate entry found", 409);
  }
  if (error.code === "23503") {
    throw new AppError("Referenced record doesn't exist", 400);
  }
  if (error.code === "23514") {
    throw new AppError(
      "Check constraint violation - likely insufficient stock",
      400,
    );
  }
  throw new AppError(error.message, 500);
};

module.exports = { AppError, handleError };
