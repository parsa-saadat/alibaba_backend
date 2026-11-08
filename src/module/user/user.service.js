import {
  deleteOneUser,
  findOneUser,
  findUsers,
  updateOneUser,
} from '../../model/controller/user.controller.js';

import { emailValidator } from '../../utils/validators/email.validator.js';

export const getUsersService = async (filter = {}) => {
  let { page = 1, limit = 10, desc, phone, username, role } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  let users = await findUsers({}, desc);

  if (phone) users = users.filter((user) => user.phone.includes(phone));
  if (username) users = users.filter((user) => user.username.includes(username));
  if (role) users = users.filter((user) => user.role === role);

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

  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  return user;
};

export const updateUserService = async (id, data, requester) => {
  const user = await findOneUser({ _id: id });

  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  if (user._id.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  let { username, firstname, lastname, email } = data;

  if (email && !emailValidator(email)) throw new Error('Invalid email', { cause: { code: 400 } });

  const checkUsername = username ? await findOneUser({ username }) : null;
  if (checkUsername && checkUsername._id !== id)
    throw new Error('Username already exists', { cause: { code: 400 } });

  const checkEmail = email ? await findOneUser({ email }) : null;
  if (checkEmail && checkEmail._id !== id)
    throw new Error('Email already exists', { cause: { code: 400 } });

  await updateOneUser(
    { _id: id },
    {
      username: username ?? user.username,
      firstname: firstname ?? user.firstname,
      lastname: lastname ?? user.lastname,
      email: email ?? user.email,
    },
  );

  return true;
};

export const deleteUserService = async (id, requester) => {
  const user = await findOneUser({ _id: id });

  if (user?._id !== requester?._id && requester?.role !== 'admin')
    throw new Error('Access Denied', { cause: { code: 400 } });

  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  await deleteAddress({ user: id });

  await deleteOneUser({ _id: id });

  return user;
};
