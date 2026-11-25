export const accountOrderFilters = ['all','confirming','unpaid','paid','preparing','delivering','refunds'];
const normalized = value => String(value || '').toLowerCase();
export const paymentStatus = order => normalized(order.payment?.status || order.payment_status || 'pending');
export function matchesAccountOrder(order, subs, key) {
 const statuses = [normalized(order.status), ...subs.map(s=>normalized(s.status))];
 const cancelled = ['cancelled','rejected','failed'];
 const rows = [order,...subs];
 switch(key) {
  case 'confirming': return statuses.includes('awaiting_approval');
  case 'unpaid': return ['pending','unpaid','failed'].includes(paymentStatus(order)) && (subs.length ? subs.some(s=>!cancelled.includes(normalized(s.status))) : !cancelled.includes(normalized(order.status)));
  case 'paid': return paymentStatus(order)==='paid';
  case 'preparing': return statuses.some(s=>['preparing','ready_to_ship'].includes(s));
  case 'delivering': return statuses.some(s=>['shipped','in_transit','delivering'].includes(s));
  case 'refunds': return statuses.some(s=>['cancelled','rejected','refunded','returned'].includes(s)) || rows.some(r=>r.refund?.status && normalized(r.refund.status)!=='none');
  default: return true;
 }
}
