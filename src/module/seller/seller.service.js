import {
  findOneUser,
  findUsers,
  updateOneUser,
} from '../../model/controller/user.controller.js';

import { nationalIDValidator } from '../../utils/validators/national_id.validator.js';
import { cardNumberValidator } from '../../utils/validators/card_number.validator.js';
import { shebaNumberValidator } from '../../utils/validators/sheba_number.validator.js';
import { findOneFile } from '../../model/controller/storage.controller.js';

const SELLER_TYPES = (
  process.env.SELLER_TYPES || 'Individual_seller,institutional_seller'
).split(',');

const ACCOUNT_TYPES = (
  process.env.SETTLEMENT_ACCOUNT_TYPES || 'card'
).split(',');

const IDENTITY_FIELDS = [
  'seller_type',
  'national_ID',
  'birth_date',
  'identity_image_id',
  'identity_verification_image_id',
  'address',
];

export const registerSellerService = async (data, requester) => {
  const id = data._id ?? requester._id;

  const user = await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (user.is_seller) throw new Error('User is already a seller', { cause: { code: 400 } });

  const {
    seller_type,
    national_ID,
    birth_date,
    identity_image_id,
    identity_verification_image_id,
    address,
    settlement_account,
  } = data;

  if (!seller_type) throw new Error('seller_type is required', { cause: { code: 400 } });
  if (!SELLER_TYPES.includes(seller_type))
    throw new Error('Invalid seller_type', { cause: { code: 400 } });

  if (!national_ID) throw new Error('national_ID is required', { cause: { code: 400 } });
  if (!nationalIDValidator(national_ID))
    throw new Error('Invalid national_ID', { cause: { code: 400 } });

  if (!birth_date) throw new Error('birth_date is required', { cause: { code: 400 } });

  if (!identity_image_id)
    throw new Error('identity_image_id is required', { cause: { code: 400 } });

  const identity_image = await findOneFile({ _id: identity_image_id });
  if (!identity_image)
    throw new Error('identity image ID not found', { cause: { code: 404 } });

  if (!identity_verification_image_id)
    throw new Error('identity_verification_image is required', { cause: { code: 400 } });

  const identity_verification_image = await findOneFile({
    _id: identity_verification_image_id,
  });
  if (!identity_verification_image)
    throw new Error('identity verification image ID not found', { cause: { code: 404 } });

  if (!address?.province || !address?.city || !address?.full_address)
    throw new Error('address is incomplete', { cause: { code: 400 } });

  if (!settlement_account)
    throw new Error('settlement_account is required', { cause: { code: 400 } });

  if (!ACCOUNT_TYPES.includes(settlement_account.type))
    throw new Error('Invalid settlement account type', { cause: { code: 400 } });

  // ==== card_number: اجباری + اعتبارسنجی ====
  if (!settlement_account.card_number)
    throw new Error('card_number is required', { cause: { code: 400 } });
  if (!cardNumberValidator(settlement_account.card_number))
    throw new Error('Invalid card_number', { cause: { code: 400 } });

  // ==== sheba_number: اجباری + اعتبارسنجی ====
  if (!settlement_account.sheba_number)
    throw new Error('sheba_number is required', { cause: { code: 400 } });
  if (!shebaNumberValidator(settlement_account.sheba_number))
    throw new Error('Invalid sheba_number', { cause: { code: 400 } });

  if (!settlement_account.firstname_lastname)
    throw new Error('firstname_lastname is required', { cause: { code: 400 } });

  const existing = await findOneUser({ national_ID });
  if (existing && existing._id.toString() !== id.toString())
    throw new Error('national_ID already registered', { cause: { code: 400 } });

  await updateOneUser(
    { _id: id },
    {
      role: user.role !== "admin" ? "seller" : 'admin',
      is_seller: true,
      seller_active_status: 'INACTIVE',
      seller_approved_status: false,
      seller_type,
      national_ID,
      birth_date,
      identity_image_id,
      identity_verification_image_id,
      seller_trust: false,
      address,
      settlement_account: {
        type: settlement_account.type,
        card_number: settlement_account.card_number,
        sheba_number: settlement_account.sheba_number,
        firstname_lastname: settlement_account.firstname_lastname,
      },
      seller_plan: {
        plan_id: null,
        start_at: new Date()
      },
    },
  );

  return true;
};

