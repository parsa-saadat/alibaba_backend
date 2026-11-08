import { ObjectId } from 'mongodb';

import { findOnePlan } from '../../model/controller/plan.controller.js';
import {
  deleteOneProduct,
  findOneProduct,
  findProducts,
  insertProduct,
  updateOneProduct,
} from '../../model/controller/product.controller.js';
import { deleteCarts, updateOneCart } from '../../model/controller/cart.controller.js';
import { findOneFile } from '../../model/controller/storage.controller.js';
import { findOneStore } from '../../model/controller/store.controller.js';
import { findOneUser, updateOneUser } from '../../model/controller/user.controller.js';
import { MarkdownValidator } from '../../utils/validators/markdown.validator.js';

export const createProductService = async (data, requester) => {
  const user = await findOneUser({ _id: requester._id });

  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  const isAdmin = user.role === 'admin';
  const isSeller = user.is_seller === true;

  if (!isAdmin && !isSeller) throw new Error('No Access', { cause: { code: 403 } });

  const ALLOWED_CURRENCIES = process.env.ALLOWED_CURRENCIES
    ? process.env.ALLOWED_CURRENCIES.split(',')
    : ['IRR'];
  const valid_stock_status = process.env.STOCK_STATUS
    ? process.env.STOCK_STATUS.split(',')
    : ['IN_STOCK', 'OUT_OF_STOCK'];
  const valid_status = process.env.PRODUCT_STATUS
    ? process.env.PRODUCT_STATUS.split(',').map((s) => s.toLowerCase())
    : ['ACTIVE', 'INACTIVE'];
  const valid_visibility = process.env.VISIBILITY
    ? process.env.VISIBILITY.split(',').map((s) => s.toLowerCase())
    : ['PUBLIC', 'PRIVATE'];
  const valid_dimension_units = process.env.DIMENSION_UNITS
    ? process.env.DIMENSION_UNITS.split(',')
    : ['CM', 'M'];
  const valid_weight_units = process.env.WEIGHT_UNITS
    ? process.env.WEIGHT_UNITS.split(',')
    : ['KG', 'G'];

  const requiredFields = [
    'name',
    'store_id',
    'category_id',
    'short_description',
    'description',
    'production',
    'images_id',
    'price',
    'stock',
    'visibility',
    'warranty',
    'brand',
    'dimensions',
    'weight',
  ];

  const isValidProduct = requiredFields.every((field) =>
    Object.prototype.hasOwnProperty.call(data, field),
  );

  if (!isValidProduct) throw new Error('Required fields missing', { cause: { code: 400 } });

  if (
    !data.store_id ||
    typeof data.store_id !== 'string' ||
    data.store_id.length !== 24 ||
    !ObjectId.isValid(data.store_id)
  )
    throw new Error('Invalid store ID', { cause: { code: 400 } });

  const userStore = await findOneStore({ _id: data.store_id });

  if (!userStore) throw new Error('Store not found', { cause: { code: 404 } });

  if (userStore.status !== 'ENABLE')
    throw new Error('Store has been disabled', { cause: { code: 400 } });

  if (!isAdmin && userStore.user?.toString() !== user._id.toString())
    throw new Error('No Access', { cause: { code: 403 } });

  if (!isAdmin) {
    if (user.seller_approved_status !== true || user.seller_active_status === 'inactive')
      throw new Error('Seller is not active or not approved', { cause: { code: 403 } });

    if (!user.seller_plan || !user.seller_plan.plan_id)
      throw new Error('Seller has no active plan', { cause: { code: 403 } });

    const userPlan = await findOnePlan({ _id: user.seller_plan.plan_id });

    if (!userPlan) {
      await updateOneUser(
        { _id: user._id },
        { seller_plan: { plan_id: null, start_at: null } },
      );
      throw new Error('Plan not found', { cause: { code: 403 } });
    }

    if (userPlan.status !== 'ACTIVE')
      throw new Error('Plan is not active', { cause: { code: 403 } });

    const startedAt = new Date(user.seller_plan.start_at).getTime();

    if (!Number.isFinite(startedAt))
      throw new Error('Plan start date is invalid', { cause: { code: 403 } });

    if (userPlan.duration_days !== null) {
      const planExpiry = startedAt + userPlan.duration_days * 24 * 60 * 60 * 1000;

      if (Date.now() >= planExpiry) {
        await updateOneUser(
          { _id: user._id },
          { seller_plan: { plan_id: null, start_at: null } },
        );
        throw new Error('Plan has expired', { cause: { code: 403 } });
      }
    }

    const maxProducts = userPlan.features.max_products;
    const existingProducts = await findProducts({ seller_id: user._id, status: 'ACTIVE' });

    if (existingProducts.length >= maxProducts)
      throw new Error(`Your plan is limited to ${maxProducts} active products`, {
        cause: { code: 403 },
      });
  }

  if (!data.name || typeof data.name !== 'string' || !data.name.trim())
    throw new Error('Name is required', { cause: { code: 400 } });

  if (data.name.length > 200)
    throw new Error('Name cannot exceed 200 characters', { cause: { code: 400 } });

  if (!Number.isInteger(data.category_id) || data.category_id <= 0)
    throw new Error('category_id must be a positive integer', { cause: { code: 400 } });

  if (!data.short_description || typeof data.short_description !== 'string')
    throw new Error('short_description is required', { cause: { code: 400 } });

  if (data.short_description.length > 500)
    throw new Error('short_description cannot exceed 500 characters', {
      cause: { code: 400 },
    });

  if (!data.description || typeof data.description !== 'string')
    throw new Error('Description is required', { cause: { code: 400 } });

  if (data.description.length > 50000)
    throw new Error('Description cannot exceed 50000 characters', { cause: { code: 400 } });

  if (!MarkdownValidator(data.description))
    throw new Error('Invalid markdown', { cause: { code: 400 } });

  if (
    !Number.isInteger(data.production) ||
    data.production < 1900 ||
    data.production > new Date().getFullYear()
  )
    throw new Error('Production year must be less than or equal to current year', {
      cause: { code: 400 },
    });

  if (!Array.isArray(data.images_id))
    throw new Error('images_id must be an array', { cause: { code: 400 } });

  if (data.images_id.length > 20)
    throw new Error('images_id cannot exceed 20 items', { cause: { code: 400 } });

  for (const imageId of data.images_id) {
    if (!imageId || typeof imageId !== 'string')
      throw new Error('Each image id must be a non-empty string', { cause: { code: 400 } });

    if (imageId.length !== 24 || !ObjectId.isValid(imageId))
      throw new Error('Each image id is not valid', { cause: { code: 400 } });

    const image = await findOneFile({ _id: imageId });
    if (!image) throw new Error('Image not found', { cause: { code: 404 } });
  }

  if (!data.price || typeof data.price !== 'object' || Array.isArray(data.price))
    throw new Error('Price is required', { cause: { code: 400 } });

  if (!data.price.currency || !ALLOWED_CURRENCIES.includes(data.price.currency.toUpperCase()))
    throw new Error(`Currency must be ${ALLOWED_CURRENCIES}`, { cause: { code: 400 } });

  if (!Number.isFinite(data.price.amount) || data.price.amount <= 0)
    throw new Error('Price amount must be greater than 0', { cause: { code: 400 } });

  if (data.discount !== null && data.discount !== undefined) {
    if (typeof data.discount !== 'object' || Array.isArray(data.discount))
      throw new Error('Discount must be an object', { cause: { code: 400 } });

    if (data.discount.percentage === undefined || data.discount.expirationDate === undefined)
      throw new Error('Discount percentage and expiration date is required', {
        cause: { code: 400 },
      });

    if (
      !Number.isFinite(data.discount.percentage) ||
      data.discount.percentage > 100 ||
      data.discount.percentage < 0
    )
      throw new Error('Discount percentage must be upper 0 and lowwer 100', {
        cause: { code: 400 },
      });

    const expDate = new Date(data.discount.expirationDate);

    if (isNaN(expDate.getTime()) || expDate < new Date())
      throw new Error('Discount expiration date must be in the future', {
        cause: { code: 400 },
      });
  }

  if (!Number.isInteger(data.stock) || data.stock < 0)
    throw new Error('Stock must be greater than -1', { cause: { code: 400 } });

  if (
    !data.visibility ||
    typeof data.visibility !== 'string' ||
    !valid_visibility.includes(data.visibility.toLowerCase())
  )
    throw new Error(`Visibility must be ${valid_visibility}`, { cause: { code: 400 } });

  if (typeof data.warranty !== 'boolean')
    throw new Error('Warranty must be boolean', { cause: { code: 400 } });

  if (!data.brand || typeof data.brand !== 'string' || !data.brand.trim())
    throw new Error('Brand is required', { cause: { code: 400 } });

  if (data.brand.length > 100)
    throw new Error('Brand cannot exceed 100 characters', { cause: { code: 400 } });

  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags))
      throw new Error('Tags must be an array', { cause: { code: 400 } });

    if (data.tags.length > 20)
      throw new Error('Tags cannot exceed 20 items', { cause: { code: 400 } });

    for (const tag of data.tags) {
      if (typeof tag !== 'string' || !tag.trim())
        throw new Error('Each tag must be a non-empty string', { cause: { code: 400 } });

      if (tag.length > 50)
        throw new Error('Each tag cannot exceed 50 characters', { cause: { code: 400 } });
    }
  }

  if (!data.dimensions || typeof data.dimensions !== 'object' || Array.isArray(data.dimensions))
    throw new Error('Dimensions is required', { cause: { code: 400 } });

  if (
    !data.dimensions.width ||
    typeof data.dimensions.width !== 'object' ||
    Array.isArray(data.dimensions.width)
  )
    throw new Error('Dimensions width is required', { cause: { code: 400 } });

  if (
    !data.dimensions.height ||
    typeof data.dimensions.height !== 'object' ||
    Array.isArray(data.dimensions.height)
  )
    throw new Error('Dimensions height is required', { cause: { code: 400 } });

  if (!Number.isFinite(data.dimensions.width.value) || data.dimensions.width.value <= 0)
    throw new Error('Dimensions width value must be greater than 0', { cause: { code: 400 } });

  if (!valid_dimension_units.includes(data.dimensions.width.unit?.toUpperCase()))
    throw new Error(`Dimensions width unit must be ${valid_dimension_units}`, {
      cause: { code: 400 },
    });

  if (!Number.isFinite(data.dimensions.height.value) || data.dimensions.height.value <= 0)
    throw new Error('Dimensions height value must be greater than 0', { cause: { code: 400 } });

  if (!valid_dimension_units.includes(data.dimensions.height.unit?.toUpperCase()))
    throw new Error(`Dimensions height unit must be ${valid_dimension_units}`, {
      cause: { code: 400 },
    });

  if (!data.weight || typeof data.weight !== 'object' || Array.isArray(data.weight))
    throw new Error('Weight is required', { cause: { code: 400 } });

  if (!Number.isFinite(data.weight.value) || data.weight.value <= 0)
    throw new Error('Weight value must be greater than 0', { cause: { code: 400 } });

  if (!data.weight.unit || !valid_weight_units.includes(data.weight.unit.toUpperCase()))
    throw new Error(`Weight unit must be ${valid_weight_units}`, { cause: { code: 400 } });

  const newProduct = {
    name: data.name.trim(),
    seller_id: userStore.user,
    store_id: userStore._id,
    category_id: data.category_id,
    short_description: data.short_description.trim(),
    description: data.description,
    production: data.production,
    images_id: data.images_id,
    price: {
      currency: data.price.currency.toUpperCase(),
      amount: data.price.amount,
    },
    discount: data.discount
      ? {
        percentage: data.discount.percentage,
        expirationDate: data.discount.expirationDate,
      }
      : null,
    stock: data.stock,
    stock_status: data.stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
    status: 'ACTIVE',
    visibility: data.visibility.toUpperCase(),
    warranty: data.warranty,
    brand: data.brand.toLowerCase().trim(),
    tags: data.tags || [],
    dimensions: {
      width: {
        value: data.dimensions.width.value,
        unit: data.dimensions.width.unit.toUpperCase(),
      },
      height: {
        value: data.dimensions.height.value,
        unit: data.dimensions.height.unit.toUpperCase(),
      },
    },
    weight: {
      value: data.weight.value,
      unit: data.weight.unit.toUpperCase(),
    }
  };

  return await insertProduct(newProduct);
};

