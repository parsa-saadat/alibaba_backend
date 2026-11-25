import { validateIRPhoneSyntax } from '../../utils/validators/phone.validator.js';
import { panelSearch } from '../../utils/helpers/panel-search.helper.js';
import { statsActor } from '../../utils/helpers/stats.helper.js';
import { sellerStats } from '../../model/controller/user.controller.js';
import { findOneUser, findUsers, updateOneUser } from '../../model/controller/user.controller.js';

import { cardNumberValidator } from '../../utils/validators/card_number.validator.js';
import { shebaNumberValidator } from '../../utils/validators/sheba_number.validator.js';

const ACCOUNT_TYPES = (process.env.SETTLEMENT_ACCOUNT_TYPES || 'card').split(',');

export const registerSellerService = async (data, requester) => {
  const current = await findOneUser({ _id: requester._id });
  if (!current) throw new Error('User not found', { cause: { code: 404 } });
  const id = data._id ?? current._id;
  if (String(id) !== String(current._id) && current.role !== 'admin') throw new Error('Access Denied', { cause: { code: 403 } });
  const user = String(id) === String(current._id) ? current : await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });
  if (user.is_seller || ['seller','admin','root'].includes(String(user.role || '').toLowerCase())) throw new Error('This account cannot submit another seller application', { cause: { code: 400 } });
  for (const field of ['firstname','lastname']) if (typeof data[field] !== 'string' || !data[field].trim() || data[field].trim().length > 80) throw new Error('First name and last name are required (1–80 characters)', { cause: { code: 400 } });
  let phone = String(data.phone || '').trim().replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[\s()-]/g,'');
  if (!validateIRPhoneSyntax(phone)) throw new Error('Invalid contact phone number', { cause: { code: 400 } });
  phone = phone.startsWith('+98') ? phone : '+98' + (phone.startsWith('0') ? phone.slice(1) : phone);
  await updateOneUser({ _id:id }, {
    firstname:data.firstname.trim(), lastname:data.lastname.trim(), seller_contact_phone:phone,
    role:user.role === 'admin' ? 'admin' : 'seller', is_seller:true,
    seller_active_status:'INACTIVE', seller_approved_status:false, seller_trust:false,
    seller_application_at:new Date(),
    seller_plan:{plan_id:null,start_at:new Date()}
  });
  return true;
};

export const getSellersService = async (filter = {}) => {
  let {
    page = 1,
    limit = 10,
    desc,
    phone,
    username,
    seller_active_status,
    seller_approved_status,
  } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  let users = await findUsers({ is_seller: true }, desc);

  if (phone) users = users.filter((user) => [user.phone, user.seller_contact_phone].some(value => String(value || '').includes(phone)));
  if (username) users = users.filter((user) => user.username.includes(username));
  if (seller_active_status)
    users = users.filter((user) => user.seller_active_status === seller_active_status);
  if (seller_approved_status !== undefined)
    users = users.filter(
      (user) => user.seller_approved_status === (seller_approved_status === 'true'),
    );

  if (filter.panel_filter === 'PENDING')
    users = users.filter((user) => !user.seller_approved_status);
  if (filter.panel_filter === 'APPROVED')
    users = users.filter((user) => user.seller_approved_status);
  if (filter.panel_filter === 'TRUSTED') users = users.filter((user) => user.seller_trust === true);
  if (filter.panel_filter === 'INACTIVE')
    users = users.filter((user) => String(user.seller_active_status).toLowerCase() !== 'active');
  if (filter.search) users = users.filter((user) => panelSearch(user, filter.search));
  const total = users.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;

  users = users.slice(start, start + limit);

  return {
    data: users,
    total,
    totalPages,
  };
};

export const getSellerService = async (id, requester) => {
  const user = await findOneUser({ _id: id });

  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (!user.is_seller) throw new Error('User is not a seller', { cause: { code: 400 } });

  return user;
};

export const updateSellerService = async (id, data, requester) => {
  const user = await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (!user.is_seller) throw new Error('User is not a seller', { cause: { code: 400 } });

  const isAdmin = requester.role === 'admin';

  const { settlement_account, seller_active_status, seller_approved_status } = data;

  let updated_settlement_account = user.settlement_account;

  if (settlement_account) {
    updated_settlement_account = {
      ...user.settlement_account,
      ...settlement_account,
    };

    if (!ACCOUNT_TYPES.includes(updated_settlement_account.type))
      throw new Error('Invalid settlement account type', { cause: { code: 400 } });

    if (!updated_settlement_account.card_number)
      throw new Error('card_number is required', { cause: { code: 400 } });
    if (!cardNumberValidator(updated_settlement_account.card_number))
      throw new Error('Invalid card_number', { cause: { code: 400 } });

    if (!updated_settlement_account.sheba_number)
      throw new Error('sheba_number is required', { cause: { code: 400 } });
    if (!shebaNumberValidator(updated_settlement_account.sheba_number))
      throw new Error('Invalid sheba_number', { cause: { code: 400 } });

    if (typeof updated_settlement_account.firstname_lastname !== 'string' || !updated_settlement_account.firstname_lastname.trim())
      throw new Error('firstname_lastname is required', { cause: { code: 400 } });
  }

  if (!isAdmin && (seller_active_status !== undefined || seller_approved_status !== undefined))
    throw new Error('Only admin can change seller status', { cause: { code: 403 } });

  if (isAdmin) {
    if (
      seller_active_status !== undefined &&
      !['ACTIVE', 'INACTIVE'].includes(seller_active_status)
    )
      throw new Error('Invalid seller_active_status', { cause: { code: 400 } });

    if (seller_approved_status !== undefined && typeof seller_approved_status !== 'boolean')
      throw new Error('Invalid seller_approved_status', { cause: { code: 400 } });
  }

  const updatePayload = {};

  if (settlement_account) updatePayload.settlement_account = updated_settlement_account;

  if (isAdmin) {
    if (seller_active_status !== undefined)
      updatePayload.seller_active_status = seller_active_status;

    if (seller_approved_status !== undefined)
      updatePayload.seller_approved_status = seller_approved_status;
  }

  if (Object.keys(updatePayload).length) await updateOneUser({ _id: id }, updatePayload);

  return true;
};

export const trustSellerService = async (id, trust, requester) => {
  // فقط ادمین
  if (requester.role !== 'admin') throw new Error('Access Denied', { cause: { code: 403 } });

  // اعتبارسنجی ورودی: باید boolean باشه
  if (typeof trust !== 'boolean')
    throw new Error('trust must be a boolean', { cause: { code: 400 } });

  const user = await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (!user.is_seller) throw new Error('User is not a seller', { cause: { code: 400 } });

  // (اختیاری) فقط seller تأییدشده رو بشه trust کرد
  if (trust === true && user.seller_approved_status !== true)
    throw new Error('Seller must be approved before trusting', { cause: { code: 400 } });

  // اگه همین وضعیت بود، کاری نکن (idempotent)
  if (user.seller_trust === trust) return true;

  await updateOneUser({ _id: id }, { seller_trust: trust });

  return true;
};
export const getSellerStatsService = async (requester) => {
  const actor = await statsActor(requester, false);
  const result = await sellerStats(
    actor.role === 'admin'
      ? { $or: [{ is_seller: true }, { role: 'seller' }] }
      : { _id: actor._id },
  );
  return { ...result, scope: actor.role === 'admin' ? 'all' : 'own' };
};
