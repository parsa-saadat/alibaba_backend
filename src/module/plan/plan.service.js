import { ObjectId } from 'mongodb';

import {
  deleteOnePlan,
  findOnePlan,
  findPlans,
  insertPlan,
  updateOnePlan,
} from '../../model/controller/plan.controller.js';

const ALLOWED_CURRENCIES = process.env.ALLOWED_CURRENCIES
  ? process.env.ALLOWED_CURRENCIES.split(',')
  : ['IRR', 'IRT'];

const featureFields = ['max_products', 'max_shops', 'max_images_per_product'];

export const createPlanService = async (data, requester) => {
  if (!requester || requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Data is not valid', { cause: { code: 400 } });

  const requiredFields = ['name', 'duration_days', 'price', 'features'];

  const isValidPlan = requiredFields.every((field) => data[field] !== undefined);

  if (!isValidPlan) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (typeof data.name !== 'string' || data.name.trim() === '')
    throw new Error('Name is not valid', { cause: { code: 400 } });

  if (data.name.length > 50)
    throw new Error('Name is too long', { cause: { code: 400 } });

  const checkPlan = await findOnePlan({ name: data.name });

  if (checkPlan) throw new Error('Plan name already exists', { cause: { code: 400 } });

  if (
    data.duration_days !== null &&
    (!Number.isInteger(data.duration_days) || data.duration_days < 1)
  )
    throw new Error('Duration days is not valid', { cause: { code: 400 } });

  if (typeof data.price !== 'object' || Array.isArray(data.price) || data.price === null)
    throw new Error('Price is not valid', { cause: { code: 400 } });

  if (!ALLOWED_CURRENCIES.includes(data.price.currency))
    throw new Error('Price currency is not valid', { cause: { code: 400 } });

  const minimumAmount = data.price.currency === 'IRT' ? 1000 : 10000;

  if (!Number.isInteger(data.price.amount) || data.price.amount < minimumAmount)
    throw new Error('Price amount is not valid', { cause: { code: 400 } });

  if (data.description !== undefined && typeof data.description !== 'string')
    throw new Error('Description is not valid', { cause: { code: 400 } });

  if (data.is_featured !== undefined && typeof data.is_featured !== 'boolean')
    throw new Error('Is featured is not valid', { cause: { code: 400 } });

  if (data.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(data.status))
    throw new Error('Status is not valid', { cause: { code: 400 } });

  if (
    data.sort_order !== undefined &&
    (!Number.isInteger(data.sort_order) || data.sort_order < 0)
  )
    throw new Error('Sort order is not valid', { cause: { code: 400 } });

  if (data.discount !== undefined && data.discount !== null) {
    if (typeof data.discount !== 'object' || Array.isArray(data.discount))
      throw new Error('Discount is not valid', { cause: { code: 400 } });

    if (
      !Number.isInteger(data.discount.percentage) ||
      data.discount.percentage < 0 ||
      data.discount.percentage > 100
    )
      throw new Error('Discount percentage is not valid', { cause: { code: 400 } });

    if (data.discount.expirationDate === undefined || data.discount.expirationDate === null)
      throw new Error('Discount expiration date is required', { cause: { code: 400 } });

    if (isNaN(new Date(data.discount.expirationDate).getTime()))
      throw new Error('Discount expiration date is not valid', { cause: { code: 400 } });
  }

  if (typeof data.features !== 'object' || Array.isArray(data.features) || data.features === null)
    throw new Error('Features is not valid', { cause: { code: 400 } });

  const isValidFeatures = featureFields.every((field) => data.features[field] !== undefined);

  if (!isValidFeatures)
    throw new Error('Features fields missing', { cause: { code: 400 } });

  for (const field of featureFields) {
    if (!Number.isInteger(data.features[field]) || data.features[field] < 0)
      throw new Error(`Features ${field} is not valid`, { cause: { code: 400 } });
  }

  if (data.is_featured === true) {
    await updateOnePlan(
      { is_featured: true },
      { is_featured: false },
    );
  }

  const newPlan = {
    name: data.name,
    duration_days: data.duration_days,
    price: {
      currency: data.price.currency,
      amount: data.price.amount,
    },
    description: data.description,
    is_featured: data.is_featured === true,
    status: data.status || 'ACTIVE',
    sort_order: data.sort_order || 0,
    discount: data.discount
      ? {
        percentage: data.discount.percentage,
        expirationDate: data.discount.expirationDate,
      }
      : null,
    features: {
      max_products: data.features.max_products,
      max_shops: data.features.max_shops,
      max_images_per_product: data.features.max_images_per_product,
    },
  };

  return await insertPlan(newPlan);
};

export const getPlansService = async (filter = {}, requester) => {
  const { page = 1, limit = 10, status } = filter;

  if (!Number.isInteger(Number(page)) || Number(page) < 1)
    throw new Error('Page is not valid', { cause: { code: 400 } });

  if (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });

  if (status !== undefined && !['ACTIVE', 'INACTIVE'].includes(status))
    throw new Error('Status is not valid', { cause: { code: 400 } });

  const isAdmin = requester && requester.role === 'admin';

  const query = {};

  if (status !== undefined) {
    if (!isAdmin) throw new Error('No Access', { cause: { code: 403 } });
    query.status = status;
  } else if (!isAdmin) {
    query.status = 'ACTIVE';
  }

  let plans = await findPlans(query);

  plans = plans.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const total = plans.length;
  const totalPages = Math.ceil(total / Number(limit));
  const start = (Number(page) - 1) * Number(limit);

  plans = plans.slice(start, start + Number(limit));

  return { data: plans, total, totalPages };
};

