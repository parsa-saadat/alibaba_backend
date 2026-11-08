import { ObjectId } from 'mongodb';

import {
  deleteAddress,
  findAddress,
  findOneAddress,
  insertAddress,
  updateAddress,
  updateOneAddress,
} from '../../model/controller/address.controller.js';
import { findOneUser, updateOneUser } from '../../model/controller/user.controller.js';

import { validateNumber } from '../../utils/validators/number.validator.js';
import { validateIRPostalCode } from '../../utils/validators/postalcode.validator.js';

export const createAddressService = async (userId, data, requester) => {
  if (userId.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('No Access', {
      cause: { code: 403 },
    });

  const requiredFields = [
    'full_name',
    'full_address',
    'building_number',
    'city',
    'province',
    'neighborhood',
    'unit',
    'postal_code',
  ];

  const isValidAddress = requiredFields.every((field) => data.address && data.address[field]);

  if (!isValidAddress) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (!validateNumber(data.address.building_number, { min: 0, max: 10000 }))
    throw new Error('Building code is not valid', { cause: { code: 400 } });

  if (!validateIRPostalCode(data.address.postal_code))
    throw new Error('Postal code is not valid', { cause: { code: 400 } });

  if (!validateNumber(data.address.unit, { min: 0, max: 1000 }))
    throw new Error('Unit is not valid', { cause: { code: 400 } });

  const user = await findOneUser({ _id: userId });

  if(!user)
    throw new Error('User not found', { cause: { code: 404 } });

  if (data.address.is_default) {
    const address = await findAddress({ user: user._id, is_default: true });
    if (address) await updateAddress({ user: user._id }, { 'address.is_default': false });
  }

  const newAddress = await insertAddress({ user: user._id, ...data });
  let address = null;
  console.log(user.address)
  if (user.address) address = [...user.address, newAddress._id];
  else address = [newAddress._id];

  await updateOneUser({ _id: user._id }, { address: address });

  return newAddress;
};

export const getAddressService = async (userId, requester, filter) => {
  let { limit = 10, page = 1 } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  const checkUser = await findOneUser({ _id: userId });

  if (!checkUser) throw new Error('User not found', { cause: { code: 400 } });

  if (userId.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('No Access', {
      cause: { code: 403 },
    });

  let address = await findAddress({ user: userId });

  const start = (page - 1) * limit;
  const totalPages = Math.ceil(address.length / limit);
  const total = address.length;

  address = address.slice(start, start + limit);

  return { data: address, total, totalPages };
};

export const getOneAddressService = async (id, userId, requester) => {
  const checkUser = await findOneUser({ _id: userId });
  if (!checkUser) throw new Error('User not found', { cause: { code: 400 } });

  if (userId.toString() !== requester._id.toString() && requester.role !== 'admin')
    throw new Error('No Access', {
      cause: { code: 403 },
    });

  const address = await findOneAddress({ user: userId, _id: id });

  if (!address) throw new Error('Address not found', { cause: { code: 400 } });

  return address;
};

export const getAllAddressService = async (filters) => {
  let { limit, page, userId, desc } = filters;

  limit ? (limit = Number(limit)) : (limit = 10);
  page ? (page = Number(page)) : (page = 1);
  desc ? (desc = true) : (desc = false);

  let query = {};

  if (userId) query.user = userId;

  let address = await findAddress(query, desc);

  const total = address.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  address = address.slice(start, start + limit);

  return { data: address, total, totalPages };
};

export const updateAddressService = async (id, userId, data, requester) => {
  if (!ObjectId.isValid(userId)) throw new Error('User id is not valid', { cause: { code: 400 } });

  if (userId !== requester._id && requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  const { address } = data;

  if (!address) throw new Error('address field important', { cause: { code: 400 } });

  const allowfields = [
    'full_name',
    'full_address',
    'building_number',
    'city',
    'province',
    'neighborhood',
    'unit',
    'postal_code',
    'is_default',
  ];

  let newData = {};

  for (let i = 0; i < allowfields.length; i++) {
    if (address[allowfields[i]]) {
      newData['address.' + [allowfields[i]]] = address[allowfields[i]];
    }
  }

  if (!newData.length < 0) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (address?.building_number && !validateNumber(address.building_number, { min: 0, max: 10000 }))
    throw new Error('Building code is not valid', { cause: { code: 400 } });

  if (address?.postal_code && !validateIRPostalCode(address.postal_code))
    throw new Error('Postal code is not valid', { cause: { code: 400 } });

  if (address?.unit && !validateNumber(address.unit, { min: 0, max: 1000 }))
    throw new Error('Unit is not valid', { cause: { code: 400 } });

  const checkUser = await findOneUser({ _id: userId });

  if (!checkUser) throw new Error('User not found', { cause: { code: 400 } });

  const checkAddress = await findOneAddress({ _id: id });

  if (!checkAddress) throw new Error('Address not found', { cause: { code: 400 } });

  if (newData['address.is_default']) {
    const address = await findAddress({
      user: userId,
      'address.is_default': true,
    });

    if (address) await updateAddress({ user: userId }, { 'address.is_default': false });
  }

  const updatedAddress = await updateOneAddress(
    { _id: id },
    {
      ...newData,
    },
  );

  return updatedAddress;
};

export const deleteAddressService = async (id, userId, requester) => {
  const checkUser = await findOneUser({ _id: userId });

  if (!checkUser) throw new Error('User not found', { cause: { code: 400 } });

  const checkAddress = await findOneAddress({ _id: id });

  if (!checkAddress) throw new Error('Address not found', { cause: { code: 400 } });

  await deleteAddress({ _id: id, user: userId });

  await updateOneUser(
    { _id: userId },
    { address: checkUser.address.filter((item) => item.toString() !== id) },
  );

  return true;
};