export const getProductsService = async (filter = {}) => {
  let {
    page = 1, limit = 10, desc,
    seller_id, brand, name, min_production, max_production,
    category_id, stock_status, warranty, tags, currency, discount,
    min_price, max_price,
  } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1)
    throw new Error('Page is not valid', { cause: { code: 400 } });

  if (seller_id && !ObjectId.isValid(seller_id))
    throw new Error('Seller id is not valid', { cause: { code: 400 } });

  const isDesc = desc === 'true' || desc === true;
  let products = await findProducts({ status: "ACTIVE", visibility: "PUBLIC" }, isDesc);

  if (seller_id)
    products = products.filter((p) => p.seller_id?.toString() === String(seller_id));

  if (brand) products = products.filter((p) => p.brand?.toLowerCase().includes(brand.toLowerCase()));
  if (name) products = products.filter((p) => p.name?.toLowerCase().includes(name.toLowerCase()));
  if (category_id) { const c = Number(category_id); products = products.filter((p) => p.category_id === c); }
  if (stock_status) products = products.filter((p) => p.stock_status?.toLowerCase().includes(stock_status.toLowerCase()));
  if (warranty !== undefined) { const w = warranty === 'true' || warranty === true; products = products.filter((p) => p.warranty === w); }
  if (tags) { const list = Array.isArray(tags) ? tags : [tags]; products = products.filter((p) => list.some((t) => p.tags?.some((x) => x.toLowerCase().includes(t.toLowerCase())))); }
  if (currency) products = products.filter((p) => p.price?.currency?.toLowerCase() === currency.toLowerCase());
  if (discount) products = products.filter((p) => (p.discount?.percentage || 0) > 0);
  if (min_production) products = products.filter((p) => p.production >= Number(min_production));
  if (max_production) products = products.filter((p) => p.production <= Number(max_production));
  if (min_price) products = products.filter((p) => p.price?.amount >= Number(min_price));
  if (max_price) products = products.filter((p) => p.price?.amount <= Number(max_price));

  const total = products.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  products = products.slice(start, start + limit);

  return { data: products, total, totalPages };
};

