import { randomUUID } from 'node:crypto';
const fail = (message, code = 400) => new Error(message, { cause: { code } });
const finalStates = ['cancelled', 'rejected', 'finalized'];
const inFlight = ['processing', 'submitted', 'unknown'];

// Dependencies are injected so money movement can be tested without a live gateway/database.
export function createRefundService({ repo, gateway, now = () => new Date(), id = randomUUID }) {
  const admin = (actor) => {
    if (!actor?._id || actor.role !== 'admin') throw fail('Refunds require an administrator', 403);
  };
  async function context(subId) {
    const sub = await repo.sub(subId);
    if (!sub) throw fail('Sub-order not found', 404);
    const parent = await repo.order(sub.parent_order_id);
    if (!parent) throw fail('Order not found', 404);
    if (parent.currency !== 'IRR' || (sub.currency && sub.currency !== 'IRR'))
      throw fail(
        'Refund requires a verified IRR payment snapshot; migrate legacy orders explicitly',
      );
    if (parent.payment?.status !== 'paid' || parent.payment?.method !== 'zarinpal')
      throw fail('Only verified Zarinpal payments can be refunded');
    if (!(parent.paid_sub_orders || []).some((x) => String(x) === String(sub._id)))
      throw fail('Sub-order was not included in the verified payment');
    return { sub, parent };
  }
  async function saveResult(sub, parent, result) {
    const state = String(result?.timeline?.refund_status || '').toUpperCase();
    const amount = Number(result?.timeline?.refund_amount);
    // A status without the exact requested amount must never be counted as completed.
    if (state === 'SUCCESS' && amount !== sub.refund.amount)
      throw fail('Refund response amount mismatch; reconciliation required', 502);
    const status = state === 'SUCCESS' ? 'completed' : state === 'FAILED' ? 'failed' : 'submitted';
    const resultId = String(result?.id || '');
    if (!resultId) throw fail('Refund response has no transaction id', 502);
    const saved = await repo.updateSub(
      { _id: sub._id, 'refund.operation_id': sub.refund.operation_id },
      {
        'refund.status': status,
        'refund.gateway_id': resultId,
        'refund.gateway_status': state || 'PENDING',
        'refund.checked_at': now(),
        'refund.refund_at': status === 'completed' ? now() : null,
        'refund.last_error': null,
      },
    );
    if (saved.matchedCount !== 1) throw fail('Refund state changed; reconciliation required', 409);
    if (status === 'completed' || status === 'failed')
      await repo.updateOrder(
        { _id: parent._id, refund_lock: sub.refund.operation_id },
        { refund_lock: null },
      );
    await repo.summarize(parent._id).catch(() => {});
    return repo.sub(sub._id);
  }
  return {
    async request(subId, input, actor) {
      admin(actor);
      const { sub, parent } = await context(subId);
      if (sub.refund?.status === 'completed') return sub; // Idempotent, never resubmit.
      if (inFlight.includes(sub.refund?.status))
        throw fail('Refund is already in progress; check its status instead', 409);
      if (!finalStates.includes(sub.status))
        throw fail('Cancel or reject the sub-order before requesting a refund');
      if (!['pending', 'failed'].includes(sub.refund?.status))
        throw fail('No refundable cancellation snapshot');
      const amount = sub.refund.amount;
      const net = sub.amount - (sub.discount_applied || 0);
      if (
        !Number.isSafeInteger(net) ||
        !Number.isSafeInteger(amount) ||
        amount < 20000 ||
        amount > net
      )
        throw fail(
          'Refund amount must be an integer of at least 20000 IRR and within the paid sub-order amount',
        );
      const others = await repo.subs(parent._id);
      const reserved = others
        .filter(
          (s) =>
            String(s._id) !== String(sub._id) &&
            ['completed', ...inFlight].includes(s.refund?.status),
        )
        .reduce((sum, s) => sum + (s.refund.amount || 0), 0);
      if (!Number.isSafeInteger(parent.paid_amount) || reserved + amount > parent.paid_amount)
        throw fail('Refund exceeds remaining verified payment');
      const method = input?.method || 'PAYA';
      if (!['PAYA', 'CARD'].includes(method)) throw fail('Unsupported refund method');
      const description = String(
        input?.description || sub.cancellation?.reason || 'Cancelled order refund',
      ).trim();
      if (!description || description.length > 500)
        throw fail('Refund description must be 1 to 500 characters');
      const sessionId = String(parent.payment.ref_id || parent.payment.transaction_id || '');
      if (!/^\d+$/.test(sessionId)) throw fail('Verified Zarinpal transaction id is missing');
      // Validate credentials before acquiring a durable lock, but never store the access token.
      gateway.ready();
      const operation = id();
      const claim = await repo.updateOrder(
        { _id: parent._id, refund_lock: null, 'payment.status': 'paid' },
        { refund_lock: operation },
      );
      if (claim.matchedCount !== 1)
        throw fail('Another refund for this payment is in progress', 409);
      // Re-read the budget under the durable payment lock (another request may have completed while we waited).
      const freshOthers = await repo.subs(parent._id);
      const freshReserved = freshOthers
        .filter(
          (s) =>
            String(s._id) !== String(sub._id) &&
            ['completed', ...inFlight].includes(s.refund?.status),
        )
        .reduce((sum, s) => sum + (s.refund.amount || 0), 0);
      if (freshReserved + amount > parent.paid_amount) {
        await repo.updateOrder({ _id: parent._id, refund_lock: operation }, { refund_lock: null });
        throw fail('Refund exceeds remaining verified payment');
      }
      const marked = await repo
        .updateSub(
          { _id: sub._id, 'refund.status': sub.refund.status },
          {
            'refund.status': 'processing',
            'refund.operation_id': operation,
            'refund.requested_at': now(),
            'refund.requested_by': String(actor._id),
            'refund.method': method,
            'refund.session_id': sessionId,
            'refund.gateway_id': null,
            'refund.last_error': null,
          },
        )
        .catch(async (e) => {
          // A failed database write may have committed. Keep the lock rather than risk a second debit.
          throw fail('Refund preparation needs reconciliation; no gateway retry was issued', 503);
        });
      if (marked.matchedCount !== 1) {
        await repo.updateOrder({ _id: parent._id, refund_lock: operation }, { refund_lock: null });
        throw fail('Refund state changed; reload the order', 409);
      }
      const pendingSub = { ...sub, refund: { ...sub.refund, operation_id: operation } };
      try {
        const result = await gateway.add({
          session_id: sessionId,
          amount,
          description,
          method,
          reason: 'CUSTOMER_REQUEST',
        });
        return await saveResult(pendingSub, parent, result);
      } catch (e) {
        // A timeout/transport failure may occur after Zarinpal accepted the request.
        // Never retry automatically, and keep the parent payment locked while the outcome is uncertain.
        const status = e.definitive === true ? 'failed' : 'unknown';
        await repo.updateSub(
          { _id: sub._id, 'refund.operation_id': operation, 'refund.status': 'processing' },
          {
            'refund.status': status,
            'refund.last_error':
              status === 'unknown'
                ? 'Gateway outcome unknown; verify in Zarinpal before any further refund'
                : 'Gateway rejected refund request',
            'refund.checked_at': now(),
          },
        );
        if (status === 'failed')
          await repo.updateOrder(
            { _id: parent._id, refund_lock: operation },
            { refund_lock: null },
          );
        await repo.summarize(parent._id).catch(() => {});
        throw fail(
          status === 'unknown'
            ? 'Refund outcome unknown. Do not retry; reconcile with Zarinpal support.'
            : 'Zarinpal rejected the refund request. Check gateway permissions and balance.',
          502,
        );
      }
    },
    async reconcile(subId, actor) {
      admin(actor);
      const { sub, parent } = await context(subId);
      if (sub.refund?.status === 'completed') return sub;
      if (!['submitted', 'unknown', 'processing'].includes(sub.refund?.status))
        throw fail('No in-progress refund to check');
      if (!sub.refund.gateway_id)
        throw fail(
          'No refund transaction id was received. Manual reconciliation in Zarinpal is required; do not submit again.',
          409,
        );
      gateway.ready();
      const result = await gateway.inquiry(sub.refund.gateway_id);
      return saveResult(sub, parent, result);
    },
  };
}
