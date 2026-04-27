const { gql } = require("apollo-server-express");

const typeDefs = gql`
  type Product {
    id: ID!
    title: String!
    description: String
    price: Float!
    category: String
    thumbnail: String
    rating: Float
    availableQuantity: Int
    discount: Int
    createdAt: String
    updatedAt: String
  }

  type User {
    id: ID!
    first_name: String!
    last_name: String!
    email: String!
    phone: String
    role: String!
    createdAt: String
  }

  type Order {
    id: ID!
    user_id: ID!
    total_price: Float!
    shipping_address: String!
    shipping_full_name: String
    shipping_city: String
    shipping_country: String
    payment_method: String
    shipping_price: Float
    tax_price: Float
    is_paid: Boolean
    paid_at: String
    is_delivered: Boolean
    created_at: String
    item_count: Int
    total_items: Int
    transaction_id: String
    items: [OrderItem]
    user: User
  }

  type OrderItem {
    id: ID!
    order_id: ID!
    product_id: ID!
    quantity: Int!
    price: Float!
    product: Product
    title: String
    thumbnail: String
  }

  type CartItem {
    id: ID!
    user_id: ID!
    product_id: ID!
    quantity: Int!
    title: String
    description: String
    price: Float
    subtotal: Float
    available_quantity: Int
    product: Product
  }

  type WishlistItem {
    id: ID!
    user_id: ID!
    product_name: String!
    added_at: String
    product: Product
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type OrderStats {
    totalOrders: Int!
    totalSpent: Float!
    averageOrderValue: Float!
    lastOrderDate: String
  }

  type PaginatedProducts {
    products: [Product]!
    total: Int!
    page: Int!
    limit: Int!
    totalPages: Int!
  }

  type PaymentResponse {
    success: Boolean!
    paymentKey: String
    iframeId: String
    redirectUrl: String
    transactionId: String
    message: String
  }

  type TransactionStatus {
    id: Int
    pending: Boolean
    amount_cents: Int
    success: Boolean
    is_refunded: Boolean
    captured_amount: Int
    error_occured: Boolean
    data: String
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
    price: Float!
  }

  input ProductInput {
    title: String!
    description: String!
    price: Float!
    category: String!
    thumbnail: String!
    availableQuantity: Int!
    discount: Int
  }

  input UpdateProductInput {
    title: String
    description: String
    price: Float
    category: String
    thumbnail: String
    availableQuantity: Int
    discount: Int
  }

  input StockUpdateInput {
    productId: ID!
    quantity: Int!
  }

  input BillingInput {
    first_name: String!
    last_name: String!
    email: String!
    phone_number: String!
    apartment: String
    floor: String
    street: String
    building: String
    city: String
    country: String
  }

  type Query {
    # Products
    products(limit: Int, offset: Int): PaginatedProducts!
    product(id: ID!): Product
    productsByCategory(category: String!, limit: Int, offset: Int): PaginatedProducts!
    searchProducts(searchTerm: String!, limit: Int, offset: Int): PaginatedProducts!
    productsByPriceRange(minPrice: Float!, maxPrice: Float!, limit: Int, offset: Int): PaginatedProducts!
    
    # Orders
    userOrders(userId: ID!, limit: Int, offset: Int): [Order]
    order(id: ID!): Order
    allOrders(limit: Int, offset: Int): [Order]
    
    # Cart
    cart(userId: ID!): [CartItem]
    cartTotal(userId: ID!): Float
    
    # Wishlist
    wishlist(userId: ID!): [WishlistItem]
    
    # User
    me: User
    userStats(userId: ID!): OrderStats
    allUsers(limit: Int, offset: Int): [User]
  }

  type Mutation {
    # Auth
    register(
      first_name: String!
      last_name: String!
      email: String!
      password: String!
      phone: String
    ): AuthPayload
    
    login(email: String!, password: String!): AuthPayload
    
    # Orders
    placeOrder(
      userId: ID!
      shippingAddress: String!
      shippingFullName: String!
      shippingCity: String!
      paymentMethod: String!
    ): Order
    
    createOrder(
      userId: ID!
      totalPrice: Float!
      shippingAddress: String!
      shippingFullName: String!
      shippingCity: String!
      paymentMethod: String!
      items: [OrderItemInput]!
    ): Order
    
    updateOrderStatus(
      orderId: ID!
      isPaid: Boolean
      isDelivered: Boolean
    ): Order
    
    updatePaymentStatus(
      orderId: ID!
      isPaid: Boolean!
      paymentMethod: String
    ): Order
    
    updateDeliveryStatus(
      orderId: ID!
      isDelivered: Boolean!
    ): Order
    
    cancelOrder(
      orderId: ID!
      userId: ID!
    ): Boolean
    
    # Cart
    addToCart(
      userId: ID!
      productId: ID!
      quantity: Int!
    ): CartItem
    
    removeFromCart(
      userId: ID!
      productId: ID!
    ): Boolean
    
    updateCartItem(
      userId: ID!
      productId: ID!
      quantity: Int!
    ): CartItem
    
    clearCart(userId: ID!): Boolean
    
    # Wishlist
    addToWishlist(
      userId: ID!
      productName: String!
    ): WishlistItem
    
    removeFromWishlist(
      userId: ID!
      wishlistItemId: ID!
    ): Boolean
    
    clearWishlist(userId: ID!): Boolean
    
    # Admin Product Management
    createProduct(input: ProductInput!): Product
    
    updateProduct(id: ID!, input: UpdateProductInput!): Product
    
    deleteProduct(id: ID!): Boolean
    
    bulkUpdateStock(updates: [StockUpdateInput]!): Boolean
    
    # Payment
    initiatePayment(
      userId: ID!
      orderId: ID!
      billingData: BillingInput!
    ): PaymentResponse
    
    verifyPayment(
      orderId: ID!
      hmac: String!
      paymentData: String!
    ): Boolean
    
    refundPayment(
      orderId: ID!
      transactionId: String!
      amount: Float!
    ): PaymentResponse
    
    getPaymentStatus(
      orderId: ID!
    ): TransactionStatus
  }
`;

module.exports = typeDefs;