export const getProductsPermService = async (sellerId, requester, filter = {}) => {
  if (!requester)
    throw new Error('Authentication required', { cause: { code: 401 } });

  console.log(requester)

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;
  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

  const requesterId = requester._id.toString();

  let targetSellerId = null;

  if (isAdmin) {
    if (sellerId) {
      if (!ObjectId.isValid(sellerId))
        throw new Error('Seller id is not valid', { cause: { code: 400 } });
      targetSellerId = String(sellerId);
    }
  } else {
    targetSellerId = requesterId;
  }

  let {
    page = 1, limit = 10, desc,
    brand, name, min_production, max_production,
    category_id, status, visibility, stock_status, warranty, tags, currency, discount,
    min_price, max_price,
  } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1)
    throw new Error('Page is not valid', { cause: { code: 400 } });

  const isDesc = desc === 'true' || desc === true;
  let products = await findProducts({}, isDesc);

  if (targetSellerId) {
    products = products.filter((p) => p.seller_id?.toString() === targetSellerId);
  }

  if (brand) products = products.filter((p) => p.brand?.toLowerCase().includes(brand.toLowerCase()));
  if (name) products = products.filter((p) => p.name?.toLowerCase().includes(name.toLowerCase()));
  if (category_id) { const c = Number(category_id); products = products.filter((p) => p.category_id === c); }
  if (stock_status) products = products.filter((p) => p.stock_status?.toLowerCase().includes(stock_status.toLowerCase()));
  if (status) products = products.filter((p) => p.status?.toLowerCase() === status.toLowerCase());
  if (visibility) products = products.filter((p) => p.visibility?.toLowerCase() === visibility.toLowerCase());
  if (warranty !== undefined) { const w = warranty === 'true' || warranty === true; products = products.filter((p) => p.warranty === w); }
  if (tags) { const list = Array.isArray(tags) ? tags : [tags]; products = products.filter((p) => list.some((t) => p.tags?.some((x) => x.toLowerCase().includes(t.toLowerCase())))); }
  if (currency) products = products.filter((p) => p.price?.currency?.toLowerCase() === currency.toLowerCase());
  if (discount) products = products.filter((p) => (p.discount?.percentage || 0) > 0);
  if (min_production) products = products.filter((p) => p.production >= Number(min_production));
  if (max_production) products = products.filter((p) => p.production <= Number(max_production));
  if (min_price) products = products.filter((p) => p.price?.amount >= Number(min_price));
  if (max_price) products = products.filter((p) => p.price?.amount <= Number(max_price));

  const total = products.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  products = products.slice(start, start + limit);

  return { data: products, total, totalPages };
};

