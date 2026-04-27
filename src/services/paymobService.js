const axios = require("axios");
const crypto = require("crypto");

class PaymobService {
  constructor() {
    this.apiUrl = process.env.PAYMOB_API_URL || "https://accept.paymob.com/api";
    this.apiKey = process.env.PAYMOB_API_KEY;
    this.integrationId = process.env.PAYMOB_INTEGRATION_ID;
    this.hmacSecret = process.env.PAYMOB_HMAC_SECRET;
    this.iframeId = process.env.PAYMOB_IFRAME_ID;
  }

  async authenticate() {
    try {
      const response = await axios.post(`${this.apiUrl}/auth/tokens`, {
        api_key: this.apiKey,
      });
      return response.data.token;
    } catch (error) {
      console.error(
        "Paymob auth error:",
        error.response?.data || error.message,
      );
      throw new Error("Payment authentication failed");
    }
  }

  async createOrder(token, amount, orderId, userId, billingData = {}) {
    try {
      const shippingData = {
        first_name: billingData.first_name || "Customer",
        last_name: billingData.last_name || "User",
        email: billingData.email || "customer@example.com",
        phone_number: billingData.phone_number || "01000000000",
        apartment: billingData.apartment || "NA",
        floor: billingData.floor || "NA",
        street: billingData.street || "NA",
        building: billingData.building || "NA",
        city: billingData.city || "Cairo",
        country: billingData.country || "Egypt",
      };

      const requestBody = {
        auth_token: token,
        delivery_needed: true,
        amount_cents: Math.round(amount * 100),
        currency: "EGP",
        merchant_order_id: orderId.toString(),
        items: [],
        shipping_data: shippingData,
      };

      console.log(
        "Paymob create order request:",
        JSON.stringify(requestBody, null, 2),
      );

      const response = await axios.post(
        `${this.apiUrl}/ecommerce/orders`,
        requestBody,
      );
      return response.data.id;
    } catch (error) {
      console.error(
        "Paymob create order error:",
        error.response?.data || error.message,
      );
      throw new Error(
        "Failed to create payment order: " +
          (error.response?.data?.message || error.message),
      );
    }
  }

  async generatePaymentKey(
    token,
    orderId,
    amount,
    userId,
    userEmail,
    billingData = {},
  ) {
    try {
      const billingDataFormatted = {
        apartment: billingData.apartment || "NA",
        email: userEmail || billingData.email || "customer@example.com",
        floor: billingData.floor || "NA",
        first_name: billingData.first_name || "Customer",
        street: billingData.street || "NA",
        building: billingData.building || "NA",
        phone_number: billingData.phone_number || "01000000000",
        shipping_method: "PKG",
        postal_code: "NA",
        city: billingData.city || "Cairo",
        country: billingData.country || "Egypt",
        last_name: billingData.last_name || "User",
        state: "NA",
      };

      const requestBody = {
        auth_token: token,
        amount_cents: Math.round(amount * 100),
        expiration: 3600,
        order_id: orderId,
        billing_data: billingDataFormatted,
        currency: "EGP",
        integration_id: parseInt(this.integrationId),
        lock_order_when_paid: false,
      };

      console.log(
        "Paymob payment key request:",
        JSON.stringify(requestBody, null, 2),
      );

      const response = await axios.post(
        `${this.apiUrl}/acceptance/payment_keys`,
        requestBody,
      );
      return response.data.token;
    } catch (error) {
      console.error(
        "Paymob payment key error:",
        error.response?.data || error.message,
      );
      throw new Error(
        "Failed to generate payment key: " +
          (error.response?.data?.message || error.message),
      );
    }
  }

  verifyHmac(data, hmacSignature) {
    const secret = this.hmacSecret;
    const calculatedHmac = crypto
      .createHmac("sha512", secret)
      .update(Buffer.from(JSON.stringify(data)).toString("base64"))
      .digest("hex");

    return calculatedHmac === hmacSignature;
  }

  async refundTransaction(transactionId, amount) {
    try {
      const token = await this.authenticate();
      const response = await axios.post(
        `${this.apiUrl}/acceptance/void_refund/refund`,
        {
          auth_token: token,
          transaction_id: transactionId,
          amount_cents: Math.round(amount * 100),
        },
      );
      return response.data;
    } catch (error) {
      console.error(
        "Paymob refund error:",
        error.response?.data || error.message,
      );
      throw new Error("Failed to process refund");
    }
  }

  async getTransactionStatus(transactionId) {
    try {
      const token = await this.authenticate();
      const response = await axios.get(
        `${this.apiUrl}/acceptance/transactions/${transactionId}`,
        {
          params: { auth_token: token },
        },
      );
      return response.data;
    } catch (error) {
      console.error(
        "Paymob transaction status error:",
        error.response?.data || error.message,
      );
      throw new Error("Failed to get transaction status");
    }
  }
}

module.exports = new PaymobService();