export const getSellersService = async (filter = {}) => {
  let {
    page = 1,
    limit = 10,
    desc,
    phone,
    username,
    seller_type,
    seller_active_status,
    seller_approved_status,
  } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  let users = await findUsers({ is_seller: true }, desc);

  if (phone) users = users.filter((user) => user.phone.includes(phone));
  if (username) users = users.filter((user) => user.username.includes(username));
  if (seller_type) users = users.filter((user) => user.seller_type === seller_type);
  if (seller_active_status)
    users = users.filter((user) => user.seller_active_status === seller_active_status);
  if (seller_approved_status !== undefined)
    users = users.filter(
      (user) => user.seller_approved_status === (seller_approved_status === 'true'),
    );

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

  if (!user.is_seller)
    throw new Error('User is not a seller', { cause: { code: 400 } });

  return user;
};

export const updateSellerService = async (id, data, requester) => {
  const user = await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (!user.is_seller)
    throw new Error('User is not a seller', { cause: { code: 400 } });

  const isAdmin = requester.role === 'admin';

  const identityLocked =
    user.identity_locked === true || user.seller_approved_status === true;

  if (!isAdmin && identityLocked) {
    for (const field of IDENTITY_FIELDS) {
      if (data[field] !== undefined) {
        throw new Error(
          `${field} cannot be edited after approval. Only settlement account can be updated.`,
          { cause: { code: 403 } },
        );
      }
    }
  }

  const {
    seller_type,
    national_ID,
    birth_date,
    identity_image_id,
    identity_verification_image_id,
    address,
    settlement_account,
    seller_active_status,
    seller_approved_status,
  } = data;

  if (seller_type && !SELLER_TYPES.includes(seller_type))
    throw new Error('Invalid seller_type', { cause: { code: 400 } });

  if (national_ID && !nationalIDValidator(national_ID))
    throw new Error('Invalid national_ID', { cause: { code: 400 } });

  if (national_ID && national_ID !== user.national_ID) {
    const existing = await findOneUser({ national_ID });
    if (existing && existing._id.toString() !== id.toString())
      throw new Error('national_ID already registered', { cause: { code: 400 } });
  }

  if (address && (!address.province || !address.city || !address.full_address))
    throw new Error('address is incomplete', { cause: { code: 400 } });

  if (identity_image_id) {
    const img = await findOneFile({ _id: identity_image_id });
    if (!img)
      throw new Error('identity image ID not found', { cause: { code: 404 } });
  }
  if (identity_verification_image_id) {
    const img = await findOneFile({ _id: identity_verification_image_id });
    if (!img)
      throw new Error('identity verification image ID not found', { cause: { code: 404 } });
  }

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

    if (!updated_settlement_account.firstname_lastname)
      throw new Error('firstname_lastname is required', { cause: { code: 400 } });
  }

  if (!isAdmin && (seller_active_status !== undefined || seller_approved_status !== undefined))
    throw new Error('Only admin can change seller status', { cause: { code: 403 } });

  if (isAdmin) {
    if (seller_active_status !== undefined &&
      !['ACTIVE', 'INACTIVE'].includes(seller_active_status))
      throw new Error('Invalid seller_active_status', { cause: { code: 400 } });

    if (seller_approved_status !== undefined &&
      typeof seller_approved_status !== 'boolean')
      throw new Error('Invalid seller_approved_status', { cause: { code: 400 } });
  }

  const updatePayload = {
    seller_type: seller_type ?? user.seller_type,
    national_ID: national_ID ?? user.national_ID,
    birth_date: birth_date ?? user.birth_date,
    identity_image_id: identity_image_id ?? user.identity_image_id,
    identity_verification_image_id:
      identity_verification_image_id ?? user.identity_verification_image_id,
    address: address ?? user.address,
    settlement_account: updated_settlement_account,
  };

  if (isAdmin) {
    if (seller_active_status !== undefined)
      updatePayload.seller_active_status = seller_active_status;

    if (seller_approved_status !== undefined) {
      updatePayload.seller_approved_status = seller_approved_status;
      updatePayload.identity_locked = seller_approved_status;
    }
  }

  await updateOneUser({ _id: id }, updatePayload);

  return true;
};

export const trustSellerService = async (id, trust, requester) => {
  // فقط ادمین
  if (requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 403 } });

  // اعتبارسنجی ورودی: باید boolean باشه
  if (typeof trust !== 'boolean')
    throw new Error('trust must be a boolean', { cause: { code: 400 } });

  const user = await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (!user.is_seller)
    throw new Error('User is not a seller', { cause: { code: 400 } });

  // (اختیاری) فقط seller تأییدشده رو بشه trust کرد
  if (trust === true && user.seller_approved_status !== true)
    throw new Error('Seller must be approved before trusting', { cause: { code: 400 } });

  // اگه همین وضعیت بود، کاری نکن (idempotent)
  if (user.seller_trust === trust) return true;

  await updateOneUser({ _id: id }, { seller_trust: trust });

  return true;
};