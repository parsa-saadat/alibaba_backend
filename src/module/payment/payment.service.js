import { ObjectId } from 'mongodb';
import axios from 'axios';

import { findOneOrder, updateOneOrder } from '../../model/controller/order.controller.js';
import {
  findOneSubOrder,
  findSubOrders,
  updateOneSubOrder,
} from '../../model/controller/sub-order.controller.js';
import { findOneUser, updateOneUser } from '../../model/controller/user.controller.js';
import { findOnePlan } from '../../model/controller/plan.controller.js';

const EXCLUDED_FOR_PAYMENT = ['rejected', 'cancelled', 'finalized'];

// ─────────────────────────────────────────────
// payOrderService — پرداخت فوری پس از ثبت سفارش
// ─────────────────────────────────────────────
export const payOrderService = async (orderId, requester) => {
  const {
    ZARINPAL_MERCHANT_ID,
    VERIFY_PAYMENT_CALLBACK_URL,
    ZARINPAL_PAY_URL,
    ZARINPAL_PAYMENT_REQUEST_URL,
  } = process.env;

  if (
    !ZARINPAL_MERCHANT_ID ||
    !VERIFY_PAYMENT_CALLBACK_URL ||
    !ZARINPAL_PAY_URL ||
    !ZARINPAL_PAYMENT_REQUEST_URL
  )
    throw new Error('Payment configuration is incomplete', { cause: { code: 500 } });

  if (!orderId || !ObjectId.isValid(orderId))
    throw new Error('Invalid order id', { cause: { code: 400 } });

  const parent = await findOneOrder({ _id: orderId });
  if (!parent) throw new Error('Order not found', { cause: { code: 404 } });

  if (String(parent.customer_id) !== String(requester._id))
    throw new Error('Order access denied', { cause: { code: 403 } });

  if (parent.payment?.status === 'paid')
    throw new Error('Order already paid', { cause: { code: 400 } });

  // ─── Sub-orders ───
  const subs = await findSubOrders({ parent_order_id: orderId });
  if (subs.length === 0)
    throw new Error('No sub-orders found', { cause: { code: 404 } });

  // ⭐ بدون چک "منتظر تصمیم فروشنده‌ها" — پرداخت فوری مجاز است
  // snapshot = همه‌ی subهای غیر-terminal (فروشنده ممکنه هنوز تصمیم نگرفته باشه)
  const payableSubs = subs.filter((s) => !EXCLUDED_FOR_PAYMENT.includes(s.status));

  if (payableSubs.length === 0)
    throw new Error('No payable sub-orders', { cause: { code: 400 } });

  const totalAmount = payableSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalDiscount = payableSubs.reduce((sum, s) => sum + (s.discount_applied || 0), 0);
  const payableAmount = totalAmount - totalDiscount;

  if (payableAmount < 1000)
    throw new Error('Minimum payment amount is 1000', { cause: { code: 400 } });

  // ─── sync مبالغ parent ───
  if (
    parent.total_amount !== totalAmount ||
    parent.total_discount !== totalDiscount ||
    parent.final_amount !== payableAmount
  ) {
    await updateOneOrder(
      { _id: orderId },
      {
        total_amount: totalAmount,
        total_discount: totalDiscount,
        final_amount: payableAmount,
      },
    );
  }

  const callbackURL = `${VERIFY_PAYMENT_CALLBACK_URL}?orderId=${parent._id}`;

  let response;
  try {
    response = await axios.post(ZARINPAL_PAYMENT_REQUEST_URL, {
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount: payableAmount,
      callback_url: callbackURL,
      currency: parent.currency || 'IRR',
      order_id: parent._id.toString(),
      description: `Payment for order ${parent.order_number}`,
    });
  } catch (err) {
    throw new Error('Payment gateway is not available', { cause: { code: 502 } });
  }

  const authority = response?.data?.data?.authority;

  if (!authority)
    throw new Error('Failed to generate payment link', { cause: { code: 500 } });

  // ⭐ ذخیره‌ی snapshot + amount برای verify
  await updateOneOrder(
    { _id: parent._id },
    {
      'payment.authority': authority,
      'payment.amount': payableAmount,
      'payment.sub_orders_snapshot': payableSubs.map((s) => s._id),
      'payment.payment_gateway': 'zarinpal',
      'payment.method': 'zarinpal',
      'payment.status': 'pending',
    },
  );

  return { url: `${ZARINPAL_PAY_URL}/${authority}` };
};

