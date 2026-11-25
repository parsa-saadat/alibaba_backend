import { ObjectId } from 'mongodb';
import { panelSearch } from '../../utils/helpers/panel-search.helper.js';
import { statsActor } from '../../utils/helpers/stats.helper.js';
import { userStats } from '../../model/controller/user.controller.js';
import { fieldDocument } from '../../utils/helpers/content-fields.helper.js';
import { deleteAddress } from '../../model/controller/address.controller.js';
import { deleteCarts } from '../../model/controller/cart.controller.js';
import {
  deleteOneUser,
  findOneUser,
  findUsers,
  updateOneUser,
} from '../../model/controller/user.controller.js';

import { emailValidator } from '../../utils/validators/email.validator.js';

export const getUsersService = async (filter = {}, actor) => {
  const actual =
    actor?._id && ObjectId.isValid(String(actor._id))
      ? await findOneUser({ _id: new ObjectId(String(actor._id)) })
      : null;
  if (actual?.role !== 'admin') throw new Error('Access denied', { cause: { code: 403 } });
  let { page = 1, limit = 10, desc, phone, username, role } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  let users = await findUsers({}, desc);

  if (phone) users = users.filter((user) => user.phone.includes(phone));
  if (username) users = users.filter((user) => user.username.includes(username));
  if (role && role !== 'ALL')
    users = users.filter((user) =>
      role === 'seller'
        ? user.is_seller || user.role === 'seller'
        : role === 'admin'
          ? ['admin', 'root'].includes(user.role)
          : role === 'user'
            ? !user.is_seller && !['admin', 'root', 'seller'].includes(user.role)
            : user.role === role,
    );
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

export const getUserService = async (id, requester) => {
  const user = await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  const isSelfOrAdmin =
    requester && (user._id.toString() === requester._id.toString() || requester.role === 'admin');

  if (isSelfOrAdmin) return user;

  return {
    _id: user._id,
    username: user.username,
    firstname: fieldDocument(user).firstname, // ← اگه مدل first_name هست، اینجا عوض کن
    lastname: fieldDocument(user).lastname, // ← اگه مدل last_name هست، اینجا عوض کن
    is_seller: user.is_seller,
    seller_trust: user.seller_trust,
    seller_active_status: user.seller_active_status,
    seller_approved_status: user.seller_approved_status,
  };
};

export const updateUserService = async (id, data, requester) => {
  const user = await findOneUser({ _id: id });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  let { username, firstname, lastname, email } = data;

  if (email && !emailValidator(email)) throw new Error('Invalid email', { cause: { code: 400 } });

  if (username) {
    const existing = await findOneUser({ username });
    if (existing && existing._id.toString() !== id.toString())
      throw new Error('Username already exists', { cause: { code: 400 } });
  }

  if (email) {
    const existing = await findOneUser({ email });
    if (existing && existing._id.toString() !== id.toString())
      throw new Error('Email already exists', { cause: { code: 400 } });
  }

  await updateOneUser(
    { _id: id },
    {
      username: username ?? user.username,
      ...(Object.hasOwn(data, 'firstname') ? { firstname } : {}),
      ...(Object.hasOwn(data, 'lastname') ? { lastname } : {}),
      email: email ?? user.email,
    },
  );

  return await findOneUser({ _id: id });
};

export const deleteUserService = async (id, requester) => {
  // Authorize from persisted identity, never use the actor ID as the deletion target.
  await statsActor(requester, true);
  if (!/^[a-fA-F0-9]{24}$/.test(String(id || '')) || !ObjectId.isValid(String(id)))
    throw new Error('Invalid user ID', { cause: { code: 400 } });
  const user = await findOneUser({ _id: String(id) });
  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  await deleteAddress({ user: id });

  await deleteCarts({ user_id: id });

  await deleteOneUser({ _id: id });

  return user;
};

export const getUserStatsService = async (requester) => {
  const actor = await statsActor(requester, true);
  const result = await userStats({});
  return { ...result, scope: actor.role === 'admin' ? 'all' : 'own' };
};
