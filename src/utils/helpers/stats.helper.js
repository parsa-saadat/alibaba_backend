import { findOneUser } from '../../model/controller/user.controller.js';
import { getRates, convert, supportedCurrencies } from '../../module/fx/fx.service.js';
import { ObjectId } from 'mongodb';

export async function statsActor(requester, adminOnly = false) {
  if (!requester?._id || !ObjectId.isValid(String(requester._id)))
    throw new Error('Authentication required', { cause: { code: 401 } });
  const actor = await findOneUser({ _id: String(requester._id) });
  if (
    !actor ||
    (actor.role !== 'admin' &&
      (adminOnly || !(actor.is_seller === true || actor.role === 'seller')))
  )
    throw new Error('No Access', { cause: { code: 403 } });
  return actor;
}
export async function statsMoney(groups, target = 'USD') {
  if (!supportedCurrencies.includes(target))
    throw new Error('Unsupported currency', { cause: { code: 400 } });
  try {
    const quote = groups.some(
      (row) =>
        (row.currency || 'IRR') !== target &&
        Number(row.amount) !== 0 &&
        !(['IRR', 'IRT'].includes(row.currency || 'IRR') && ['IRR', 'IRT'].includes(target)),
    )
      ? await getRates()
      : { rates: { IRR: 1, IRT: 10 } };
    return {
      amount: groups.reduce(
        (sum, row) =>
          sum +
          (Number(row.amount) === 0
            ? 0
            : convert(Number(row.amount) || 0, row.currency || 'IRR', target, quote)),
        0,
      ),
      currency: target,
      error_code: null,
    };
  } catch {
    return { amount: null, currency: target, error_code: 'FX_UNAVAILABLE' };
  }
}