// ─────────────────────────────────────────────
// verifyOrderPaymentService — verify + refund خودکار
// ─────────────────────────────────────────────
export const verifyOrderPaymentService = async (data) => {
  const { orderId, Authority, Status } = data || {};

  const { ZARINPAL_MERCHANT_ID, ZARINPAL_VERIFY_PAYMENT_URL } = process.env;

  if (!ZARINPAL_MERCHANT_ID || !ZARINPAL_VERIFY_PAYMENT_URL)
    throw new Error('Payment configuration is incomplete', { cause: { code: 500 } });

  if (!orderId || !Authority || !Status)
    throw new Error('Invalid data', { cause: { code: 400 } });

  if (Status === 'NOK')
    throw new Error('Payment was cancelled by user', { cause: { code: 400 } });

  if (Status !== 'OK')
    throw new Error(`Payment was not successful (Status: ${Status})`, {
      cause: { code: 400 },
    });

  if (!ObjectId.isValid(orderId))
    throw new Error('Invalid order id', { cause: { code: 400 } });

  const parent = await findOneOrder({ _id: orderId });
  if (!parent) throw new Error('Order not found', { cause: { code: 404 } });

  if (parent.payment?.status === 'paid')
    return {
      ref_id: parent.payment.ref_id || null,
      paid_amount: parent.paid_amount,
      already_paid: true,
    };

  if (!parent.payment?.authority || parent.payment.authority !== Authority)
    throw new Error('Bad request — authority mismatch', { cause: { code: 400 } });

  const snapshot = parent.payment?.sub_orders_snapshot || [];
  if (snapshot.length === 0)
    throw new Error('Payment snapshot missing — please re-initiate payment', {
      cause: { code: 400 },
    });

  const originalAmount = parent.payment.amount;

  const snapshotSubs = [];
  for (const sid of snapshot) {
    const s = await findOneSubOrder({ _id: sid });
    if (s) snapshotSubs.push(s);
  }

  let response;
  try {
    response = await axios.post(ZARINPAL_VERIFY_PAYMENT_URL, {
      merchant_id: ZARINPAL_MERCHANT_ID,
      authority: Authority,
      amount: originalAmount,
    });
  } catch (err) {
    throw new Error('Zarinpal verification failed', { cause: { code: 400 } });
  }

  const code = response?.data?.data?.code;

  if (code !== 100 && code !== 101)
    throw new Error(`Payment verification failed (code: ${code})`, {
      cause: { code: 400 },
    });

  const refId = response.data.data.ref_id;
  const now = new Date();

  const paidIds = [];

  for (const s of snapshotSubs) {
    paidIds.push(s._id);

    if (EXCLUDED_FOR_PAYMENT.includes(s.status)) {
      if (s.refund?.status && s.refund.status !== 'none') continue;

      const baseAmount = s.amount - s.discount_applied;

      await updateOneSubOrder(
        { _id: s._id },
        {
          refund: {
            status: 'pending',
            amount: baseAmount,
            penalty_amount: 0,
            penalty_amount_percentage: 0,
            refund_at: null,
          },
          update_at: now,
        },
      );
    }
  }

  // ─── parent update ───
  await updateOneOrder(
    { _id: orderId },
    {
      paid_sub_orders: paidIds,
      paid_amount: originalAmount,
      'payment.status': 'paid',
      'payment.method': 'zarinpal',
      'payment.payment_gateway': 'zarinpal',
      'payment.transaction_id': String(refId),
      'payment.ref_id': String(refId),
      'payment.paid_at': now,
      'payment.fee': response.data.data.fee || null,
      'payment.shaparak_fee': response.data.data.shaparak_fee || null,
    },
  );

  // ─── بازمحاسبه‌ی parent (active totals + pending_refund) ───
  const allSubs = await findSubOrders({ parent_order_id: orderId });
  const activeSubs = allSubs.filter((s) => !EXCLUDED_FOR_PAYMENT.includes(s.status));

  const totalAmount = activeSubs.reduce((sum, s) => sum + (s.amount || 0), 0);
  const totalDiscount = activeSubs.reduce((sum, s) => sum + (s.discount_applied || 0), 0);
  const finalAmount = totalAmount - totalDiscount;

  const paidSet = new Set(paidIds.map((id) => String(id)));

  const pendingRefunds = allSubs.filter(
    (s) =>
      EXCLUDED_FOR_PAYMENT.includes(s.status) &&
      paidSet.has(String(s._id)) &&
      s.refund?.status === 'pending',
  );

  const completedRefunds = allSubs.filter((s) => s.refund?.status === 'completed');

  const pendingRefund = pendingRefunds.reduce((sum, s) => sum + (s.refund?.amount || 0), 0);
  const totalRefunded = completedRefunds.reduce((sum, s) => sum + (s.refund?.amount || 0), 0);

  await updateOneOrder(
    { _id: orderId },
    {
      total_amount: totalAmount,
      total_discount: totalDiscount,
      final_amount: finalAmount,
      cancellation_summary: {
        cancelled_sub_orders: allSubs.filter((s) => s.status === 'cancelled').map((s) => s._id),
        rejected_sub_orders: allSubs.filter((s) => s.status === 'rejected').map((s) => s._id),
        finalized_sub_orders: allSubs.filter((s) => s.status === 'finalized').map((s) => s._id),
        total_refunded: totalRefunded,
        pending_refund: pendingRefund,
      },
    },
  );

  return {
    ref_id: refId,
    paid_amount: originalAmount,
    already_paid: false,
  };
};

