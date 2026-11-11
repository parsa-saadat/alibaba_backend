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
  const requiredFields = ['name', 'contact_info'];
  const isValidStore = requiredFields.every((field) => data[field]);

  if (!isValidStore) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (data?.profile_image_id && !ObjectId.isValid(data?.profile_image_id))
    throw new Error('profile_image_id is not valid', { cause: { code: 400 } });

  if (data?.banner_image_id && !ObjectId.isValid(data?.banner_image_id))
    throw new Error('banner_image_id is not valid', { cause: { code: 400 } });

  if (!data.contact_info?.email)
    throw new Error('email is required', { cause: { code: 400 } });

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
    user: user._id,
    name: data?.name,
    status: 'ENABLE',
    profile_image_id: data?.profile_image_id,
    banner_image_id: data?.banner_image_id,
    description: data?.description ?? null,
    contact_info: {
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

  if (name) stores = stores.filter((s) => s.name?.includes(name));
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
  if (!requester)
    throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.role === 'seller' || requester.is_seller === true;

  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

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

  if (name) stores = stores.filter((s) => s.name?.includes(name));
  if (status) stores = stores.filter((s) => s.status === status);
  if (email) stores = stores.filter((s) => s.contact_info?.email?.includes(email));
  if (phone) stores = stores.filter((s) => s.contact_info?.phone?.includes(phone));

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

  if (store.status !== 'ENABLE')
    throw new Error('Store not found', { cause: { code: 404 } });

  return store;
};

// ─────────────────────────────────────────────
// getStorePermService (admin/seller)
// ─────────────────────────────────────────────
export const getStorePermService = async (storeId, requester) => {
  if (!requester)
    throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.role === 'seller' || requester.is_seller === true;

  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

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
  if (!ObjectId.isValid(id))
    throw new Error('Store id is not valid', { cause: { code: 400 } });

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

  let { name, status, profile_image_id, banner_image_id, description, contact_info } = data;

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

  const updatedContactInfo = {
    email: contact_info?.email ?? store.contact_info?.email,
    phone: contact_info?.phone ?? store.contact_info?.phone,
    fax: contact_info?.fax ?? store.contact_info?.fax,
  };

  if (!updatedContactInfo.email)
    throw new Error('email is required', { cause: { code: 400 } });

  if (!updatedContactInfo.fax && !updatedContactInfo.phone)
    throw new Error('fax or phone number is required', { cause: { code: 400 } });

  await updateOneStore(
    { _id: id },
    {
      name: name ?? store.name,
      status: status ?? store.status,
      profile_image_id: profile_image_id ?? store.profile_image_id,
      banner_image_id: banner_image_id ?? store.banner_image_id,
      description: description ?? store.description,
      contact_info: updatedContactInfo,
    },
  );

  return true;
};

// ─────────────────────────────────────────────
// deleteStoreService
// ─────────────────────────────────────────────
export const deleteStoreService = async (id, requester) => {
  if (!ObjectId.isValid(id))
    throw new Error('Store id is not valid', { cause: { code: 400 } });

  const userData = await findOneUser({ _id: requester._id });
  if (!userData) throw new Error('User not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = userData.role === 'seller' || userData.is_seller === true;

  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

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