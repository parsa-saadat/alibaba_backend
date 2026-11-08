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
import { findOneUser } from '../../model/controller/user.controller.js';

export const createStoreService = async (user, data, requester) => {
  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  const userData = await findOneUser({ _id: user._id })

  if (userData.role == "seller" && (userData.seller_approved_status !== true || userData.seller_active_status == "INACTIVE"))
    throw new Error('Seller has no actived or is not approved ', { cause: { code: 403 } });

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
  // فیلتر status عمداً اعمال نمی‌شود تا کسی نتواند DISABLE ببیند

  const total = stores.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  stores = stores.slice(start, start + limit);

  return { data: stores, total, totalPages };
};

export const getStoresPermService = async (userId, requester, filter = {}) => {
  if (!requester)
    throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin  = requester.role === 'admin';
  const isSeller = requester.role === 'seller';
  console.log(requester , isAdmin , isSeller)
  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

  const requesterId = requester._id.toString();

  // ── تعیین کاربر هدف ──
  let targetUserId = null; // null = همه

  if (isAdmin) {
    // ادمین: اگر user_id داده شد → همان کاربر، وگرنه همه
    if (userId) {
      if (!ObjectId.isValid(userId))
        throw new Error('User id is not valid', { cause: { code: 400 } });
      targetUserId = String(userId);
    }
  } else {
    // فروشنده: همیشه فقط خودش — user_id ورودی نادیده گرفته می‌شود
    targetUserId = requesterId;
  }

  let { page = 1, limit = 10, desc, name, status, email, phone } = filter;
  limit = Number(limit) || 10;
  page  = Number(page)  || 1;

  // ── ساخت query ──
  const query = {};
  if (targetUserId) query.user = targetUserId;

  let stores = await findStores(query, desc);

  // ── فیلترهای جستجو ──
  if (name)   stores = stores.filter((s) => s.name?.includes(name));
  if (status) stores = stores.filter((s) => s.status === status);
  if (email)  stores = stores.filter((s) => s.contact_info?.email?.includes(email));
  if (phone)  stores = stores.filter((s) => s.contact_info?.phone?.includes(phone));

  const total      = stores.length;
  const totalPages = Math.ceil(total / limit);
  const start      = (page - 1) * limit;
  stores = stores.slice(start, start + limit);

  return { data: stores, total, totalPages };
};

export const getStoreService = async (storeId) => {
  if (!ObjectId.isValid(storeId))
    throw new Error('Store id is not valid', { cause: { code: 400 } });

  const store = await findOneStore({ _id: storeId });
  if (!store)
    throw new Error('Store not found', { cause: { code: 404 } });

  if (store.status !== 'ENABLE')
    throw new Error('Store not found', { cause: { code: 404 } });

  return store;
};

export const getStorePermService = async (storeId, requester) => {
  if (!requester)
    throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.role === 'seller';
  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

  if (!ObjectId.isValid(storeId))
    throw new Error('Store id is not valid', { cause: { code: 400 } });

  const store = await findOneStore({ _id: storeId });
  if (!store)
    throw new Error('Store not found', { cause: { code: 404 } });

  if (isAdmin) return store;

  // seller
  const requesterId = requester._id.toString();
  const ownerId = String(store.user);

  if (ownerId === requesterId) return store; // owner: any status

  // other sellers/users' stores → hidden
  throw new Error('Store not found', { cause: { code: 404 } });
};

export const updateStoreService = async (id, data, requester) => {
  const userData = await findOneUser({ _id: requester._id })

  if (userData.role == "seller" && (userData.seller_approved_status !== true || userData.seller_active_status == "INACTIVE"))
    throw new Error('Seller has no actived or is not approved ', { cause: { code: 403 } });

  const store = await findOneStore({ _id: id });

  if (!store) throw new Error('Store not found', { cause: { code: 404 } });

  if (store.user.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });


  if (store.status === 'ROOT_DISABLE' && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  let { name, status, profile_image_id, banner_image_id, description, contact_info } = data;

  if (status && !['ENABLE', 'DISABLE', 'ROOT_DISABLE'].includes(status))
    throw new Error('Invalid status', { cause: { code: 400 } });

  if (status === 'ROOT_DISABLE' && requester.role !== 'admin')
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

export const deleteStoreService = async (id, requester) => {
  const userData = await findOneUser({ _id: userId })

  if (userData.role == "seller" && (userData.seller_approved_status !== true || userData.seller_active_status == "INACTIVE"))
    throw new Error('Seller has no actived or is not approved ', { cause: { code: 403 } });

  const store = await findOneStore({ _id: id });

  if (store?.user?.toString() !== requester?._id?.toString() && requester?.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (!store) throw new Error('Store not found', { cause: { code: 404 } });

  if (store.status === 'ROOT_DISABLE' && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  await deleteOneStore({ _id: id });

  return store;
};