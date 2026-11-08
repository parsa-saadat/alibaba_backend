import { ObjectId } from 'mongodb';
import { randomInt } from 'crypto';

import { findOneUser } from '../../model/controller/user.controller.js';
import { deleteCarts, findCarts } from '../../model/controller/cart.controller.js';
import { findOneAddress } from '../../model/controller/address.controller.js';
import { findOneProduct, updateOneProduct } from '../../model/controller/product.controller.js';
import { findOneStore } from '../../model/controller/store.controller.js';
import { findOnePlan } from '../../model/controller/plan.controller.js';
import { findOneOrder, findOrders, insertOrder, updateOneOrder } from '../../model/controller/order.controller.js';
import {
  findOneSubOrder,
  findSubOrders,
  insertSubOrder,
  updateOneSubOrder,
} from '../../model/controller/sub-order.controller.js';

// ─── Constants ───
const MAX_NOTE_LENGTH = 500;
const MAX_REASON_LENGTH = 500;
const MAX_ITEM_QUANTITY = 10000;

const ALLOWED_CURRENCIES = process.env.ALLOWED_CURRENCIES
  ? process.env.ALLOWED_CURRENCIES.split(',').map((c) => c.trim().toUpperCase())
  : ['IRR'];

const FINALIZED_STATUS = 'finalized';
const CANCEL_PENALTY_PERCENTAGE = Number(process.env.CANCEL_PENALTY_PERCENTAGE) || 10;

const TERMINAL_STATUSES = ['delivered', 'cancelled', 'rejected', FINALIZED_STATUS];

const CANCELLABLE_STATUSES = [
  'awaiting_approval',
  'preparing',
  'ready_to_ship',
];

const STATUS_TRANSITIONS = {
  awaiting_approval: ['preparing', 'rejected', 'cancelled'],
  preparing: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
  rejected: [],
  finalized: [],
};

const SELLER_STATUS_TRANSITIONS = ['ready_to_ship', 'shipped', 'delivered'];

