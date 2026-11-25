import { ObjectId } from 'mongodb';
import { createRefundService } from './refund.core.js';
import { createZarinpalRefundGateway } from './refund.gateway.js';
import { findOneOrder, updateOneOrder } from '../../model/controller/order.controller.js';
import {
  findOneSubOrder,
  findSubOrders,
  updateOneSubOrder,
} from '../../model/controller/sub-order.controller.js';
const summarize = async (parentId) => {
  const all = await findSubOrders({ parent_order_id: parentId });
  const sum = (states) =>
    all
      .filter((s) => states.includes(s.refund?.status))
      .reduce((total, s) => total + (s.refund.amount || 0), 0);
  await updateOneOrder(
    { _id: parentId },
    {
      'cancellation_summary.total_refunded': sum(['completed']),
      'cancellation_summary.pending_refund': sum([
        'pending',
        'processing',
        'submitted',
        'unknown',
        'failed',
      ]),
    },
  );
};
const service = createRefundService({
  repo: {
    sub: (id) => findOneSubOrder({ _id: id }),
    order: (id) => findOneOrder({ _id: id }),
    subs: (id) => findSubOrders({ parent_order_id: id }),
    updateSub: updateOneSubOrder,
    updateOrder: updateOneOrder,
    summarize,
  },
  gateway: createZarinpalRefundGateway(),
});
const validId = (id) => {
  if (!id || !ObjectId.isValid(id))
    throw new Error('Invalid sub-order id', { cause: { code: 400 } });
};
export const requestRefundService = (id, input, actor) => {
  validId(id);
  return service.request(id, input, actor);
};
export const reconcileRefundService = (id, actor) => {
  validId(id);
  return service.reconcile(id, actor);
};