export const getPlanService = async (id, requester) => {
  if (!ObjectId.isValid(id))
    throw new Error('Plan id is not valid', { cause: { code: 400 } });

  const plan = await findOnePlan({ _id: id });

  if (!plan) throw new Error('Plan not found', { cause: { code: 404 } });

  const isAdmin = requester && requester.role === 'admin';

  if (!isAdmin && plan.status !== 'ACTIVE')
    throw new Error('Plan not found', { cause: { code: 404 } });

  return plan;
};

export const updatePlanService = async (id, data, requester) => {
  if (!requester || requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  if (!ObjectId.isValid(id))
    throw new Error('Plan id is not valid', { cause: { code: 400 } });

  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Data is not valid', { cause: { code: 400 } });

  const plan = await findOnePlan({ _id: id });

  if (!plan) throw new Error('Plan not found', { cause: { code: 404 } });

  const newPlan = {};

  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim() === '')
      throw new Error('Name is not valid', { cause: { code: 400 } });

    if (data.name.length > 50)
      throw new Error('Name is too long', { cause: { code: 400 } });

    const checkPlan = await findOnePlan({ name: data.name });

    if (checkPlan && !checkPlan._id.equals(id))
      throw new Error('Plan name already exists', { cause: { code: 400 } });

    newPlan.name = data.name;
  }

  if (data.duration_days !== undefined) {
    if (
      data.duration_days !== null &&
      (!Number.isInteger(data.duration_days) || data.duration_days < 1)
    )
      throw new Error('Duration days is not valid', { cause: { code: 400 } });

    newPlan.duration_days = data.duration_days;
  }

  if (data.price !== undefined) {
    if (typeof data.price !== 'object' || Array.isArray(data.price) || data.price === null)
      throw new Error('Price is not valid', { cause: { code: 400 } });

    if (!ALLOWED_CURRENCIES.includes(data.price.currency))
      throw new Error('Price currency is not valid', { cause: { code: 400 } });

    const minimumAmount = data.price.currency === 'IRT' ? 1000 : 10000;

    if (!Number.isInteger(data.price.amount) || data.price.amount < minimumAmount)
      throw new Error('Price amount is not valid', { cause: { code: 400 } });

    newPlan.price = {
      currency: data.price.currency,
      amount: data.price.amount,
    };
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string')
      throw new Error('Description is not valid', { cause: { code: 400 } });

    newPlan.description = data.description;
  }

  if (data.is_featured !== undefined) {
    if (typeof data.is_featured !== 'boolean')
      throw new Error('Is featured is not valid', { cause: { code: 400 } });

    if (data.is_featured === true) {
      await updateOnePlan(
        { is_featured: true },
        { is_featured: false },
      );
    }

    newPlan.is_featured = data.is_featured;

  }

  if (data.status !== undefined) {
    if (!['ACTIVE', 'INACTIVE'].includes(data.status))
      throw new Error('Status is not valid', { cause: { code: 400 } });

    newPlan.status = data.status;
  }

  if (data.sort_order !== undefined) {
    if (!Number.isInteger(data.sort_order) || data.sort_order < 0)
      throw new Error('Sort order is not valid', { cause: { code: 400 } });

    newPlan.sort_order = data.sort_order;
  }

  if (data.discount !== undefined) {
    if (data.discount === null) {
      newPlan.discount = null;
    } else {
      if (typeof data.discount !== 'object' || Array.isArray(data.discount))
        throw new Error('Discount is not valid', { cause: { code: 400 } });

      if (
        !Number.isInteger(data.discount.percentage) ||
        data.discount.percentage < 0 ||
        data.discount.percentage > 100
      )
        throw new Error('Discount percentage is not valid', { cause: { code: 400 } });

      if (data.discount.expirationDate === undefined || data.discount.expirationDate === null)
        throw new Error('Discount expiration date is required', { cause: { code: 400 } });

      if (isNaN(new Date(data.discount.expirationDate).getTime()))
        throw new Error('Discount expiration date is not valid', { cause: { code: 400 } });

      newPlan.discount = {
        percentage: data.discount.percentage,
        expirationDate: data.discount.expirationDate,
      };
    }
  }

  if (data.features !== undefined) {
    if (typeof data.features !== 'object' || Array.isArray(data.features) || data.features === null)
      throw new Error('Features is not valid', { cause: { code: 400 } });

    const isValidFeatures = featureFields.every((field) => data.features[field] !== undefined);

    if (!isValidFeatures)
      throw new Error('Features fields missing', { cause: { code: 400 } });

    for (const field of featureFields) {
      if (!Number.isInteger(data.features[field]) || data.features[field] < 0)
        throw new Error(`Features ${field} is not valid`, { cause: { code: 400 } });
    }

    newPlan.features = {
      max_products: data.features.max_products,
      max_shops: data.features.max_shops,
      max_images_per_product: data.features.max_images_per_product,
    };
  }

  if (Object.keys(newPlan).length === 0)
    throw new Error('No fields to update', { cause: { code: 400 } });

  return await updateOnePlan(
    { _id: id },
    { ...newPlan },
  );
};

export const deletePlanService = async (id, requester) => {
  if (!requester || requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  if (!ObjectId.isValid(id))
    throw new Error('Plan id is not valid', { cause: { code: 400 } });

  const plan = await findOnePlan({ _id: id });

  if (!plan) throw new Error('Plan not found', { cause: { code: 404 } });

  await deleteOnePlan({ _id: id });

  return true;
};