// ─────────────────────────────────────────────
// createOrderService
// ─────────────────────────────────────────────
export const createOrderService = async (data, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  const { address_id, note } = data || {};

  if (address_id !== undefined && address_id !== null) {
    if (typeof address_id !== 'string' || !ObjectId.isValid(address_id))
      throw new Error('Invalid address id', { cause: { code: 400 } });
  }

  let customerNotes = null;
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string')
      throw new Error('Note must be a string', { cause: { code: 400 } });

    const trimmed = note.trim();

    if (trimmed.length > MAX_NOTE_LENGTH)
      throw new Error(`Note cannot exceed ${MAX_NOTE_LENGTH} characters`, {
        cause: { code: 400 },
      });

    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed))
      throw new Error('Note contains invalid characters', { cause: { code: 400 } });

    if (trimmed && !/^[\p{L}\p{N}\s.,!?؟،؛:()\-_@#%&*+=\/\\'"«»…]+$/u.test(trimmed))
      throw new Error('Note contains invalid characters', { cause: { code: 400 } });

    customerNotes = trimmed || null;
  }

  const user = await findOneUser({ _id: requester._id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  const cart = await findCarts({ user_id: user._id });
  if (cart.length === 0) throw new Error('Cart is empty', { cause: { code: 400 } });

  let address;
  if (address_id) address = await findOneAddress({ _id: address_id });
  else address = await findOneAddress({ user: user._id, 'address.is_default': true });

  if (!address) throw new Error('Address not found', { cause: { code: 404 } });
  if (String(address.user) !== String(user._id))
    throw new Error('Address access denied', { cause: { code: 403 } });

  const groups = new Map();
  const stockMap = new Map();
  const storeCache = new Map();
  const sellerCache = new Map();
  let currency = null;

  for (let i = 0; i < cart.length; i++) {
    if (!cart[i].product_id || !ObjectId.isValid(cart[i].product_id))
      throw new Error('Invalid product in cart', { cause: { code: 400 } });

    if (!Number.isInteger(cart[i].quantity) || cart[i].quantity < 1)
      throw new Error('Invalid product quantity in cart', { cause: { code: 400 } });

    if (cart[i].quantity > MAX_ITEM_QUANTITY)
      throw new Error(`Quantity cannot exceed ${MAX_ITEM_QUANTITY}`, { cause: { code: 400 } });

    const product = await findOneProduct({ _id: cart[i].product_id });
    if (!product) throw new Error('Product not found', { cause: { code: 404 } });
    if (!product.store_id)
      throw new Error(`Product ${product.name} has no store`, { cause: { code: 400 } });

    if (String(product.status || '').toLowerCase() !== 'active')
      throw new Error(`Product ${product.name} is not active`, { cause: { code: 400 } });

    const storeKey = product.store_id.toString();
    if (!storeCache.has(storeKey)) {
      const store = await findOneStore({ _id: product.store_id });
      if (!store) throw new Error('Store not found', { cause: { code: 404 } });

      if (String(store.status || '').toLowerCase() !== 'enable')
        throw new Error(`Store ${store.name} is not enabled`, { cause: { code: 400 } });

      storeCache.set(storeKey, store);
    }
    const store = storeCache.get(storeKey);

    const sellerKey = String(store.user);
    if (!sellerCache.has(sellerKey)) {
      const seller = await findOneUser({ _id: store.user });
      if (!seller) throw new Error('Store seller not found', { cause: { code: 404 } });

      if (seller.seller_approved_status !== true)
        throw new Error(`Store ${store.name} seller is not approved`, { cause: { code: 400 } });

      if (String(seller.seller_active_status || '').toLowerCase() !== 'active')
        throw new Error(`Store ${store.name} seller is not active`, { cause: { code: 400 } });

      if (!seller.seller_plan?.plan_id)
        throw new Error(`Store ${store.name} has no active plan`, { cause: { code: 403 } });

      const sellerPlan = await findOnePlan({ _id: seller.seller_plan.plan_id });
      if (!sellerPlan)
        throw new Error(`Store ${store.name} plan not found`, { cause: { code: 403 } });

      if (sellerPlan.status !== 'ACTIVE')
        throw new Error(`Store ${store.name} plan is not active`, { cause: { code: 403 } });

      const startedAt = new Date(seller.seller_plan.start_at).getTime();
      if (!Number.isFinite(startedAt))
        throw new Error(`Store ${store.name} plan start date is invalid`, { cause: { code: 403 } });

      if (sellerPlan.duration_days !== null) {
        const planExpiry = startedAt + sellerPlan.duration_days * 24 * 60 * 60 * 1000;
        if (Date.now() >= planExpiry)
          throw new Error(`Store ${store.name} plan has expired`, { cause: { code: 403 } });
      }

      sellerCache.set(sellerKey, seller);
    }
    const seller = sellerCache.get(sellerKey);

    const stockStatus = String(product.stock_status || '').toUpperCase().replace(/[\s_]/g, '_');
    if (stockStatus !== 'IN_STOCK')
      throw new Error(`Product ${product.name} is not available`, { cause: { code: 400 } });

    if (product.stock < cart[i].quantity)
      throw new Error(`Not enough stock for ${product.name}`, { cause: { code: 400 } });

    const productCurrency = String(product.price?.currency || 'IRR').toUpperCase();
    const productAmount = Number(product.price?.amount);

    if (!Number.isFinite(productAmount) || productAmount <= 0)
      throw new Error(`Product ${product.name} has invalid price`, { cause: { code: 400 } });

    if (!ALLOWED_CURRENCIES.includes(productCurrency))
      throw new Error(`Currency ${productCurrency} is not allowed`, { cause: { code: 400 } });

    if (!currency) currency = productCurrency;
    else if (currency !== productCurrency)
      throw new Error('All products must have same currency', { cause: { code: 400 } });

    let discountPercentage = 0;
    let discountAmount = 0;
    if (
      product.discount?.percentage &&
      product.discount?.expirationDate &&
      new Date(product.discount.expirationDate) > new Date()
    ) {
      discountPercentage = product.discount.percentage;
      discountAmount = productAmount * (discountPercentage / 100);
    }

    if (!groups.has(sellerKey)) {
      groups.set(sellerKey, {
        seller,
        store,
        items: [],
        amount: 0,
        discount_applied: 0,
      });
    }

    const group = groups.get(sellerKey);
    group.items.push({
      product_id: product._id,
      name: product.name,
      brand: product.brand,
      images_id: product.images_id,
      price: { currency: productCurrency, amount: productAmount },
      discount: { percentage: discountPercentage, amount: discountAmount },
      quantity: cart[i].quantity,
    });
    group.amount += productAmount * cart[i].quantity;
    group.discount_applied += discountAmount * cart[i].quantity;

    const productKey = product._id.toString();
    if (!stockMap.has(productKey)) stockMap.set(productKey, { product, quantity: 0 });
    stockMap.get(productKey).quantity += cart[i].quantity;

    if (stockMap.get(productKey).quantity > product.stock)
      throw new Error(`Not enough stock for ${product.name}`, { cause: { code: 400 } });
  }

  const decremented = [];
  try {
    for (const { product, quantity } of stockMap.values()) {
      const fresh = await findOneProduct({ _id: product._id });
      if (!fresh || fresh.stock < quantity)
        throw new Error(`Not enough stock for ${product.name}`, { cause: { code: 400 } });

      const newStock = fresh.stock - quantity;
      if (newStock > 0)
        await updateOneProduct({ _id: fresh._id }, { stock: newStock });
      else
        await updateOneProduct({ _id: fresh._id }, { stock: 0, stock_status: 'OUT_OF_STOCK' });

      decremented.push({ product: fresh, quantity });
    }
  } catch (err) {
    for (const { product, quantity } of decremented) {
      const fresh = await findOneProduct({ _id: product._id });
      if (!fresh) continue;
      await updateOneProduct(
        { _id: fresh._id },
        { stock: fresh.stock + quantity, stock_status: 'IN_STOCK' },
      );
    }
    throw err;
  }

  const ts = Date.now().toString();
  let rand = '';
  for (let i = 0; i < 3; i++) rand += randomInt(0, 10);
  const parentOrderNumber = ts + rand;

  const subOrders = [];
  let subIndex = 0;
  let totalAmount = 0;
  let totalDiscount = 0;

  try {
    for (const group of groups.values()) {
      subIndex++;
      totalAmount += group.amount;
      totalDiscount += group.discount_applied;

      const subOrder = {
        type: 'sub',
        parent_order_id: null,
        order_number: `${parentOrderNumber}-${subIndex}`,
        customer_id: user._id,
        seller_id: group.seller._id,
        store_id: group.store._id,
        items: group.items,
        amount: group.amount,
        discount_applied: group.discount_applied,

        status: 'awaiting_approval',
        status_history: [
          {
            status: 'awaiting_approval',
            by: 'system',
            by_id: null,
            note: 'Sub-order created, awaiting seller approval',
            timestamp: new Date(),
          },
        ],

        approval: { approved: false, approved_at: null, approved_by: null },
        cancellation: {
          cancelled: false,
          cancelled_at: null,
          cancelled_by: null,
          cancelled_by_id: null,
          reason: null,
        },
        refund: {
          status: 'none',
          amount: null,
          penalty_amount: null,
          penalty_amount_percentage: null,
          refund_at: null,
        },
        created_at: new Date(),
        update_at: new Date(),
      };

      subOrders.push(await insertSubOrder(subOrder));
    }

    const finalAmount = totalAmount - totalDiscount;

    const parent = await insertOrder({
      type: 'parent',
      order_number: parentOrderNumber,
      customer_id: user._id,
      sub_order_ids: subOrders.map((s) => s._id),
      paid_sub_orders: [],
      currency,
      total_amount: totalAmount,
      total_discount: totalDiscount,
      final_amount: finalAmount,
      paid_amount: 0,
      payment: {
        status: 'pending',
        currency,
        method: null,
        transaction_id: null,
        payment_gateway: null,
        authority: null,
        ref_id: null,
        paid_at: null,
        fee: null,
        shaparak_fee: null,
        amount: null,
        sub_orders_snapshot: [],
      },
      cancellation_summary: {
        cancelled_sub_orders: [],
        rejected_sub_orders: [],
        finalized_sub_orders: [],
        total_refunded: 0,
        pending_refund: 0,
      },
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
      customer_notes: customerNotes,
      created_at: new Date(),
      update_at: new Date(),
    });

    for (let i = 0; i < subOrders.length; i++)
      await updateOneSubOrder({ _id: subOrders[i]._id }, { parent_order_id: parent._id });

    await deleteCarts({ user_id: user._id });

    return { parent, sub_orders: subOrders };
  } catch (err) {
    for (const { product, quantity } of decremented) {
      const fresh = await findOneProduct({ _id: product._id });
      if (!fresh) continue;
      await updateOneProduct(
        { _id: fresh._id },
        { stock: fresh.stock + quantity, stock_status: 'IN_STOCK' },
      );
    }
    throw err;
  }
};

// ─────────────────────────────────────────────
// approveSubOrderService — فروشنده فوری تایید می‌کنه (بدون چک پرداخت)
// ─────────────────────────────────────────────
export const approveSubOrderService = async (subOrderId, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  if (!subOrderId || !ObjectId.isValid(subOrderId))
    throw new Error('Invalid sub-order id', { cause: { code: 400 } });

  const sub = await findOneSubOrder({ _id: subOrderId });
  if (!sub) throw new Error('Sub-order not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = String(sub.seller_id) === String(requester._id);

  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

  if (sub.status !== 'awaiting_approval')
    throw new Error(
      `Cannot approve sub-order in status: ${sub.status}`,
      { cause: { code: 400 } },
    );

  const now = new Date();

  await updateOneSubOrder(
    { _id: subOrderId },
    {
      status: 'preparing',
      status_history: [
        ...(sub.status_history || []),
        {
          status: 'preparing',
          by: isAdmin ? 'admin' : 'seller',
          by_id: requester._id,
          note: 'Order approved',
          timestamp: now,
        },
      ],
      approval: {
        approved: true,
        approved_at: now,
        approved_by: requester._id,
      },
    },
  );

  return await findOneSubOrder({ _id: subOrderId });
};

// ─────────────────────────────────────────────
// cancelSubOrderService — جریمه فقط برای user
// ─────────────────────────────────────────────
export const cancelSubOrderService = async (subOrderId, data, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  if (!subOrderId || !ObjectId.isValid(subOrderId))
    throw new Error('Invalid sub-order id', { cause: { code: 400 } });

  const reason = data?.reason;

  if (reason === undefined || reason === null)
    throw new Error('Cancellation reason is required', { cause: { code: 400 } });

  if (typeof reason !== 'string')
    throw new Error('Reason must be a string', { cause: { code: 400 } });

  const trimmedReason = reason.trim();

  if (!trimmedReason)
    throw new Error('Reason cannot be empty', { cause: { code: 400 } });

  if (trimmedReason.length > MAX_REASON_LENGTH)
    throw new Error(`Reason cannot exceed ${MAX_REASON_LENGTH} characters`, {
      cause: { code: 400 },
    });

  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmedReason))
    throw new Error('Reason contains invalid characters', { cause: { code: 400 } });

  const sub = await findOneSubOrder({ _id: subOrderId });
  if (!sub) throw new Error('Sub-order not found', { cause: { code: 404 } });

  const parent = await findOneOrder({ _id: sub.parent_order_id });
  if (!parent) throw new Error('Parent order not found', { cause: { code: 404 } });

  const isPaid = parent.payment?.status === 'paid';

  const isAdmin = requester.role === 'admin';
  const isCustomer = String(sub.customer_id) === String(requester._id);
  const isSeller = String(sub.seller_id) === String(requester._id);

  if (!isAdmin && !isCustomer && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

  if (TERMINAL_STATUSES.includes(sub.status))
    throw new Error(`Sub-order is already in terminal state: ${sub.status}`, {
      cause: { code: 400 },
    });

  if (!CANCELLABLE_STATUSES.includes(sub.status))
    throw new Error(
      `Cannot cancel sub-order in status: ${sub.status}. Contact support.`,
      { cause: { code: 400 } },
    );

  let finalStatus;
  let cancelledBy;

  if (isSeller && !isAdmin && sub.status === 'awaiting_approval') {
    finalStatus = 'rejected';
    cancelledBy = 'seller';
  } else if (isSeller && !isAdmin) {
    finalStatus = 'cancelled';
    cancelledBy = 'seller';
  } else if (isCustomer && !isAdmin) {
    finalStatus = 'cancelled';
    cancelledBy = 'user';
  } else {
    finalStatus = 'cancelled';
    cancelledBy = 'admin';
  }

  const wasPaid =
    isPaid &&
    Array.isArray(parent.paid_sub_orders) &&
    parent.paid_sub_orders.some((id) => String(id) === String(sub._id));

  let refundData = {
    status: 'none',
    amount: null,
    penalty_amount: null,
    penalty_amount_percentage: null,
    refund_at: null,
  };

  if (wasPaid) {
    const baseAmount = sub.amount - sub.discount_applied;

    // ⭐ جریمه فقط وقتی کاربر خودش کنسل کرده
    const penaltyPercentage = cancelledBy === 'user' ? CANCEL_PENALTY_PERCENTAGE : 0;

    const penaltyAmount = Math.round(baseAmount * (penaltyPercentage / 100));
    const refundAmount = baseAmount - penaltyAmount;

    refundData = {
      status: 'pending',
      amount: refundAmount,
      penalty_amount: penaltyAmount,
      penalty_amount_percentage: penaltyPercentage,
      refund_at: null,
    };
  }

  const now = new Date();

  await updateOneSubOrder(
    { _id: subOrderId },
    {
      status: finalStatus,
      status_history: [
        ...(sub.status_history || []),
        {
          status: finalStatus,
          by: cancelledBy,
          by_id: requester._id,
          note: trimmedReason,
          timestamp: now,
        },
      ],
      cancellation: {
        cancelled: true,
        cancelled_at: now,
        cancelled_by: cancelledBy,
        cancelled_by_id: requester._id,
        reason: trimmedReason,
      },
      refund: refundData,
    },
  );

  // ─── بازگرداندن موجودی ───
  for (const item of sub.items || []) {
    if (!item?.product_id || !ObjectId.isValid(item.product_id)) continue;
    if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;

    const fresh = await findOneProduct({ _id: item.product_id });
    if (!fresh) continue;

    await updateOneProduct(
      { _id: fresh._id },
      { stock: (fresh.stock || 0) + item.quantity, stock_status: 'IN_STOCK' },
    );
  }

  // ─── بازمحاسبه‌ی parent ───
  const allSubs = await findSubOrders({ parent_order_id: sub.parent_order_id });
  const excludedStatuses = ['rejected', 'cancelled', FINALIZED_STATUS];
  const activeSubs = allSubs.filter((s) => !excludedStatuses.includes(s.status));

  const totalAmount = activeSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalDiscount = activeSubs.reduce((sum, s) => sum + (s.discount_applied || 0), 0);
  const finalAmount = totalAmount - totalDiscount;

  const paidIds = new Set((parent.paid_sub_orders || []).map((id) => String(id)));

  const pendingRefunds = allSubs.filter(
    (s) =>
      excludedStatuses.includes(s.status) &&
      paidIds.has(String(s._id)) &&
      s.refund?.status === 'pending',
  );
  const completedRefunds = allSubs.filter((s) => s.refund?.status === 'completed');

  const pendingRefund = pendingRefunds.reduce((sum, s) => sum + (s.refund?.amount || 0), 0);
  const totalRefunded = completedRefunds.reduce((sum, s) => sum + (s.refund?.amount || 0), 0);

  await updateOneOrder(
    { _id: sub.parent_order_id },
    {
      total_amount: totalAmount,
      total_discount: totalDiscount,
      final_amount: finalAmount,
      cancellation_summary: {
        cancelled_sub_orders: allSubs.filter((s) => s.status === 'cancelled').map((s) => s._id),
        rejected_sub_orders: allSubs.filter((s) => s.status === 'rejected').map((s) => s._id),
        finalized_sub_orders: allSubs.filter((s) => s.status === FINALIZED_STATUS).map((s) => s._id),
        total_refunded: totalRefunded,
        pending_refund: pendingRefund,
      },
    },
  );

  return await findOneSubOrder({ _id: subOrderId });
};

// ─────────────────────────────────────────────
// updateSubOrderStatusService
// ─────────────────────────────────────────────
export const updateSubOrderStatusService = async (subOrderId, data, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  if (!subOrderId || !ObjectId.isValid(subOrderId))
    throw new Error('Invalid sub-order id', { cause: { code: 400 } });

  if (!data?.status || typeof data.status !== 'string')
    throw new Error('Status is required', { cause: { code: 400 } });

  const newStatus = data.status.trim().toLowerCase();

  const validStatuses = ['preparing', 'ready_to_ship', 'shipped', 'delivered', FINALIZED_STATUS];

  if (!validStatuses.includes(newStatus))
    throw new Error(
      `Invalid status. Allowed: ${validStatuses.join(', ')}`,
      { cause: { code: 400 } },
    );

  let note = null;
  if (data?.note !== undefined && data?.note !== null) {
    if (typeof data.note !== 'string')
      throw new Error('Note must be a string', { cause: { code: 400 } });

    const trimmedNote = data.note.trim();

    if (trimmedNote.length > MAX_NOTE_LENGTH)
      throw new Error(`Note cannot exceed ${MAX_NOTE_LENGTH} characters`, { cause: { code: 400 } });

    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmedNote))
      throw new Error('Note contains invalid characters', { cause: { code: 400 } });

    note = trimmedNote || null;
  }

  const sub = await findOneSubOrder({ _id: subOrderId });
  if (!sub) throw new Error('Sub-order not found', { cause: { code: 404 } });

  const parent = await findOneOrder({ _id: sub.parent_order_id });
  if (!parent) throw new Error('Parent order not found', { cause: { code: 404 } });

  if (parent.payment?.status !== 'paid')
    throw new Error('Order must be paid before status change', { cause: { code: 400 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = String(sub.seller_id) === String(requester._id);

  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

  if (sub.status === FINALIZED_STATUS)
    throw new Error('Sub-order is finalized and cannot be changed', { cause: { code: 400 } });

  if (sub.status === newStatus)
    throw new Error('Sub-order already has this status', { cause: { code: 400 } });

  if (!isAdmin) {
    if (!SELLER_STATUS_TRANSITIONS.includes(newStatus))
      throw new Error(
        `Seller cannot set status to: ${newStatus}. Use approve/cancel routes or allowed transitions: ${SELLER_STATUS_TRANSITIONS.join(', ')}`,
        { cause: { code: 403 } },
      );

    if (!STATUS_TRANSITIONS[sub.status]?.includes(newStatus))
      throw new Error(
        `Invalid transition: ${sub.status} → ${newStatus}`,
        { cause: { code: 400 } },
      );
  }

  const now = new Date();

  const update = {
    status: newStatus,
    status_history: [
      ...(sub.status_history || []),
      {
        status: newStatus,
        by: isAdmin ? 'admin' : 'seller',
        by_id: requester._id,
        note,
        timestamp: now,
      },
    ],
  };

  let shouldRestoreStock = false;

  if (newStatus === FINALIZED_STATUS) {
    const wasPaid =
      Array.isArray(parent.paid_sub_orders) &&
      parent.paid_sub_orders.some((id) => String(id) === String(sub._id));

    if (wasPaid) {
      const baseAmount = sub.amount - sub.discount_applied;

      update.cancellation = {
        cancelled: true,
        cancelled_at: now,
        cancelled_by: 'admin',
        cancelled_by_id: requester._id,
        reason: note || 'Finalized by admin',
      };

      update.refund = {
        status: 'pending',
        amount: baseAmount,
        penalty_amount: 0,
        penalty_amount_percentage: 0,
        refund_at: null,
      };
    }

    shouldRestoreStock = ['awaiting_approval', 'preparing', 'ready_to_ship'].includes(sub.status);
  }

  await updateOneSubOrder({ _id: subOrderId }, update);

  if (shouldRestoreStock) {
    for (const item of sub.items || []) {
      if (!item?.product_id || !ObjectId.isValid(item.product_id)) continue;
      if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;

      const fresh = await findOneProduct({ _id: item.product_id });
      if (!fresh) continue;

      await updateOneProduct(
        { _id: fresh._id },
        { stock: (fresh.stock || 0) + item.quantity, stock_status: 'IN_STOCK' },
      );
    }
  }

  if (newStatus === FINALIZED_STATUS) {
    const allSubs = await findSubOrders({ parent_order_id: sub.parent_order_id });
    const excludedStatuses = ['rejected', 'cancelled', FINALIZED_STATUS];
    const activeSubs = allSubs.filter((s) => !excludedStatuses.includes(s.status));

    const totalAmount = activeSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalDiscount = activeSubs.reduce((sum, s) => sum + (s.discount_applied || 0), 0);
    const finalAmount = totalAmount - totalDiscount;

    const paidIds = new Set((parent.paid_sub_orders || []).map((id) => String(id)));
    const pendingRefunds = allSubs.filter(
      (s) =>
        excludedStatuses.includes(s.status) &&
        paidIds.has(String(s._id)) &&
        s.refund?.status === 'pending',
    );
    const completedRefunds = allSubs.filter((s) => s.refund?.status === 'completed');

    const pendingRefund = pendingRefunds.reduce((sum, s) => sum + (s.refund?.amount || 0), 0);
    const totalRefunded = completedRefunds.reduce((sum, s) => sum + (s.refund?.amount || 0), 0);

    await updateOneOrder(
      { _id: sub.parent_order_id },
      {
        total_amount: totalAmount,
        total_discount: totalDiscount,
        final_amount: finalAmount,
        cancellation_summary: {
          cancelled_sub_orders: allSubs.filter((s) => s.status === 'cancelled').map((s) => s._id),
          rejected_sub_orders: allSubs.filter((s) => s.status === 'rejected').map((s) => s._id),
          finalized_sub_orders: allSubs.filter((s) => s.status === FINALIZED_STATUS).map((s) => s._id),
          total_refunded: totalRefunded,
          pending_refund: pendingRefund,
        },
      },
    );
  }

  return await findOneSubOrder({ _id: subOrderId });
};


export const getOrdersService = async (filter = {}, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  let { page = 1, limit = 10, desc } = filter;
  limit = Number(limit) || 10;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1)
    throw new Error('Page is not valid', { cause: { code: 400 } });

  const isDesc = desc === 'true' || desc === true;

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;

  // ⭐ فروشنده نباید از این endpoint استفاده کنه
  if (isSeller && !isAdmin)
    throw new Error('Sellers must use /order/sub/parent/:parentId endpoint', {
      cause: { code: 403 },
    });

  let parents = [];

  if (isAdmin) {
    parents = await findOrders({}, isDesc);
  } else {
    parents = await findOrders({ customer_id: requester._id }, isDesc);
  }

  const total = parents.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  parents = parents.slice(start, start + limit);

  const data = [];
  for (const p of parents) {
    const subs = await findSubOrders({ parent_order_id: p._id });
    data.push({ ...p, sub_orders: subs });
  }

  return { data, total, totalPages };
};

// ─────────────────────────────────────────────
// getOrderService — تک parent order
// ─────────────────────────────────────────────
export const getOrderService = async (orderId, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  if (!orderId || !ObjectId.isValid(orderId))
    throw new Error('Invalid order id', { cause: { code: 400 } });

  const parent = await findOneOrder({ _id: orderId });
  if (!parent) throw new Error('Order not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;
  const isCustomer = String(parent.customer_id) === String(requester._id);

  // ⭐ فروشنده نباید از این endpoint استفاده کنه
  if (isSeller && !isAdmin)
    throw new Error('Sellers must use /order/sub/parent/:parentId endpoint', {
      cause: { code: 403 },
    });

  if (!isAdmin && !isCustomer)
    throw new Error('No Access', { cause: { code: 403 } });

  const subs = await findSubOrders({ parent_order_id: orderId });

  return { ...parent, sub_orders: subs };
};

export const getSubOrdersService = async (parentId, filter = {}, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  if (!parentId || !ObjectId.isValid(parentId))
    throw new Error('Invalid parent order id', { cause: { code: 400 } });

  let { page = 1, limit = 10, desc } = filter;
  limit = Number(limit) || 10;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1)
    throw new Error('Page is not valid', { cause: { code: 400 } });

  const parent = await findOneOrder({ _id: parentId });
  if (!parent) throw new Error('Parent order not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;
  const isCustomer = String(parent.customer_id) === String(requester._id);

  // ⭐ فروشنده به این endpoint دسترسی نداره (defensive — حتی اگر میدل‌ور اجازه بده)
  if (isSeller && !isAdmin)
    throw new Error('Sellers must use /order/sub/all endpoint', { cause: { code: 403 } });

  if (!isAdmin && !isCustomer)
    throw new Error('No Access', { cause: { code: 403 } });

  let subs = await findSubOrders({ parent_order_id: parentId });

  const isDesc = desc === 'true' || desc === true;
  subs.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return isDesc ? db - da : da - db;
  });

  const total = subs.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  subs = subs.slice(start, start + limit);

  return { data: subs, total, totalPages };
};

export const getSubOrdersAllService = async (filter = {}, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  let { page = 1, limit = 10, desc, status } = filter;
  limit = Number(limit) || 10;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1)
    throw new Error('Page is not valid', { cause: { code: 400 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;

  const query = {};

  if (isAdmin) {
    // ادمین: همه‌ی sub-orderها
  } else if (isSeller) {
    // فروشنده: فقط subهای خودش
    query.seller_id = requester._id;
  } else {
    // کاربر عادی: فقط sub-orderهایی که parent‌شون مال خودشه
    const myParents = await findOrders({ customer_id: requester._id });
    const myParentIds = myParents.map((p) => p._id);

    if (myParentIds.length === 0)
      return { data: [], total: 0, totalPages: 0 };

    query.parent_order_id = { $in: myParentIds };
  }

  // فیلتر اختیاری status
  if (status !== undefined && status !== null) {
    if (typeof status !== 'string')
      throw new Error('Status must be a string', { cause: { code: 400 } });

    const allowedStatuses = [
      'awaiting_approval',
      'preparing',
      'ready_to_ship',
      'shipped',
      'delivered',
      'cancelled',
      'rejected',
      FINALIZED_STATUS,
    ];

    const normalized = status.trim().toLowerCase();

    if (!allowedStatuses.includes(normalized))
      throw new Error(
        `Invalid status filter. Allowed: ${allowedStatuses.join(', ')}`,
        { cause: { code: 400 } },
      );

    query.status = normalized;
  }

  let subs = await findSubOrders(query);

  const isDesc = desc === 'true' || desc === true;
  subs.sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return isDesc ? db - da : da - db;
  });

  const total = subs.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  subs = subs.slice(start, start + limit);

  return { data: subs, total, totalPages };
};

export const getSubOrderService = async (subOrderId, requester) => {
  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  if (!subOrderId || !ObjectId.isValid(subOrderId))
    throw new Error('Invalid sub-order id', { cause: { code: 400 } });

  const sub = await findOneSubOrder({ _id: subOrderId });
  if (!sub) throw new Error('Sub-order not found', { cause: { code: 404 } });

  const parent = await findOneOrder({ _id: sub.parent_order_id });
  if (!parent) throw new Error('Parent order not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = String(sub.seller_id) === String(requester._id);
  const isCustomer = String(parent.customer_id) === String(requester._id);

  if (!isAdmin && !isSeller && !isCustomer)
    throw new Error('No Access', { cause: { code: 403 } });

  return sub;
};