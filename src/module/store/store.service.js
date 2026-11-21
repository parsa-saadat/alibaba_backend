import { panelSearch } from '../../utils/helpers/panel-search.helper.js';
import { statsActor, statsMoney } from '../../utils/helpers/stats.helper.js';
import { storeStats } from '../../model/controller/store.controller.js';
import {
  deriveContent,
  translationCreate,
  translationPatch,
  searchableName,
} from '../../utils/helpers/localization.helper.js';

import { ObjectId } from 'mongodb';

import { emailValidator } from '../../utils/validators/email.validator.js';
import { validateIRLandlineSyntax } from '../../utils/validators/landline_phone.validator.js';
import { validateIRPhoneSyntax } from '../../utils/validators/phone.validator.js';

import {
  insertStore,
  findOneStore,
  findStores,
  updateOneStore,
  deleteOneStore,
} from '../../model/controller/store.controller.js';
import { findOneUser, updateOneUser } from '../../model/controller/user.controller.js';
import { findOnePlan } from '../../model/controller/plan.controller.js';

// ─────────────────────────────────────────────
// createStoreService
// ─────────────────────────────────────────────
export const createStoreService = async (user, data, requester) => {
  data = deriveContent(data, 'store');
  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  const userData = await findOneUser({ _id: user._id });
  if (!userData) throw new Error('User not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = userData.role === 'seller' || userData.is_seller === true;

  // ─── چک فروشنده + پلن (فقط برای غیر ادمین) ───
  if (!isAdmin) {
    if (!isSeller)
      throw new Error('Seller is not active or not approved', { cause: { code: 403 } });

    if (userData.seller_approved_status !== true)
      throw new Error('Seller is not approved', { cause: { code: 403 } });

    if (String(userData.seller_active_status || '').toLowerCase() === 'inactive')
      throw new Error('Seller is not active', { cause: { code: 403 } });

    // Plan وجود داره؟
    if (!userData.seller_plan?.plan_id)
      throw new Error('Seller has no active plan', { cause: { code: 403 } });

    const userPlan = await findOnePlan({ _id: userData.seller_plan.plan_id });

    if (!userPlan) {
      await updateOneUser(
        { _id: userData._id },
        { seller_plan: { plan_id: null, start_at: null } },
      );
      throw new Error('Plan not found', { cause: { code: 403 } });
    }

    if (userPlan.status !== 'ACTIVE')
      throw new Error('Plan is not active', { cause: { code: 403 } });

    const startedAt = new Date(userData.seller_plan.start_at).getTime();

    if (!Number.isFinite(startedAt))
      throw new Error('Plan start date is invalid', { cause: { code: 403 } });

    if (userPlan.duration_days !== null) {
      const planExpiry = startedAt + userPlan.duration_days * 24 * 60 * 60 * 1000;

      if (Date.now() >= planExpiry) {
        await updateOneUser(
          { _id: userData._id },
          { seller_plan: { plan_id: null, start_at: null } },
        );
        throw new Error('Plan has expired', { cause: { code: 403 } });
      }
    }

    // ⭐ محدودیت تعداد فروشگاه
    const maxShops = userPlan.features?.max_shops ?? 0;
    const existingStores = await findStores({ user: userData._id });

    if (existingStores.length >= maxShops)
      throw new Error(`Your plan is limited to ${maxShops} stores`, {
        cause: { code: 403 },
      });
  }

  // ─── validation فروشگاه ───
  validateStoreAddress(data.contact_info);
  const storeAddress = buildStoreAddress(data.address ?? data.contact_info?.address);
  if (storeAddress === undefined)
    throw new Error('Invalid address value', { cause: { code: 400 } });
  const requiredFields = ['name', 'contact_info'];
  const isValidStore = requiredFields.every((field) => data[field]);

  if (!isValidStore) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (data?.profile_image_id && !ObjectId.isValid(data?.profile_image_id))
    throw new Error('profile_image_id is not valid', { cause: { code: 400 } });

  if (data?.banner_image_id && !ObjectId.isValid(data?.banner_image_id))
    throw new Error('banner_image_id is not valid', { cause: { code: 400 } });

  if (!data.contact_info?.email) throw new Error('email is required', { cause: { code: 400 } });

  if (!data.contact_info?.fax && !data.contact_info?.phone)
    throw new Error('fax or phone number is required', { cause: { code: 400 } });

  if (!emailValidator(data.contact_info?.email))
    throw new Error('Invalid email', { cause: { code: 400 } });

  if (data.contact_info?.phone && !validateIRPhoneSyntax(data.contact_info?.phone))
    throw new Error('Invalid phone', { cause: { code: 400 } });

  if (data.contact_info?.fax && !validateIRLandlineSyntax(data.contact_info?.fax))
    throw new Error('Invalid landline phone (fax number)', { cause: { code: 400 } });

  if (data?.description && data?.description?.length > 255)
    throw new Error('description is too long (max length is 255)', { cause: { code: 400 } });

  if (data?.name && data?.name?.length > 50)
    throw new Error('name is too long (max length is 50)', { cause: { code: 400 } });

  const newStore = {
    ...translationCreate(data.translations, 'store'),
    user: user._id,
    name: data?.name,
    status: 'ENABLE',
    profile_image_id: data?.profile_image_id,
    banner_image_id: data?.banner_image_id,
    description: data?.description ?? null,
    /* آدرس چندزبانه (field-first) — نقشه‌ی زبانی مثل {en, fa, ar, tr} */
    address: storeAddress,
    contact_info: {
      address:
        typeof data.contact_info?.address === 'string' ? data.contact_info.address.trim() : '',
      email: data.contact_info?.email,
      phone: data.contact_info?.phone ?? null,
      fax: data.contact_info?.fax ?? null,
    },
  };

  return await insertStore(newStore);
};

// ─────────────────────────────────────────────
// getStoresService (عمومی)
// ─────────────────────────────────────────────
export const getStoresService = async (filter = {}) => {
  let { page = 1, limit = 10, desc, name, email, phone, user_id } = filter;
  limit = Number(limit) || 10;
  page = Number(page) || 1;

  const query = { status: 'ENABLE' };

  if (user_id) {
    if (!ObjectId.isValid(user_id))
      throw new Error('User id is not valid', { cause: { code: 400 } });
    query.user = user_id;
  }

  let stores = await findStores(query, desc);

  if (name) stores = stores.filter((s) => searchableName(s).includes(String(name).toLowerCase()));
  if (email) stores = stores.filter((s) => s.contact_info?.email?.includes(email));
  if (phone) stores = stores.filter((s) => s.contact_info?.phone?.includes(phone));

  const total = stores.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  stores = stores.slice(start, start + limit);

  return { data: stores, total, totalPages };
};

// ─────────────────────────────────────────────
// getStoresPermService (admin/seller)
// ─────────────────────────────────────────────
export const getStoresPermService = async (userId, requester, filter = {}) => {
  if (!requester) throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.role === 'seller' || requester.is_seller === true;

  if (!isAdmin && !isSeller) throw new Error('No Access', { cause: { code: 403 } });

  const requesterId = requester._id.toString();

  let targetUserId = null;

  if (isAdmin) {
    if (userId) {
      if (!ObjectId.isValid(userId))
        throw new Error('User id is not valid', { cause: { code: 400 } });
      targetUserId = String(userId);
    }
  } else {
    targetUserId = requesterId;
  }

  let { page = 1, limit = 10, desc, name, status, email, phone } = filter;
  limit = Number(limit) || 10;
  page = Number(page) || 1;

  const query = {};
  if (targetUserId) query.user = targetUserId;

  let stores = await findStores(query, desc);

  if (name) stores = stores.filter((s) => searchableName(s).includes(String(name).toLowerCase()));
  if (status) stores = stores.filter((s) => s.status === status);
  if (email) stores = stores.filter((s) => s.contact_info?.email?.includes(email));
  if (phone) stores = stores.filter((s) => s.contact_info?.phone?.includes(phone));

  if (filter.search) {
    const matches = [];
    for (const store of stores) {
      const owner = await findOneUser({ _id: String(store.user) });
      if (panelSearch([store, owner], filter.search)) matches.push(store);
    }
    stores = matches;
  }
  const total = stores.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  stores = stores.slice(start, start + limit);

  return { data: stores, total, totalPages };
};

// ─────────────────────────────────────────────
// getStoreService (عمومی)
// ─────────────────────────────────────────────
export const getStoreService = async (storeId) => {
  if (!ObjectId.isValid(storeId))
    throw new Error('Store id is not valid', { cause: { code: 400 } });

  const store = await findOneStore({ _id: storeId });
  if (!store) throw new Error('Store not found', { cause: { code: 404 } });

  if (store.status !== 'ENABLE') throw new Error('Store not found', { cause: { code: 404 } });
  const owner =
    store.user && ObjectId.isValid(String(store.user))
      ? await findOneUser({ _id: String(store.user) })
      : null;
  return {
    ...store,
    seller_trust: owner?.seller_trust === true,
    seller: owner
      ? {
          _id: owner._id,
          firstname: owner.firstname,
          lastname: owner.lastname,
          seller_trust: owner.seller_trust === true,
          seller_active_status: owner.seller_active_status,
          seller_approved_status: owner.seller_approved_status,
        }
      : null,
    seller_profile_resolved: true,
  };
};

// ─────────────────────────────────────────────
// getStorePermService (admin/seller)
// ─────────────────────────────────────────────
export const getStorePermService = async (storeId, requester) => {
  if (!requester) throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.role === 'seller' || requester.is_seller === true;

  if (!isAdmin && !isSeller) throw new Error('No Access', { cause: { code: 403 } });

  if (!ObjectId.isValid(storeId))
    throw new Error('Store id is not valid', { cause: { code: 400 } });

  const store = await findOneStore({ _id: storeId });
  if (!store) throw new Error('Store not found', { cause: { code: 404 } });

  if (isAdmin) return store;

  const requesterId = requester._id.toString();
  const ownerId = String(store.user);

  if (ownerId === requesterId) return store;

  throw new Error('Store not found', { cause: { code: 404 } });
};

// ─────────────────────────────────────────────
// updateStoreService
// ─────────────────────────────────────────────
export const updateStoreService = async (id, data, requester) => {
  if (['seller_id', 'user', 'user_id'].some((key) => Object.hasOwn(data || {}, key)))
    throw new Error('Store owner cannot be changed', { cause: { code: 400 } });

  data = deriveContent(data, 'store');
  if (!ObjectId.isValid(id)) throw new Error('Store id is not valid', { cause: { code: 400 } });

  const userData = await findOneUser({ _id: requester._id });
  if (!userData) throw new Error('User not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = userData.role === 'seller' || userData.is_seller === true;

  // ─── چک فروشنده + پلن (فقط غیر ادمین) ───
  if (!isAdmin) {
    if (!isSeller)
      throw new Error('Seller is not active or not approved', { cause: { code: 403 } });

    if (userData.seller_approved_status !== true)
      throw new Error('Seller is not approved', { cause: { code: 403 } });

    if (String(userData.seller_active_status || '').toLowerCase() === 'inactive')
      throw new Error('Seller is not active', { cause: { code: 403 } });

    if (!userData.seller_plan?.plan_id)
      throw new Error('Seller has no active plan', { cause: { code: 403 } });

    const userPlan = await findOnePlan({ _id: userData.seller_plan.plan_id });

    if (!userPlan) {
      await updateOneUser(
        { _id: userData._id },
        { seller_plan: { plan_id: null, start_at: null } },
      );
      throw new Error('Plan not found', { cause: { code: 403 } });
    }

    if (userPlan.status !== 'ACTIVE')
      throw new Error('Plan is not active', { cause: { code: 403 } });

    const startedAt = new Date(userData.seller_plan.start_at).getTime();

    if (!Number.isFinite(startedAt))
      throw new Error('Plan start date is invalid', { cause: { code: 403 } });

    if (userPlan.duration_days !== null) {
      const planExpiry = startedAt + userPlan.duration_days * 24 * 60 * 60 * 1000;

      if (Date.now() >= planExpiry) {
        await updateOneUser(
          { _id: userData._id },
          { seller_plan: { plan_id: null, start_at: null } },
        );
        throw new Error('Plan has expired', { cause: { code: 403 } });
      }
    }
  }

  const store = await findOneStore({ _id: id });
  if (!store) throw new Error('Store not found', { cause: { code: 404 } });

  if (String(store.user) !== String(requester._id) && !isAdmin)
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (store.status === 'ROOT_DISABLE' && !isAdmin)
    throw new Error('Access Denied', { cause: { code: 400 } });

  let { name, status, profile_image_id, banner_image_id, description, contact_info, address } =
    data;

  if (status && !['ENABLE', 'DISABLE', 'ROOT_DISABLE'].includes(status))
    throw new Error('Invalid status', { cause: { code: 400 } });

  if (status === 'ROOT_DISABLE' && !isAdmin)
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (profile_image_id && !ObjectId.isValid(profile_image_id))
    throw new Error('profile_image_id is not valid', { cause: { code: 400 } });

  if (banner_image_id && !ObjectId.isValid(banner_image_id))
    throw new Error('banner_image_id is not valid', { cause: { code: 400 } });

  if (description && description.length > 255)
    throw new Error('description is too long (max length is 255)', { cause: { code: 400 } });

  if (name && name.length > 50)
    throw new Error('name is too long (max length is 50)', { cause: { code: 400 } });

  if (contact_info?.email && !emailValidator(contact_info.email))
    throw new Error('Invalid email', { cause: { code: 400 } });

  if (contact_info?.phone && !validateIRPhoneSyntax(contact_info.phone))
    throw new Error('Invalid phone', { cause: { code: 400 } });

  if (contact_info?.fax && !validateIRLandlineSyntax(contact_info.fax))
    throw new Error('Invalid landline phone (fax number)', { cause: { code: 400 } });

  validateStoreAddress(contact_info);

  /* آدرس چندزبانه: مقدار جدید (نقشه/رشته) یا حفظ مقدار فعلی */
  const addressUpdate =
    address === undefined
      ? undefined
      : address === null
        ? null
        : buildStoreAddress(address ?? contact_info?.address);
  if (addressUpdate === undefined)
    throw new Error('Invalid address value', { cause: { code: 400 } });

  const updatedContactInfo = {
    address:
      contact_info && Object.hasOwn(contact_info, 'address')
        ? typeof contact_info.address === 'string'
          ? contact_info.address.trim()
          : ''
        : (store.contact_info?.address ?? store.address ?? ''),
    email: contact_info?.email ?? store.contact_info?.email,
    phone: contact_info?.phone ?? store.contact_info?.phone,
    fax: contact_info?.fax ?? store.contact_info?.fax,
  };

  if (!updatedContactInfo.email) throw new Error('email is required', { cause: { code: 400 } });

  if (!updatedContactInfo.fax && !updatedContactInfo.phone)
    throw new Error('fax or phone number is required', { cause: { code: 400 } });

  const savedStore = await updateOneStore(
    { _id: id },
    {
      ...translationPatch(data.translations, 'store'),
      name: name ?? store.name,
      status: status ?? store.status,
      profile_image_id: profile_image_id ?? store.profile_image_id,
      banner_image_id: banner_image_id ?? store.banner_image_id,
      description: description ?? store.description,
      ...(addressUpdate !== undefined ? { address: addressUpdate } : {}),
      contact_info: updatedContactInfo,
    },
  );

  return savedStore;
};

// ─────────────────────────────────────────────
// deleteStoreService
// ─────────────────────────────────────────────
export const deleteStoreService = async (id, requester) => {
  if (!ObjectId.isValid(id)) throw new Error('Store id is not valid', { cause: { code: 400 } });

  const userData = await findOneUser({ _id: requester._id });
  if (!userData) throw new Error('User not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = userData.role === 'seller' || userData.is_seller === true;

  if (!isAdmin && !isSeller) throw new Error('No Access', { cause: { code: 403 } });

  if (!isAdmin) {
    if (userData.seller_approved_status !== true)
      throw new Error('Seller is not approved', { cause: { code: 403 } });
  }

  const store = await findOneStore({ _id: id });
  if (!store) throw new Error('Store not found', { cause: { code: 404 } });

  if (String(store.user) !== String(requester._id) && !isAdmin)
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (store.status === 'ROOT_DISABLE' && !isAdmin)
    throw new Error('Access Denied', { cause: { code: 400 } });

  await deleteOneStore({ _id: id });

  return store;
};
/*
 * آدرس چندزبانه‌ی فروشگاه:
 *  - رشته‌ی ساده → { en: text }
 *  - نقشه‌ی زبانی {en, fa, ar, tr} → همان نقشه (فقط زبان‌های معتبر و متن غیرخالی)
 *  - null/رشته‌ی خالی → null (بدون آدرس)
 *  - ورودی نامعتبر → undefined (خطا)
 */
function buildStoreAddress(input) {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input === 'string') return input.trim() ? { en: input.trim() } : null;
  if (typeof input === 'object' && !Array.isArray(input)) {
    const map = {};
    for (const [code, text] of Object.entries(input))
      if (['en', 'fa', 'ar', 'tr'].includes(code) && typeof text === 'string' && text.trim())
        map[code] = text.trim();
    return Object.keys(map).length ? map : null;
  }
  return undefined;
}

function validateStoreAddress(contactInfo) {
  if (
    contactInfo &&
    Object.hasOwn(contactInfo, 'address') &&
    contactInfo.address !== null &&
    (typeof contactInfo.address !== 'string' || contactInfo.address.length > 2000) &&
    !(
      typeof contactInfo.address === 'object' &&
      !Array.isArray(contactInfo.address) &&
      Object.values(contactInfo.address).every(
        (text) => typeof text === 'string' && text.length <= 2000,
      )
    )
  ) {
    throw new Error('Address must be a string of at most 2000 characters', {
      cause: { code: 400 },
    });
  }
}

export const getStoreStatsService = async (requester, currency = 'USD') => {
  const actor = await statsActor(requester);
  const stats = await storeStats(actor.role === 'admin' ? null : actor._id);
  for (const row of Object.values(stats.byStore)) {
    const converted = await statsMoney(row.money, currency);
    row.value = converted.amount;
    if (converted.error_code) stats.error_code = converted.error_code;
    delete row.money;
  }
  return { ...stats, currency, scope: actor.role === 'admin' ? 'all' : 'own' };
};
