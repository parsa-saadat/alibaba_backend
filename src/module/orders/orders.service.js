import { ObjectId } from 'mongodb';
import axios from 'axios';
import { compare, genSalt, hash } from 'bcrypt';

import { findOneUser, updateOneUser } from '../../models/controllers/users.controller.js';
import { deleteCarts, findCarts } from '../../models/controllers/carts.controller.js';
import { findOneAddress } from '../../models/controllers/address.controller.js';
import { findOneProduct, updateOneProduct } from '../../models/controllers/products.controller.js';
import { calculateEstimatedDelivery } from '../../utils/generators/delivery.generator.js';
import {
  findOneOrder,
  findOrders,
  insertOrder,
  updateOneOrder,
} from '../../models/controllers/orders.controller.js';
import { generateNumber } from '../../utils/generators/number.generator.js';
import { trackingCodeValidator } from '../../utils/validators/trachkingcode.validator.js';

export const preOrderService = async (requester) => {
  const {
    STATUS,
    KAVENEGAR_API_KEY: api_key,
    KAVENEGAR_VERIFY_TEMPLATE_NAME: template,
  } = process.env;

  const url = `https://api.kavenegar.com/v1/${api_key}/${template}/lookup.json`;

  const user = await findOneUser({ _id: requester._id });

  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  const cart = await findCarts({ user_id: user._id });

  if (cart.length == 0) throw new Error('Cart is empty', { cause: { code: 400 } });

  const code = generateNumber(5).toString();

  const salt = await genSalt(10);
  const hashedCode = await hash(code, salt);

  if (STATUS == 'DEV') {
    await updateOneUser(
      { _id: user._id },
      {
        can_order: {
          code: hashedCode,
          date: Date.now(),
        },
      },
    );
    console.log(code);
    return code;
  }

  const response = await axios.post(
    url,
    new URLSearchParams({
      receptor: user.phone,
      token: code,
      template: template,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  if (response.data.return.status !== 200)
    throw new Error('Code sending failed', {
      cause: { code: 500 },
    });

  await updateOneUser(
    { _id: user._id },
    {
      can_order: {
        code: hashedCode,
        date: Date.now(),
      },
    },
  );
};

export const createOrderService = async (data, requester) => {
  const { address_id, express = false, note, code } = data;

  if (!code) throw new Error('Code is required', { cause: { code: 400 } });

  if (!ObjectId.isValid(address_id))
    throw new Error('Invalid address id', { cause: { code: 400 } });

  const user = await findOneUser({ _id: requester._id });

  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (user.can_order == null)
    throw new Error('Missing verify order request', { cause: { code: 403 } });

  if (Date.now() - user.can_order.date > 1000 * 60 * 5)
    throw new Error('Code is expired', {
      cause: { code: 400 },
    });

  const checkCode = await compare(code, user.can_order.code);

  if (!checkCode) throw new Error('Invalid code', { cause: { code: 400 } });

  const cart = await findCarts({ user_id: user._id });

  if (cart.length == 0) throw new Error('Cart is empty', { cause: { code: 400 } });

  let address;

  if (address_id) address = await findOneAddress({ _id: address_id });
  else address = await findOneAddress({ user_id: user._id, 'address.is_default': true });

  if (!address) throw new Error('Address not found', { cause: { code: 404 } });

  if (address.user.toString() !== user._id.toString())
    throw new Error('Address access denied', { cause: { code: 400 } });

  let products = [];
  let amount = 0,
    discount_applied = 0;
  for (let i = 0; i < cart.length; i++) {
    const product = await findOneProduct({ _id: cart[i].product_id });
    let discount = 0;
    if (product.discount.percentage && new Date(product.discount.expirationDate) > new Date())
      discount = product.price * (product.discount.percentage / 100);

    discount_applied += discount;
    amount += product.price * cart[i].quantity;
    if (product.quantity - cart[i].quantity > 0)
      await updateOneProduct(
        { _id: product._id },
        { quantity: product.quantity - cart[i].quantity },
      );
    else
      await updateOneProduct({ _id: product._id }, { quantity: 0, stock_status: 'OUT OF STOCK' });

    products.push({
      _id: product._id,
      name: product.name,
      brand: product.brand,
      size: product?.size,
      category: product.category,
      color: product.color,
      price: product.price,
      discount: discount,
      quantity: cart[i].quantity,
    });
  }

  const newOrder = {
    user_id: user._id,
    currency: 'IRR',
    items: products,
    status: 'pending',
    status_history: [{ status: 'pending', timestamp: new Date() }],
    payment: {
      status: 'pending',
      method: 'zarinpal',
      transaction_id: null,
      payment_gateway: 'zarinpal',
      paid_at: null,
      amount: amount,
      discount_applied,
    },
    shipping: {
      tracking_code: null,
      carrier: express ? 'Tipax' : 'Post',
      estimated_delivery: calculateEstimatedDelivery(express),
      shipping_cost: Number(
        express ? process.env.EXPRESS_SHIPPING_COST : process.env.STANDARD_SHIPPING_COST,
      ),

      shipping_address: {
        _id: address._id,
        full_name: address.address.full_name,
        full_address: address.address.full_address,
        building_number: address.address.building_number,
        city: address.address.city,
        province: address.address.province,
        neighborhood: address.address.neighborhood,
        unit: address.address.unit,
        postal_code: address.address.postal_code,
      },
    },
    refund: {
      status: 'none',
      amount: null,
      penalty_amount: null,
      penalty_amount_percentage: null,
      refund_at: null,
    },
    customer_notes: note,
  };

  await deleteCarts({ user_id: user._id });

  await updateOneUser({ _id: user._id }, { can_order: null });

  return await insertOrder(newOrder);
};

export const updateOrderService = async (orderId, data, requester) => {
  const { status, tracking_code } = data;

  if (status === undefined && tracking_code === undefined) {
    throw new Error('Nothing to update', { cause: { code: 400 } });
  }

  if (!ObjectId.isValid(orderId)) {
    throw new Error('Invalid order id', { cause: { code: 400 } });
  }

  const order = await findOneOrder({ _id: orderId });

  if (!order) {
    throw new Error('Order not found', { cause: { code: 404 } });
  }

  const allow_status = ['processing', 'pending', 'shipped', 'send', 'delivered', 'canceled'];

  if (status !== undefined) {
    if (!allow_status.includes(status)) {
      throw new Error('Invalid status', { cause: { code: 400 } });
    }
    if (status === 'canceled' && order.payment.status === 'paid') {
      throw new Error('Order is paid, cannot be canceled', {
        cause: { code: 400 },
      });
    }
    if (status === 'delivered' && order.payment.status !== 'paid') {
      throw new Error('Order is not paid', { cause: { code: 400 } });
    }
  }

  if (tracking_code  && !trackingCodeValidator(tracking_code)) {
    throw new Error('Invalid tracking code', { cause: { code: 400 } });
  }

  const updateFields = {
    status_history: [
      ...order.status_history,
      {
        status: status || order.status,
        timestamp: new Date(),
      },
    ],
  };

  if (status !== undefined) {
    updateFields.status = status;
  }

  if (tracking_code !== undefined) {
    updateFields['shipping.tracking_code'] = tracking_code;
  }

  await updateOneOrder({ _id: orderId }, updateFields);

  return true;
};

export const payOrderService = async (orderId, requester) => {
  const {
    ZARINPAL_MERCHANT_ID,
    VERIFY_PAYMENT_CALLBACK_URL,
    ZARINPAL_PAY_URL,
    ZARINPAL_PAYMENT_REQUEST_URL,
  } = process.env;

  if (!orderId) throw new Error('Order id is required', { cause: { code: 400 } });

  if (!ObjectId.isValid(orderId)) throw new Error('Invalid order id', { cause: { code: 400 } });

  const order = await findOneOrder({ _id: orderId });

  if (!order) throw new Error('Order not found', { cause: { code: 404 } });

  if (order.user_id.toString() !== requester._id.toString())
    throw new Error('Order access denied', { cause: { code: 403 } });

  if (order.payment.status === 'paid')
    throw new Error('Order already paid', { cause: { code: 400 } });

  if (order.payment.amount < 1000)
    throw new Error('Minimum payment amount is 1000 Toman', { cause: { code: 400 } });

  const callbackURL = `${VERIFY_PAYMENT_CALLBACK_URL}?orderId=${order._id}`;

  const response = await axios.post(ZARINPAL_PAYMENT_REQUEST_URL, {
    merchant_id: ZARINPAL_MERCHANT_ID,
    amount: order.payment.amount - order.payment.discount_applied + order.shipping.shipping_cost,
    callback_url: callbackURL,
    currency: order.currency,
    order_id: order._id.toString(),
    description: `Payment for order ${order._id}`,
  });

  await updateOneOrder(
    { _id: order._id },
    {
      'payment.authority': response.data.data.authority,
    },
  );

  if (response.data.data && response.data.data.authority) {
    const paymentLink = `${ZARINPAL_PAY_URL}/${response.data.data.authority}`;
    return { url: paymentLink };
  } else {
    res.status(500).json({ error: 'Failed to generate payment link' });
  }
};

export const verifyOrderPaymentService = async (data) => {
  const { orderId, Authority, Status } = data;

  const { ZARINPAL_MERCHANT_ID, ZARINPAL_VRIFY_PAYMENT_URL } = process.env;

  if (!orderId || !Authority || !Status) throw new Error('Invalid data', { cause: { code: 400 } });

  if (Status !== 'OK') throw new Error('Payment failed', { cause: { code: 400 } });

  if (!ObjectId.isValid(orderId)) throw new Error('Invalid order id', { cause: { code: 400 } });

  const order = await findOneOrder({ _id: orderId });

  if (!order) throw new Error('Order not found', { cause: { code: 404 } });

  if (order.payment.authority !== Authority)
    throw new Error('Bad request', { cause: { code: 400 } });

  if (order.payment.status == 'paid')
    throw new Error('Order already paid', { cause: { code: 400 } });

  const response = await axios.post(ZARINPAL_VRIFY_PAYMENT_URL, {
    merchant_id: ZARINPAL_MERCHANT_ID,
    authority: Authority,
    amount: order.payment.amount - order.payment.discount_applied + order.shipping.shipping_cost,
  });

  if (response.data.data.code !== 100) throw new Error('Payment failed', { cause: { code: 400 } });

  await updateOneOrder(
    { _id: orderId },
    {
      status: 'processing',
      status_history: [
        ...order.status_history,
        { status: 'processing', timestamp: new Date() },
      ],
      'payment.transaction_id': response.data.data.ref_id,
      'payment.status': 'paid',
      'payment.paid_at': new Date(),
      'payment.fee': response.data.data.fee,
      'payment.shaparak_fee': response.data.data.shaparak_fee,
    },
  );

  true;
};

export const getOrdersService = async (userId, requester, filter) => {
  let { page, limit, pay_status, refund_status, desc, status } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;


  let user_id;

  if (!userId && requester.role !== 'admin') throw new Error('No Access', { cause: { code: 400 } });

  if (userId && !ObjectId.isValid(userId))
    throw new Error('Invalid user id', { cause: { code: 400 } });

  const user = await findOneUser({ _id: userId });

  if (userId) {
    if (!user) throw new Error('User not found', { cause: { code: 404 } });

    user_id = user._id;
  }

  if (user && user._id.toString() !== requester._id.toString() && user.role !== 'admin')
    throw new Error('No Access', { cause: { code: 400 } });

  let query = {};

  user_id ? (query.user_id = user_id) : undefined;
  pay_status ? (query['payment.status'] = pay_status) : undefined;
  refund_status ? (query['refund.status'] = refund_status) : undefined;
  status ? (query.status = status) : undefined;

  let orders = await findOrders(query, desc);

  const total = orders.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;

  orders = orders.slice(start, start + limit);

  return {
    data: orders,
    total,
    totalPages,
  };
};

export const getOrderService = async (orderId, requester) => {
  if (!ObjectId.isValid(orderId)) throw new Error('Invalid order id', { cause: { code: 400 } });

  const order = await findOneOrder({ _id: orderId });

  if (!order) {
    throw new Error('Order not found', { cause: { code: 404 } });
  }

  if (order.user_id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  return order;
};

// export const refundOrderService = async (orderId, requester) => {
//   if (!orderId) throw new Error('Order id is required', { cause: { code: 400 } });

//   if (!ObjectId.isValid(orderId)) throw new Error('Invalid order id', { cause: { code: 400 } });

//   const order = await findOneOrder({ _id: orderId });

//   if (!order) throw new Error('Order not found', { cause: { code: 404 } });

//   if (order.user_id.toString() !== requester._id.toString())
//     throw new Error('No Access', { cause: { code: 400 } });

//   if (order.status == 'canceled')
//     throw new Error('Order already canceled', { cause: { code: 400 } });

//   if (order.payment.status !== 'paid')
//     throw new Error('Order is not paid', { cause: { code: 400 } });

//   const { REFUND_PERCENTAGE, ZARINPAL_REFUND_URL, ZARINPAL_MERCHANT_ID } = process.env;

//   const penaltyAmount = order.payment.amount * (REFUND_PERCENTAGE / 100);
//   const refundAmount = order.payment.amount - penaltyAmount;

//   const response = await axios.post('https://sandbox.zarinpal.com/pg/v4/payment/refund.json', {
//     merchant_id: ZARINPAL_MERCHANT_ID,
//     authority: order.payment.authority,
//     amount: refundAmount,
//   });

//   if (response.data.data?.code == 100) {
//     await updateOneOrder(
//       { _id: orderId },
//       {
//         status: 'canceled',
//         status_history: [...order.status_history, { status: 'canceled', timestamp: new Date() }],
//         'refund.status': 'refunded',
//         'refund.amount': refundAmount,
//         'refund.penalty_amount': penaltyAmount,
//         'refund.penalty_amount_percentage': REFUND_PERCENTAGE,
//         'refund.refunded_at': new Date(),
//       },
//     );

//     return true;
//   } else throw new Error('Refund failed', { cause: { code: 400 } });
// };
