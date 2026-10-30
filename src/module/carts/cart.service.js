import { ObjectId } from 'mongodb';

import { findOneProduct } from '../../model/controller/product.controller.js';
import {
  deleteOneCart,
  findCarts,
  findOneCart,
  insertCart,
  updateOneCart,
} from '../../model/controller/cart.controller.js';

export const createCartService = async (userId, data, requester) => {
  if (!ObjectId.isValid(userId)) throw new Error('User id is not valid', { cause: { code: 400 } });

  if (userId !== requester._id) throw new Error('No Access', { cause: { code: 403 } });

  const requiredFields = ['product_id', 'quantity'];

  const isValidCart = requiredFields.every((field) => data[field] || data.quantity == 0);

  if (!isValidCart) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (!ObjectId.isValid(data.product_id))
    throw new Error('Product id is not valid', { cause: { code: 400 } });

  const checkProduct = await findOneProduct({ _id: data.product_id });

  if (!checkProduct) throw new Error('Product not found', { cause: { code: 404 } });

  if (data.quantity < 1)
    throw new Error('Quantity must be greater than 0', { cause: { code: 400 } });

  if(checkProduct.stock_status !== 'IN STOCK')
    throw new Error('Product is not available', { cause: { code: 400 } });

  if (checkProduct.quantity < data.quantity)
    throw new Error('Quantity is not in stock', { cause: { code: 400 } });

  const carts = await findCarts({ user_id: requester._id, product_id: data.product_id });

  if (carts.length > 0) throw new Error('Product already exists in cart', { cause: { code: 400 } });

  const newCart = {
    user_id: requester._id,
    product_id: data.product_id,
    quantity: data.quantity,
  };

  return await insertCart(newCart);
};

export const getCartsService = async (userId, requester, filter) => {
  if (!ObjectId.isValid(userId)) throw new Error('User id is not valid', { cause: { code: 400 } });

  if (userId !== requester._id && requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  const { page = 1, limit = 10 } = filter;

  let carts = await findCarts({ user_id: userId });

  const total = carts.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;

  carts = carts.slice(start, start + limit);

  return { data: carts, total, totalPages };
};

export const getCartService = async (userId, product, requester) => {
  if (!ObjectId.isValid(userId)) throw new Error('User id is not valid', { cause: { code: 400 } });

  if (userId !== requester._id && requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  if (!ObjectId.isValid(product)) throw new Error('Cart id is not valid', { cause: { code: 400 } });

  const cart = await findOneCart({ product_id: product, user_id: userId });

  if (!cart) throw new Error('Cart not found', { cause: { code: 404 } });

  return cart;
};

export const updateCartSsrvice = async (userId, product, data, requester) => {
  if (!ObjectId.isValid(userId)) throw new Error('User id is not valid', { cause: { code: 400 } });

  if (userId !== requester._id) throw new Error('No Access', { cause: { code: 403 } });

  if (!ObjectId.isValid(product))
    throw new Error('Product id is not valid', { cause: { code: 400 } });

  const requiredFields = ['quantity'];

  const isValidCart = requiredFields.every((field) => data[field] || data.quantity == 0);

  if (!isValidCart) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (data.quantity < 1)
    throw new Error('Quantity must be greater than 0', { cause: { code: 400 } });

  const cart = await findOneCart({ product_id: product, user_id: requester._id });

  if (!cart) throw new Error('Cart not found', { cause: { code: 404 } });

  const checkProduct = await findOneProduct({ _id: product });

  if (checkProduct.quantity < data.quantity)
    throw new Error('Quantity is not available', { cause: { code: 400 } });

  const newCart = {
    quantity: data.quantity,
  };

  return await updateOneCart(
    { product_id: product, user_id: requester._id },
    { $set: { ...newCart, update_at: new Date() } },
  );
};

export const deleteCartService = async (userId, product, requester) => {
  if (!ObjectId.isValid(userId)) throw new Error('User id is not valid', { cause: { code: 400 } });

  if (userId !== requester._id)
    throw new Error('No Access', { cause: { code: 403 } });
  
  if (!ObjectId.isValid(product))
    throw new Error('Product id is not valid', { cause: { code: 400 } });

  const cart = await findOneCart({ product_id: product, user_id: requester._id });

  if (!cart) throw new Error('Cart not found', { cause: { code: 404 } });

  await deleteOneCart({ product_id: product, user_id: requester._id });

  return true;
};