export const getProductService = async (id) => {
  if (!id || typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id))
    throw new Error('Invalid product id', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });
  if (!product)
    throw new Error('Product not found', { cause: { code: 404 } });

  if (product.status !== 'ACTIVE' || product.visibility !== 'PUBLIC')
    throw new Error('Product not found', { cause: { code: 404 } });

  return product;
};

export const getProductPermService = async (id, requester) => {
  if (!requester)
    throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;
  if (!isAdmin && !isSeller)
    throw new Error('No Access', { cause: { code: 403 } });

  if (!id || typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id))
    throw new Error('Invalid product id', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });
  if (!product)
    throw new Error('Product not found', { cause: { code: 404 } });

  if (isAdmin) return product;

  const isOwner = product.seller_id?.toString() === requester._id.toString();
  if (isOwner) return product;

  if (product.status === 'ACTIVE' && product.visibility === 'PUBLIC')
    return product;

  throw new Error('Product not found', { cause: { code: 404 } });
};

export const updateProductService = async (id, data, requester) => {
  if (!id || typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id))
    throw new Error('Invalid product id', { cause: { code: 400 } });

  if (!data) throw new Error('body is required', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });
  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isOwner = product.seller_id?.toString() === requester._id.toString();

  if (!isAdmin && !isOwner) throw new Error('No Access', { cause: { code: 403 } });

  const ALLOWED_CURRENCIES = process.env.ALLOWED_CURRENCIES
    ? process.env.ALLOWED_CURRENCIES.split(',')
    : ['IRR'];
  const valid_stock_status = process.env.STOCK_STATUS
    ? process.env.STOCK_STATUS.split(',')
    : ['IN_STOCK', 'OUT_OF_STOCK'];
  const valid_status = process.env.PRODUCT_STATUS
    ? process.env.PRODUCT_STATUS.split(',').map((s) => s.toLowerCase())
    : ['ACTIVE', 'INACTIVE'];
  const valid_visibility = process.env.VISIBILITY
    ? process.env.VISIBILITY.split(',').map((s) => s.toLowerCase())
    : ['PUBLIC', 'PRIVATE'];
  const valid_dimension_units = process.env.DIMENSION_UNITS
    ? process.env.DIMENSION_UNITS.split(',')
    : ['CM', 'M'];
  const valid_weight_units = process.env.WEIGHT_UNITS
    ? process.env.WEIGHT_UNITS.split(',')
    : ['KG', 'G'];

  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim())
      throw new Error('Name must be a non-empty string', { cause: { code: 400 } });

    if (data.name.length > 200)
      throw new Error('Name cannot exceed 200 characters', { cause: { code: 400 } });
  }

  if (
    data.category_id !== undefined &&
    (!Number.isInteger(data.category_id) || data.category_id <= 0)
  )
    throw new Error('category_id must be a positive integer', { cause: { code: 400 } });

  if (data.short_description !== undefined) {
    if (typeof data.short_description !== 'string' || !data.short_description.trim())
      throw new Error('short_description must be a non-empty string', {
        cause: { code: 400 },
      });

    if (data.short_description.length > 500)
      throw new Error('short_description cannot exceed 500 characters', {
        cause: { code: 400 },
      });
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string' || !data.description.trim())
      throw new Error('Description must be a non-empty string', { cause: { code: 400 } });

    if (data.description.length > 50000)
      throw new Error('Description cannot exceed 50000 characters', {
        cause: { code: 400 },
      });

    if (!MarkdownValidator(data.description))
      throw new Error('Invalid markdown', { cause: { code: 400 } });
  }

  if (
    data.production !== undefined &&
    (!Number.isInteger(data.production) ||
      data.production < 1900 ||
      data.production > new Date().getFullYear())
  )
    throw new Error('Production year must be less than or equal to current year', {
      cause: { code: 400 },
    });

  if (data.images_id !== undefined) {
    if (!Array.isArray(data.images_id))
      throw new Error('images_id must be an array', { cause: { code: 400 } });

    if (data.images_id.length > 20)
      throw new Error('images_id cannot exceed 20 items', { cause: { code: 400 } });

    for (const imageId of data.images_id) {
      if (!imageId || typeof imageId !== 'string')
        throw new Error('Each image id must be a non-empty string', {
          cause: { code: 400 },
        });

      if (imageId.length !== 24 || !ObjectId.isValid(imageId))
        throw new Error('Each image id is not valid', { cause: { code: 400 } });

      const image = await findOneFile({ _id: imageId });
      if (!image) throw new Error('Image not found', { cause: { code: 404 } });
    }
  }

  if (data.price !== undefined) {
    if (typeof data.price !== 'object' || Array.isArray(data.price) || data.price === null)
      throw new Error('Price must be an object', { cause: { code: 400 } });

    if (
      data.price.currency !== undefined &&
      !ALLOWED_CURRENCIES.includes(data.price.currency.toUpperCase())
    )
      throw new Error(`Currency must be ${ALLOWED_CURRENCIES}`, { cause: { code: 400 } });

    if (
      data.price.amount !== undefined &&
      (!Number.isFinite(data.price.amount) || data.price.amount <= 0)
    )
      throw new Error('Price amount must be greater than 0', { cause: { code: 400 } });
  }

  if (data.discount !== undefined && data.discount !== null) {
    if (typeof data.discount !== 'object' || Array.isArray(data.discount))
      throw new Error('Discount must be an object', { cause: { code: 400 } });

    if (data.discount.percentage === undefined || data.discount.expirationDate === undefined)
      throw new Error('Discount percentage and expiration date is required', {
        cause: { code: 400 },
      });

    if (
      !Number.isFinite(data.discount.percentage) ||
      data.discount.percentage > 100 ||
      data.discount.percentage < 0
    )
      throw new Error('Discount percentage must be upper 0 and lowwer 100', {
        cause: { code: 400 },
      });

    const expDate = new Date(data.discount.expirationDate);

    if (isNaN(expDate.getTime()) || expDate < new Date())
      throw new Error('Discount expiration date must be in the future', {
        cause: { code: 400 },
      });
  }

  if (data.stock !== undefined && (!Number.isInteger(data.stock) || data.stock < 0))
    throw new Error('Stock must be greater than -1', { cause: { code: 400 } });

  if (
    data.stock_status !== undefined &&
    (typeof data.stock_status !== 'string' ||
      !valid_stock_status.includes(data.stock_status.toUpperCase()))
  )
    throw new Error(`Stock status must be ${valid_stock_status}`, { cause: { code: 400 } });

  const nextStock = data.stock !== undefined ? data.stock : product.stock;
  const nextStockStatus =
    data.stock_status !== undefined ? data.stock_status.toUpperCase() : product.stock_status;

  if (nextStockStatus === 'OUT_OF_STOCK' && nextStock > 0) {
    if (data.stock !== undefined)
      throw new Error('Stock must be 0 when stock status is out of stock', {
        cause: { code: 400 },
      });
    data.stock = 0;
  }

  if (nextStockStatus === 'IN_STOCK' && nextStock === 0)
    throw new Error('Stock must be upper 0 when stock status is in stock', {
      cause: { code: 400 },
    });

  if (nextStockStatus === 'COMING_SOON' && nextStock > 0) {
    if (data.stock !== undefined)
      throw new Error('Stock must be 0 when stock status is coming soon', {
        cause: { code: 400 },
      });
    data.stock = 0;
  }

  if (data.stock === 0 && data.stock_status === undefined)
    data.stock_status = 'OUT_OF_STOCK';

  if (
    data.stock > 0 &&
    data.stock_status === undefined &&
    product.stock_status === 'OUT_OF_STOCK'
  )
    data.stock_status = 'IN_STOCK';

  if (
    data.status !== undefined &&
    (typeof data.status !== 'string' ||
      !valid_status.includes(data.status.toLowerCase()))
  )
    throw new Error(`Status must be ${valid_status}`, { cause: { code: 400 } });

  if (
    data.visibility !== undefined &&
    (typeof data.visibility !== 'string' ||
      !valid_visibility.includes(data.visibility.toLowerCase()))
  )
    throw new Error(`Visibility must be ${valid_visibility}`, { cause: { code: 400 } });

  if (data.warranty !== undefined && typeof data.warranty !== 'boolean')
    throw new Error('Warranty must be boolean', { cause: { code: 400 } });

  if (data.brand !== undefined) {
    if (typeof data.brand !== 'string' || !data.brand.trim())
      throw new Error('Brand must be a non-empty string', { cause: { code: 400 } });

    if (data.brand.length > 100)
      throw new Error('Brand cannot exceed 100 characters', { cause: { code: 400 } });
  }

  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags))
      throw new Error('Tags must be an array', { cause: { code: 400 } });

    if (data.tags.length > 20)
      throw new Error('Tags cannot exceed 20 items', { cause: { code: 400 } });

    for (const tag of data.tags) {
      if (typeof tag !== 'string' || !tag.trim())
        throw new Error('Each tag must be a non-empty string', { cause: { code: 400 } });

      if (tag.length > 50)
        throw new Error('Each tag cannot exceed 50 characters', { cause: { code: 400 } });
    }
  }

  if (data.dimensions !== undefined) {
    if (typeof data.dimensions !== 'object' || Array.isArray(data.dimensions))
      throw new Error('Dimensions must be an object', { cause: { code: 400 } });

    if (data.dimensions.width !== undefined) {
      if (
        typeof data.dimensions.width !== 'object' ||
        Array.isArray(data.dimensions.width)
      )
        throw new Error('Dimensions width must be an object', { cause: { code: 400 } });

      if (!Number.isFinite(data.dimensions.width.value) || data.dimensions.width.value <= 0)
        throw new Error('Dimensions width value must be greater than 0', {
          cause: { code: 400 },
        });

      if (!valid_dimension_units.includes(data.dimensions.width.unit?.toUpperCase()))
        throw new Error(`Dimensions width unit must be ${valid_dimension_units}`, {
          cause: { code: 400 },
        });
    }

    if (data.dimensions.height !== undefined) {
      if (
        typeof data.dimensions.height !== 'object' ||
        Array.isArray(data.dimensions.height)
      )
        throw new Error('Dimensions height must be an object', { cause: { code: 400 } });

      if (!Number.isFinite(data.dimensions.height.value) || data.dimensions.height.value <= 0)
        throw new Error('Dimensions height value must be greater than 0', {
          cause: { code: 400 },
        });

      if (!valid_dimension_units.includes(data.dimensions.height.unit?.toUpperCase()))
        throw new Error(`Dimensions height unit must be ${valid_dimension_units}`, {
          cause: { code: 400 },
        });
    }
  }

  if (data.weight !== undefined) {
    if (typeof data.weight !== 'object' || Array.isArray(data.weight))
      throw new Error('Weight must be an object', { cause: { code: 400 } });

    if (!Number.isFinite(data.weight.value) || data.weight.value <= 0)
      throw new Error('Weight value must be greater than 0', { cause: { code: 400 } });

    if (!valid_weight_units.includes(data.weight.unit?.toUpperCase()))
      throw new Error(`Weight unit must be ${valid_weight_units}`, { cause: { code: 400 } });
  }

  const updatedProduct = {
    name: data.name !== undefined ? data.name.trim() : product.name,
    category_id: data.category_id !== undefined ? data.category_id : product.category_id,
    short_description:
      data.short_description !== undefined
        ? data.short_description.trim()
        : product.short_description,
    description: data.description !== undefined ? data.description : product.description,
    production: data.production !== undefined ? data.production : product.production,
    images_id: data.images_id !== undefined ? data.images_id : product.images_id,
    price: {
      currency: data.price?.currency
        ? data.price.currency.toUpperCase()
        : product.price.currency,
      amount: data.price?.amount !== undefined ? data.price.amount : product.price.amount,
    },
    discount:
      data.discount !== undefined
        ? data.discount === null
          ? null
          : {
            percentage: data.discount.percentage,
            expirationDate: data.discount.expirationDate,
          }
        : product.discount,
    stock: data.stock !== undefined ? data.stock : product.stock,
    stock_status:
      data.stock_status !== undefined
        ? data.stock_status.toUpperCase()
        : product.stock_status,
    status: data.status !== undefined ? data.status.toLowerCase() : product.status,
    visibility:
      data.visibility !== undefined ? data.visibility.toLowerCase() : product.visibility,
    warranty: data.warranty !== undefined ? data.warranty : product.warranty,
    brand: data.brand !== undefined ? data.brand.toLowerCase().trim() : product.brand,
    tags: data.tags !== undefined ? data.tags : product.tags,
    dimensions: {
      width: {
        value:
          data.dimensions?.width?.value !== undefined
            ? data.dimensions.width.value
            : product.dimensions.width.value,
        unit:
          data.dimensions?.width?.unit !== undefined
            ? data.dimensions.width.unit.toUpperCase()
            : product.dimensions.width.unit,
      },
      height: {
        value:
          data.dimensions?.height?.value !== undefined
            ? data.dimensions.height.value
            : product.dimensions.height.value,
        unit:
          data.dimensions?.height?.unit !== undefined
            ? data.dimensions.height.unit.toUpperCase()
            : product.dimensions.height.unit,
      },
    },
    weight: {
      value:
        data.weight?.value !== undefined ? data.weight.value : product.weight?.value ?? null,
      unit:
        data.weight?.unit !== undefined
          ? data.weight.unit.toUpperCase()
          : product.weight?.unit ?? null,
    }
  };

  return await updateOneProduct({ _id: id }, { ...updatedProduct, update_at: new Date() });
};

export const deleteProductService = async (id, requester) => {
  if (!id || typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id))
    throw new Error('Invalid product id', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });
  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isOwner = product.seller_id?.toString() === requester._id.toString();

  if (!isAdmin && !isOwner) throw new Error('No Access', { cause: { code: 403 } });

  await deleteOneProduct({ _id: id });

  return true;
};