// ─────────────────────────────────────────────
// payPlanService
// ─────────────────────────────────────────────
export const payPlanService = async (planId, requester) => {
  const {
    ZARINPAL_MERCHANT_ID,
    VERIFY_PLAN_PAYMENT_CALLBACK_URL,
    ZARINPAL_PAY_URL,
    ZARINPAL_PAYMENT_REQUEST_URL,
  } = process.env;

  if (
    !ZARINPAL_MERCHANT_ID ||
    !VERIFY_PLAN_PAYMENT_CALLBACK_URL ||
    !ZARINPAL_PAY_URL ||
    !ZARINPAL_PAYMENT_REQUEST_URL
  )
    throw new Error('Payment configuration is incomplete', { cause: { code: 500 } });

  if (!requester?._id || !ObjectId.isValid(requester._id))
    throw new Error('Authentication required', { cause: { code: 401 } });

  if (!planId || !ObjectId.isValid(planId))
    throw new Error('Invalid plan id', { cause: { code: 400 } });

  const plan = await findOnePlan({ _id: planId });
  if (!plan) throw new Error('Plan not found', { cause: { code: 404 } });
  if (plan.status !== 'ACTIVE')
    throw new Error('Plan is not active', { cause: { code: 400 } });

  const user = await findOneUser({ _id: requester._id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  // ─── اگر همین پلن فعاله، دوباره خرید نکنه ───
  if (user.seller_plan?.plan_id && String(user.seller_plan.plan_id) === String(plan._id)) {
    const startedAt = new Date(user.seller_plan.start_at).getTime();

    if (Number.isFinite(startedAt)) {
      if (plan.duration_days === null) {
        throw new Error('This plan is already active', { cause: { code: 400 } });
      }

      const expiry = startedAt + plan.duration_days * 24 * 60 * 60 * 1000;

      if (Date.now() < expiry)
        throw new Error('This plan is already active', { cause: { code: 400 } });
    }
  }

  // ─── محاسبه‌ی مبلغ (با تخفیف) ───
  let finalAmount = plan.price.amount;
  let discountApplied = 0;

  if (
    plan.discount?.percentage &&
    plan.discount?.expirationDate &&
    new Date(plan.discount.expirationDate) > new Date()
  ) {
    discountApplied = finalAmount * (plan.discount.percentage / 100);
    finalAmount = finalAmount - discountApplied;
  }

  if (!Number.isFinite(finalAmount) || finalAmount <= 0)
    throw new Error('Invalid payment amount', { cause: { code: 400 } });

  // ─── تبدیل IRT → IRR ───
  let zarinpalAmount = finalAmount;
  if (plan.price.currency === 'IRT') zarinpalAmount = finalAmount * 10;

  if (zarinpalAmount < 1000)
    throw new Error('Minimum payment amount is 1000 Rial', { cause: { code: 400 } });

  // ─── درخواست authority ───
  const callbackURL = VERIFY_PLAN_PAYMENT_CALLBACK_URL;

  let response;
  try {
    response = await axios.post(ZARINPAL_PAYMENT_REQUEST_URL, {
      merchant_id: ZARINPAL_MERCHANT_ID,
      amount: zarinpalAmount,
      callback_url: callbackURL,
      currency: 'IRR',
      description: `Payment for plan ${plan.name}`,
    });
    
  } catch (err) {
    throw new Error('Payment gateway is not available', { cause: { code: 502 } });
  }

  const authority = response?.data?.data?.authority;
  if (!authority)
    throw new Error('Failed to generate payment link', { cause: { code: 500 } });

  // ⭐ ذخیره به‌صورت آبجکت واحد (overwrite)
  await updateOneUser(
    { _id: user._id },
    {
      pending_plan_payment: {
        plan_id: plan._id,
        authority,
        amount: finalAmount,
        discount_applied: discountApplied,
        currency: plan.price.currency,
        zarinpal_amount: zarinpalAmount,
        created_at: new Date(),
      },
    },
  );

  return { url: `${ZARINPAL_PAY_URL}/${authority}` };
};

export const verifyPlanPaymentService = async (data) => {
  const { Authority, Status } = data || {};

  const { ZARINPAL_MERCHANT_ID, ZARINPAL_VERIFY_PAYMENT_URL } = process.env;

  if (!ZARINPAL_MERCHANT_ID || !ZARINPAL_VERIFY_PAYMENT_URL)
    throw new Error('Payment configuration is incomplete', { cause: { code: 500 } });

  if (!Authority || !Status)
    throw new Error('Invalid data', { cause: { code: 400 } });

  if (Status === 'NOK')
    throw new Error('Payment was cancelled by user', { cause: { code: 400 } });

  if (Status !== 'OK')
    throw new Error(`Payment was not successful (Status: ${Status})`, {
      cause: { code: 400 },
    });

  // ─── ۱) idempotency — از last_plan_payment ───
  const paidUser = await findOneUser({ 'last_plan_payment.authority': Authority });

  if (paidUser?.last_plan_payment?.ref_id) {
    return {
      already_paid: true,
      ref_id: paidUser.last_plan_payment.ref_id,
      plan_id: paidUser.last_plan_payment.plan_id,
      paid_amount: paidUser.last_plan_payment.amount,
    };
  }

  // ─── ۲) lookup در pending ───
  const user = await findOneUser({ 'pending_plan_payment.authority': Authority });
  if (!user) throw new Error('Payment not found', { cause: { code: 404 } });

  const pending = user.pending_plan_payment;
  if (!pending || pending.authority !== Authority)
    throw new Error('Payment not found', { cause: { code: 404 } });

  // ─── ۳) verify ───
  let response;
  try {
    response = await axios.post(ZARINPAL_VERIFY_PAYMENT_URL, {
      merchant_id: ZARINPAL_MERCHANT_ID,
      authority: Authority,
      amount: pending.zarinpal_amount,
    });
  } catch (err) {
    throw new Error('Zarinpal verification failed', { cause: { code: 400 } });
  }

  const code = response?.data?.data?.code;
  if (code !== 100 && code !== 101)
    throw new Error(`Payment verification failed (code: ${code})`, {
      cause: { code: 400 },
    });

  const refId = response.data.data.ref_id;

  // ─── ۴) فعال‌سازی پلن ───
  await updateOneUser(
    { _id: user._id },
    {
      seller_plan: {
        plan_id: pending.plan_id,
        start_at: new Date(),
      },
      pending_plan_payment: null,
      last_plan_payment: {
        plan_id: pending.plan_id,
        authority: Authority,
        ref_id: String(refId),
        amount: pending.amount,
        discount_applied: pending.discount_applied,
        currency: pending.currency,
        paid_at: new Date(),
        fee: response.data.data.fee || null,
        shaparak_fee: response.data.data.shaparak_fee || null,
      },
    },
  );

  return {
    already_paid: false,
    ref_id: refId,
    plan_id: pending.plan_id,
    paid_amount: pending.amount,
  };
};