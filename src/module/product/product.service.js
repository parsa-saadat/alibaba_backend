import { panelSearch } from '../../utils/helpers/panel-search.helper.js';
import { statsActor } from '../../utils/helpers/stats.helper.js';
import { productStats } from '../../model/controller/product.controller.js';
import { fieldDocument } from '../../utils/helpers/content-fields.helper.js';
import {
  searchableBrand,
  deriveContent,
  translationCreate,
  translationPatch,
  searchableName,
  searchableTags,
} from '../../utils/helpers/localization.helper.js';

import { normalizeCatalogPrice } from '../fx/fx.service.js';

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
import { findOneStore, findStores } from '../../model/controller/store.controller.js';
import {
  findOneUser,
  findUsersByIds,
  updateOneUser,
} from '../../model/controller/user.controller.js';
import { findOneCategory } from '../../model/controller/category.controller.js';
import { MarkdownValidator } from '../../utils/validators/markdown.validator.js';

// ─── Projections ───
const LIST_PROJECTION = {
  _id: 1,
  name: 1,
  tags: 1,
  brand: 1,
  price: 1,
  discount: 1,
  stock: 1,
  stock_status: 1,
  images_id: 1,
  store_id: 1,
  seller_id: 1,
  rating: 1,
  category_id: 1, // primary (backward compat)
  category_ids: 1, // ⭐ همه‌ی دسته‌ها
  production: 1,
  warranty: 1,
};

const PERM_PROJECTION = {
  ...LIST_PROJECTION,
  status: 1,
  visibility: 1,
};

const MAX_CATEGORIES_PER_PRODUCT = 10;

// ─────────────────────────────────────────────
// createProductService
// ─────────────────────────────────────────────
export const createProductService = async (data, requester, { duplicate = false } = {}) => {
  data = deriveContent(data, 'product');
  const user = await findOneUser({ _id: requester._id });

  if (!user) throw new Error('User not found', { cause: { code: 404 } });

  const isAdmin = user.role === 'admin';
  const isSeller = user.is_seller === true;

  if (!isAdmin && !isSeller) throw new Error('No Access', { cause: { code: 403 } });
  if (data && Object.hasOwn(data, 'price'))
    data = { ...data, price: await normalizeCatalogPrice(data.price) };

  const valid_stock_status = process.env.STOCK_STATUS
    ? process.env.STOCK_STATUS.split(',')
    : ['IN_STOCK', 'OUT_OF_STOCK'];
  const valid_status = process.env.PRODUCT_STATUS
    ? process.env.PRODUCT_STATUS.split(',').map((s) => s.toLowerCase())
    : ['active', 'inactive'];
  const valid_visibility = process.env.VISIBILITY
    ? process.env.VISIBILITY.split(',').map((s) => s.toLowerCase())
    : ['public', 'private'];
  const valid_dimension_units = process.env.DIMENSION_UNITS
    ? process.env.DIMENSION_UNITS.split(',')
    : ['CM', 'M'];
  const valid_weight_units = process.env.WEIGHT_UNITS
    ? process.env.WEIGHT_UNITS.split(',')
    : ['KG', 'G'];

  const requiredFields = [
    'name',
    'store_id',
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

  // ─── ⭐ category_ids (حداقل یکی، حداکثر ۱۰) ───
  let inputCategoryIds = [];

  if (Array.isArray(data.category_ids) && data.category_ids.length > 0) {
    inputCategoryIds = data.category_ids;
  } else if (data.category_id) {
    inputCategoryIds = [data.category_id];
  } else {
    throw new Error('category_ids is required', { cause: { code: 400 } });
  }

  if (inputCategoryIds.length > MAX_CATEGORIES_PER_PRODUCT)
    throw new Error(`category_ids cannot exceed ${MAX_CATEGORIES_PER_PRODUCT} items`, {
      cause: { code: 400 },
    });

  const seenCategoryIds = new Set();
  const validCategoryIds = [];

  for (const cid of inputCategoryIds) {
    if (!cid || typeof cid !== 'string' || cid.length !== 24 || !ObjectId.isValid(cid))
      throw new Error('Invalid category id', { cause: { code: 400 } });

    if (seenCategoryIds.has(cid))
      throw new Error(`Duplicate category id: ${cid}`, { cause: { code: 400 } });
    seenCategoryIds.add(cid);

    const category = await findOneCategory({ _id: cid });
    if (!category) throw new Error(`Category not found: ${cid}`, { cause: { code: 404 } });
    if (category.status !== 'ACTIVE')
      throw new Error(`Category is not active: ${category.name}`, { cause: { code: 400 } });

    validCategoryIds.push(category._id);
  }

  // ─── store_id ───
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
      await updateOneUser({ _id: user._id }, { seller_plan: { plan_id: null, start_at: null } });
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
        await updateOneUser({ _id: user._id }, { seller_plan: { plan_id: null, start_at: null } });
        throw new Error('Plan has expired', { cause: { code: 403 } });
      }
    }

    const maxProducts = userPlan.features.max_products;
    const existingProducts = await findProducts({ seller_id: user._id, status: 'ACTIVE' });

    if (!duplicate && existingProducts.length >= maxProducts)
      throw new Error(`Your plan is limited to ${maxProducts} active products`, {
        cause: { code: 403 },
      });
  }

  if (!data.name || typeof data.name !== 'string' || !data.name.trim())
    throw new Error('Name is required', { cause: { code: 400 } });

  if (data.name.length > 200)
    throw new Error('Name cannot exceed 200 characters', { cause: { code: 400 } });

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

  if (!data.price.currency || data.price.currency !== 'USD')
    throw new Error('Catalog price must be USD', { cause: { code: 400 } });

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
    ...translationCreate(data.translations, 'product'),
    name: data.name.trim(),
    seller_id: userStore.user,
    store_id: userStore._id,
    category_id: validCategoryIds[0], // primary (backward compat)
    category_ids: validCategoryIds, // ⭐ همه‌ی دسته‌ها
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
    status: duplicate ? 'INACTIVE' : 'ACTIVE',
    visibility: duplicate ? 'PRIVATE' : data.visibility.toUpperCase(),
    warranty: data.warranty,
    brand: data.brand.trim(),
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
    },
  };

  return await insertProduct(newProduct);
};

// ─────────────────────────────────────────────
// getProductsService
// ─────────────────────────────────────────────
export const getProductsService = async (filter = {}) => {
  let {
    page = 1,
    limit = 10,
    desc,
    seller_id,
    brand,
    name,
    min_production,
    max_production,
    category_id,
    category_ids,
    stock_status,
    warranty,
    tags,
    currency,
    discount,
    min_price,
    max_price,
  } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100) throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1) throw new Error('Page is not valid', { cause: { code: 400 } });

  if (seller_id && !ObjectId.isValid(seller_id))
    throw new Error('Seller id is not valid', { cause: { code: 400 } });

  if (category_id && !ObjectId.isValid(category_id))
    throw new Error('Category id is not valid', { cause: { code: 400 } });

  // ─── ⭐ ساخت لیست فیلتر دسته‌بندی (OR) ───
  const categoryFilterList = [];

  if (category_id) categoryFilterList.push(String(category_id));

  if (category_ids) {
    const list = Array.isArray(category_ids) ? category_ids : String(category_ids).split(',');
    for (const cid of list) {
      const trimmed = String(cid).trim();
      if (trimmed && ObjectId.isValid(trimmed) && !categoryFilterList.includes(trimmed)) {
        categoryFilterList.push(trimmed);
      }
    }
  }

  const isDesc = desc === 'true' || desc === true;

  let products = await findProducts(
    { status: 'ACTIVE', visibility: 'PUBLIC' },
    isDesc,
    LIST_PROJECTION,
  );

  if (seller_id) products = products.filter((p) => p.seller_id?.toString() === String(seller_id));
  if (brand) products = products.filter((p) => searchableBrand(p).includes(brand.toLowerCase()));
  if (name) products = products.filter((p) => searchableName(p).includes(name.toLowerCase()));

  // ⭐ فیلتر category — با پشتیبانی از category_ids آرایه یا تک
  if (categoryFilterList.length > 0) {
    products = products.filter((p) => {
      const pCats =
        Array.isArray(p.category_ids) && p.category_ids.length > 0
          ? p.category_ids.map(String)
          : p.category_id
            ? [String(p.category_id)]
            : [];
      return categoryFilterList.some((cid) => pCats.includes(cid));
    });
  }

  if (stock_status)
    products = products.filter((p) =>
      p.stock_status?.toLowerCase().includes(stock_status.toLowerCase()),
    );
  if (warranty !== undefined) {
    const w = warranty === 'true' || warranty === true;
    products = products.filter((p) => p.warranty === w);
  }
  if (tags) {
    const list = Array.isArray(tags) ? tags : [tags];
    products = products.filter((p) =>
      list.some((t) => searchableTags(p).some((x) => x.toLowerCase().includes(t.toLowerCase()))),
    );
  }
  if (currency)
    products = products.filter((p) => p.price?.currency?.toLowerCase() === currency.toLowerCase());
  if (discount) products = products.filter((p) => (p.discount?.percentage || 0) > 0);
  if (min_production) products = products.filter((p) => p.production >= Number(min_production));
  if (max_production) products = products.filter((p) => p.production <= Number(max_production));
  if (min_price) products = products.filter((p) => p.price?.amount >= Number(min_price));
  if (max_price) products = products.filter((p) => p.price?.amount <= Number(max_price));

  const total = products.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  products = products.slice(start, start + limit);

  // ─── افزودن store_name (inline) ───
  if (products.length > 0) {
    const storeIdSet = new Set();
    for (const p of products) {
      if (p.store_id && ObjectId.isValid(String(p.store_id))) {
        storeIdSet.add(String(p.store_id));
      }
    }
    const storeIdList = [...storeIdSet];

    if (storeIdList.length > 0) {
      const stores = await findStores({
        _id: { $in: storeIdList.map((id) => new ObjectId(id)) },
      });

      const storeNameMap = new Map();
      for (const s of stores) {
        storeNameMap.set(String(s._id), { name: s.name, translations: s.translations });
      }

      products = products.map((p) => ({
        ...p,
        store_name: storeNameMap.get(String(p.store_id))?.name || null,
        store_translations: storeNameMap.get(String(p.store_id))?.translations,
      }));
    } else {
      products = products.map((p) => ({ ...p, store_name: null }));
    }
  }

  return { data: products, total, totalPages };
};

// ─────────────────────────────────────────────
// getProductsPermService
// ─────────────────────────────────────────────
export const getProductsPermService = async (sellerId, requester, filter = {}) => {
  if (!requester) throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;
  if (!isAdmin && !isSeller) throw new Error('No Access', { cause: { code: 403 } });

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
    page = 1,
    limit = 10,
    desc,
    brand,
    name,
    min_production,
    max_production,
    category_id,
    category_ids,
    status,
    visibility,
    stock_status,
    warranty,
    tags,
    currency,
    discount,
    min_price,
    max_price,
  } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100) throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1) throw new Error('Page is not valid', { cause: { code: 400 } });

  if (category_id && !ObjectId.isValid(category_id))
    throw new Error('Category id is not valid', { cause: { code: 400 } });

  // ─── ⭐ ساخت لیست فیلتر دسته‌بندی (OR) ───
  const categoryFilterList = [];

  if (category_id) categoryFilterList.push(String(category_id));

  if (category_ids) {
    const list = Array.isArray(category_ids) ? category_ids : String(category_ids).split(',');
    for (const cid of list) {
      const trimmed = String(cid).trim();
      if (trimmed && ObjectId.isValid(trimmed) && !categoryFilterList.includes(trimmed)) {
        categoryFilterList.push(trimmed);
      }
    }
  }

  const isDesc = desc === 'true' || desc === true;

  let products = await findProducts({}, isDesc, PERM_PROJECTION);

  if (filter.search) {
    const matches = [];
    for (const product of products) {
      const owner = await findOneUser({ _id: String(product.seller_id) });
      const store = await findOneStore({ _id: String(product.store_id) });
      if (panelSearch([product, owner, store], filter.search)) matches.push(product);
    }
    products = matches;
  }
  if (targetSellerId) products = products.filter((p) => p.seller_id?.toString() === targetSellerId);
  if (brand) products = products.filter((p) => searchableBrand(p).includes(brand.toLowerCase()));
  if (name) products = products.filter((p) => searchableName(p).includes(name.toLowerCase()));

  if (categoryFilterList.length > 0) {
    products = products.filter((p) => {
      const pCats =
        Array.isArray(p.category_ids) && p.category_ids.length > 0
          ? p.category_ids.map(String)
          : p.category_id
            ? [String(p.category_id)]
            : [];
      return categoryFilterList.some((cid) => pCats.includes(cid));
    });
  }

  if (stock_status)
    products = products.filter((p) =>
      p.stock_status?.toLowerCase().includes(stock_status.toLowerCase()),
    );
  if (status) products = products.filter((p) => p.status?.toLowerCase() === status.toLowerCase());
  if (visibility)
    products = products.filter((p) => p.visibility?.toLowerCase() === visibility.toLowerCase());
  if (warranty !== undefined) {
    const w = warranty === 'true' || warranty === true;
    products = products.filter((p) => p.warranty === w);
  }
  if (tags) {
    const list = Array.isArray(tags) ? tags : [tags];
    products = products.filter((p) =>
      list.some((t) => searchableTags(p).some((x) => x.toLowerCase().includes(t.toLowerCase()))),
    );
  }
  if (currency)
    products = products.filter((p) => p.price?.currency?.toLowerCase() === currency.toLowerCase());
  if (discount) products = products.filter((p) => (p.discount?.percentage || 0) > 0);
  if (min_production) products = products.filter((p) => p.production >= Number(min_production));
  if (max_production) products = products.filter((p) => p.production <= Number(max_production));
  if (min_price) products = products.filter((p) => p.price?.amount >= Number(min_price));
  if (max_price) products = products.filter((p) => p.price?.amount <= Number(max_price));

  const total = products.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  products = products.slice(start, start + limit);

  // ─── افزودن store_name (inline) ───
  if (products.length > 0) {
    const storeIdSet = new Set();
    for (const p of products) {
      if (p.store_id && ObjectId.isValid(String(p.store_id))) {
        storeIdSet.add(String(p.store_id));
      }
    }
    const storeIdList = [...storeIdSet];

    if (storeIdList.length > 0) {
      const stores = await findStores({
        _id: { $in: storeIdList.map((id) => new ObjectId(id)) },
      });

      const storeNameMap = new Map();
      for (const s of stores) {
        storeNameMap.set(String(s._id), { name: s.name, translations: s.translations });
      }

      products = products.map((p) => ({
        ...p,
        store_name: storeNameMap.get(String(p.store_id))?.name || null,
        store_translations: storeNameMap.get(String(p.store_id))?.translations,
      }));
    } else {
      products = products.map((p) => ({ ...p, store_name: null }));
    }
  }

  return { data: products, total, totalPages };
};

// ─────────────────────────────────────────────
// getProductService
// ─────────────────────────────────────────────
export const getProductService = async (id) => {
  if (!id || typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id))
    throw new Error('Invalid product id', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });
  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  if (product.status !== 'ACTIVE' || product.visibility !== 'PUBLIC')
    throw new Error('Product not found', { cause: { code: 404 } });

  return product;
};

// ─────────────────────────────────────────────
// getProductPermService
// ─────────────────────────────────────────────
export const getProductPermService = async (id, requester) => {
  if (!requester) throw new Error('Authentication required', { cause: { code: 401 } });

  const isAdmin = requester.role === 'admin';
  const isSeller = requester.is_seller === true;
  if (!isAdmin && !isSeller) throw new Error('No Access', { cause: { code: 403 } });

  if (!id || typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id))
    throw new Error('Invalid product id', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });
  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  if (isAdmin) return product;

  const isOwner = product.seller_id?.toString() === requester._id.toString();
  if (isOwner) return product;

  if (product.status === 'ACTIVE' && product.visibility === 'PUBLIC') return product;

  throw new Error('Product not found', { cause: { code: 404 } });
};

// ─────────────────────────────────────────────
// searchStoresByProductService
// GET /product/stores — «تأمین‌کنندگان» (Suppliers) مثل علی‌بابا:
// فروشگاه‌هایی که کالای جستجوشده را دارند، همراه با کالاهای مطابق و آمار هر فروشگاه.
//
// فیلتر محصول : q|name, brand, category_id, category_ids, tags, currency, discount,
//               in_stock, stock_status, warranty, min_price, max_price,
//               min_production, max_production
// فیلتر فروشگاه: verified (فروشنده‌ی مورد اعتماد), min_products (حداقل کالای مطابق)
// مرتب‌سازی   : sort = relevance | products | newest | oldest | name | price_asc | price_desc | trust
// صفحه‌بندی    : page, limit (۱ تا ۱۰۰)، products_per_store (۱ تا ۲۰؛ پیش‌فرض ۶)
// ─────────────────────────────────────────────
const toBool = (v) => v === true || v === 'true' || v === '1' || v === 1;
const listOf = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter(Boolean);
const effectivePrice = (p) => {
  const amount = Number(p.price?.amount);
  if (!Number.isFinite(amount)) return null;
  const pct = Number(p.discount?.percentage) || 0;
  return pct > 0 ? Math.round(amount * (1 - pct / 100)) : amount;
};

export const searchStoresByProductService = async (filter = {}) => {
  const {
    q,
    name,
    brand,
    category_id,
    category_ids,
    tags,
    currency,
    discount,
    in_stock,
    stock_status,
    warranty,
    min_price,
    max_price,
    min_production,
    max_production,
    verified,
    min_products,
    sort = 'relevance',
    page = 1,
    limit = 20,
    products_per_store = 6,
  } = filter;

  /* q/name اختیاری است: بدون آن، فروشگاه‌ها بر اساس بقیه‌ی فیلترها (مثل دسته‌بندی) و در نبود هر فیلتر، همه‌ی فروشگاه‌های فعال برمی‌گردند */
  const queryText = String(q || name || '').trim();

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const perStore = Math.min(20, Math.max(1, Number(products_per_store) || 6));
  if (limitNum < 1 || limitNum > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (pageNum < 1) throw new Error('Page is not valid', { cause: { code: 400 } });

  const SORTS = [
    'relevance',
    'products',
    'newest',
    'oldest',
    'name',
    'price_asc',
    'price_desc',
    'trust',
  ];
  const sortKey = SORTS.includes(sort) ? sort : 'relevance';

  // همه‌ی کلمات جستجو باید در نام/برند/برچسب کالا باشند (جستجوی چندکلمه‌ای)
  const tokens = queryText.toLowerCase().split(/\s+/).filter(Boolean);

  // فیلتر دسته‌بندی (OR) مثل getProductsService
  const categoryFilterList = [];
  if (category_id) {
    if (!ObjectId.isValid(category_id))
      throw new Error('Category id is not valid', { cause: { code: 400 } });
    categoryFilterList.push(String(category_id));
  }
  for (const cid of listOf(category_ids)) {
    if (ObjectId.isValid(cid) && !categoryFilterList.includes(cid)) categoryFilterList.push(cid);
  }

  let products = await findProducts({ status: 'ACTIVE', visibility: 'PUBLIC' }, false, {
    _id: 1,
    name: 1,
    brand: 1,
    store_id: 1,
    seller_id: 1,
    images_id: 1,
    price: 1,
    discount: 1,
    stock: 1,
    stock_status: 1,
    rating: 1,
    tags: 1,
    category_id: 1,
    category_ids: 1,
    production: 1,
    warranty: 1,
    create_at: 1,
  });

  products = products.filter((p) => {
    const hay =
      `${searchableName(p)} ${searchableBrand(p)} ${searchableTags(p).join(' ')}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });

  if (brand)
    products = products.filter((p) => p.brand?.toLowerCase().includes(String(brand).toLowerCase()));
  if (categoryFilterList.length > 0) {
    products = products.filter((p) => {
      const cats =
        Array.isArray(p.category_ids) && p.category_ids.length > 0
          ? p.category_ids.map(String)
          : p.category_id
            ? [String(p.category_id)]
            : [];
      return categoryFilterList.some((cid) => cats.includes(cid));
    });
  }
  const tagList = listOf(tags);
  if (tagList.length > 0)
    products = products.filter((p) =>
      tagList.some((t) => searchableTags(p).some((x) => x.toLowerCase().includes(t.toLowerCase()))),
    );
  if (currency)
    products = products.filter(
      (p) => p.price?.currency?.toLowerCase() === String(currency).toLowerCase(),
    );
  if (toBool(discount)) products = products.filter((p) => (p.discount?.percentage || 0) > 0);
  if (toBool(in_stock))
    products = products.filter((p) => p.stock_status === 'IN_STOCK' && (p.stock ?? 1) > 0);
  if (stock_status)
    products = products.filter(
      (p) => p.stock_status?.toLowerCase() === String(stock_status).toLowerCase(),
    );
  if (warranty !== undefined && warranty !== '')
    products = products.filter((p) => Boolean(p.warranty) === toBool(warranty));
  if (min_price) products = products.filter((p) => p.price?.amount >= Number(min_price));
  if (max_price) products = products.filter((p) => p.price?.amount <= Number(max_price));
  if (min_production) products = products.filter((p) => p.production >= Number(min_production));
  if (max_production) products = products.filter((p) => p.production <= Number(max_production));

  /* آیا هیچ فیلتر محصولی اعمال نشده؟ آن‌وقت فروشگاه‌های بدون کالا هم نمایش داده می‌شوند */
  const hasProductFilter =
    tokens.length > 0 ||
    Boolean(brand) ||
    categoryFilterList.length > 0 ||
    tagList.length > 0 ||
    Boolean(currency) ||
    toBool(discount) ||
    toBool(in_stock) ||
    Boolean(stock_status) ||
    (warranty !== undefined && warranty !== '') ||
    Boolean(min_price) ||
    Boolean(max_price) ||
    Boolean(min_production) ||
    Boolean(max_production);

  const empty = (extra = {}) => ({
    data: [],
    total: 0,
    totalPages: 0,
    page: pageNum,
    limit: limitNum,
    search_query: queryText,
    matched_products_count: products.length,
    facets: { brands: [], price: { min: null, max: null } },
    ...extra,
  });

  if (products.length === 0 && hasProductFilter) return empty();

  // ─── فروشگاه‌های فعال ───
  // با فیلتر: فقط فروشگاه‌هایی که کالای مطابق دارند. بدون هیچ فیلتر: همه‌ی فروشگاه‌های فعال
  let stores;
  if (hasProductFilter) {
    const storeIds = [
      ...new Set(products.map((p) => String(p.store_id)).filter((id) => ObjectId.isValid(id))),
    ];
    stores = await findStores({ _id: { $in: storeIds.map((id) => new ObjectId(id)) } });
  } else {
    stores = await findStores({ status: 'ENABLE' });
  }
  let enabledStores = stores.filter((s) => s.status === 'ENABLE');
  if (enabledStores.length === 0) return empty();

  // ─── اطلاعات عمومی فروشنده (اعتماد/فعال‌بودن) ───
  const owners = await findUsersByIds(
    enabledStores.map((s) => s.user),
    {
      _id: 1,
      firstname: 1,
      lastname: 1,
      username: 1,
      seller_trust: 1,
      seller_active_status: 1,
      seller_approved_status: 1,
      create_at: 1,
    },
  );
  const ownerMap = new Map(owners.map((u) => [String(u._id), u]));

  enabledStores = enabledStores.filter((s) => {
    const owner = ownerMap.get(String(s.user));
    return !(owner && String(owner.seller_active_status || '').toLowerCase() === 'inactive');
  });
  if (enabledStores.length === 0) return empty();

  if (toBool(verified))
    enabledStores = enabledStores.filter(
      (s) => ownerMap.get(String(s.user))?.seller_trust === true,
    );

  // ─── گروه‌بندی کالاها به تفکیک فروشگاه ───
  const productsByStore = new Map();
  for (const p of products) {
    const sid = String(p.store_id);
    if (!productsByStore.has(sid)) productsByStore.set(sid, []);
    productsByStore.get(sid).push(p);
  }

  let result = enabledStores.map((s) => {
    const list = productsByStore.get(String(s._id)) || [];
    const prices = list.map(effectivePrice).filter((x) => x !== null);
    const owner = ownerMap.get(String(s.user));
    return {
      ...s,
      seller: owner
        ? {
            _id: owner._id,
            firstname: fieldDocument(owner).firstname ?? null,
            lastname: fieldDocument(owner).lastname ?? null,
            seller_trust: owner.seller_trust === true,
            seller_active_status: owner.seller_active_status ?? null,
            seller_approved_status: owner.seller_approved_status ?? null,
            member_since: owner.create_at ?? null,
          }
        : null,
      matched_count: list.length,
      min_price: prices.length ? Math.min(...prices) : null,
      max_price: prices.length ? Math.max(...prices) : null,
      in_stock_count: list.filter((p) => p.stock_status === 'IN_STOCK').length,
      has_discount: list.some((p) => (p.discount?.percentage || 0) > 0),
      matched_products: list
        .slice()
        .sort((a, b) => (effectivePrice(a) ?? Infinity) - (effectivePrice(b) ?? Infinity))
        .slice(0, perStore),
    };
  });

  const minProducts = Number(min_products) || 0;
  if (minProducts > 1) result = result.filter((s) => s.matched_count >= minProducts);

  // ─── facet ها برای ساخت فیلتر در UI (قبل از صفحه‌بندی) ───
  const allPrices = result.flatMap((s) => [s.min_price, s.max_price]).filter((x) => x !== null);
  const brandCount = new Map();
  for (const s of result)
    for (const p of productsByStore.get(String(s._id)) || [])
      if (p.brand) brandCount.set(p.brand, (brandCount.get(p.brand) || 0) + 1);
  const facets = {
    brands: [...brandCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count })),
    price: {
      min: allPrices.length ? Math.min(...allPrices) : null,
      max: allPrices.length ? Math.max(...allPrices) : null,
    },
  };

  // ─── مرتب‌سازی ───
  const ts = (s) => new Date(s.create_at || 0).getTime();
  const trustOf = (s) => (s.seller?.seller_trust ? 1 : 0);
  const sorters = {
    relevance: (a, b) => trustOf(b) - trustOf(a) || b.matched_count - a.matched_count,
    products: (a, b) => b.matched_count - a.matched_count,
    newest: (a, b) => ts(b) - ts(a),
    oldest: (a, b) => ts(a) - ts(b),
    name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fa'),
    price_asc: (a, b) => (a.min_price ?? Infinity) - (b.min_price ?? Infinity),
    price_desc: (a, b) => (b.max_price ?? -Infinity) - (a.max_price ?? -Infinity),
    trust: (a, b) => trustOf(b) - trustOf(a) || b.matched_count - a.matched_count,
  };
  result.sort(sorters[sortKey]);

  const total = result.length;
  const totalPages = Math.ceil(total / limitNum);
  const start = (pageNum - 1) * limitNum;

  return {
    data: result.slice(start, start + limitNum),
    total,
    totalPages,
    page: pageNum,
    limit: limitNum,
    search_query: queryText,
    matched_products_count: products.length,
    facets,
  };
};

// ─────────────────────────────────────────────
// updateProductService
// ─────────────────────────────────────────────
export const updateProductService = async (id, data, requester) => {
  data = deriveContent(data, 'product');
  if (!id || typeof id !== 'string' || id.length !== 24 || !ObjectId.isValid(id))
    throw new Error('Invalid product id', { cause: { code: 400 } });

  if (!data) throw new Error('body is required', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });
  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  const isAdmin = requester.role === 'admin';
  const isOwner = product.seller_id?.toString() === requester._id.toString();

  if (!isAdmin && !isOwner) throw new Error('No Access', { cause: { code: 403 } });
  if (data && Object.hasOwn(data, 'price'))
    data = { ...data, price: await normalizeCatalogPrice(data.price) };

  const valid_stock_status = process.env.STOCK_STATUS
    ? process.env.STOCK_STATUS.split(',')
    : ['IN_STOCK', 'OUT_OF_STOCK'];
  const valid_status = process.env.PRODUCT_STATUS
    ? process.env.PRODUCT_STATUS.split(',').map((s) => s.toLowerCase())
    : ['active', 'inactive'];
  const valid_visibility = process.env.VISIBILITY
    ? process.env.VISIBILITY.split(',').map((s) => s.toLowerCase())
    : ['public', 'private'];
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

  // ─── ⭐ category_ids (update) ───
  let newCategoryIds = null;

  if (data.category_ids !== undefined || data.category_id !== undefined) {
    let inputCategoryIds = [];

    if (Array.isArray(data.category_ids) && data.category_ids.length > 0) {
      inputCategoryIds = data.category_ids;
    } else if (data.category_id) {
      inputCategoryIds = [data.category_id];
    } else {
      throw new Error('category_ids must be a non-empty array', { cause: { code: 400 } });
    }

    if (inputCategoryIds.length > MAX_CATEGORIES_PER_PRODUCT)
      throw new Error(`category_ids cannot exceed ${MAX_CATEGORIES_PER_PRODUCT} items`, {
        cause: { code: 400 },
      });

    const seenCategoryIds = new Set();
    const validCategoryIds = [];

    for (const cid of inputCategoryIds) {
      if (!cid || typeof cid !== 'string' || cid.length !== 24 || !ObjectId.isValid(cid))
        throw new Error('Invalid category id', { cause: { code: 400 } });

      if (seenCategoryIds.has(cid))
        throw new Error(`Duplicate category id: ${cid}`, { cause: { code: 400 } });
      seenCategoryIds.add(cid);

      const category = await findOneCategory({ _id: cid });
      if (!category) throw new Error(`Category not found: ${cid}`, { cause: { code: 404 } });
      if (category.status !== 'ACTIVE')
        throw new Error(`Category is not active: ${category.name}`, { cause: { code: 400 } });

      validCategoryIds.push(category._id);
    }

    newCategoryIds = validCategoryIds;
  }

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

    if (data.price.currency !== undefined && data.price.currency !== 'USD')
      throw new Error('Catalog price must be USD', { cause: { code: 400 } });

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

  if (data.stock === 0 && data.stock_status === undefined) data.stock_status = 'OUT_OF_STOCK';

  if (data.stock > 0 && data.stock_status === undefined && product.stock_status === 'OUT_OF_STOCK')
    data.stock_status = 'IN_STOCK';

  if (
    data.status !== undefined &&
    (typeof data.status !== 'string' || !valid_status.includes(data.status.toLowerCase()))
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
      if (typeof data.dimensions.width !== 'object' || Array.isArray(data.dimensions.width))
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
      if (typeof data.dimensions.height !== 'object' || Array.isArray(data.dimensions.height))
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

  if (data.store_id !== undefined && String(data.store_id) !== String(product.store_id)) {
    throw new Error('Product store cannot be changed', { cause: { code: 400 } });
  }
  const updatedProduct = {
    ...translationPatch(data.translations, 'product'),
    name: data.name !== undefined ? data.name.trim() : product.name,

    // ⭐ category_ids + category_id (primary)
    category_ids: newCategoryIds !== null ? newCategoryIds : product.category_ids,
    category_id: newCategoryIds !== null ? newCategoryIds[0] : product.category_id,

    short_description:
      data.short_description !== undefined
        ? data.short_description.trim()
        : product.short_description,
    description: data.description !== undefined ? data.description : product.description,
    production: data.production !== undefined ? data.production : product.production,
    images_id: data.images_id !== undefined ? data.images_id : product.images_id,
    price: {
      currency: data.price?.currency ? data.price.currency.toUpperCase() : product.price.currency,
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
      data.stock_status !== undefined ? data.stock_status.toUpperCase() : product.stock_status,
    status: data.status !== undefined ? data.status.toLowerCase() : product.status,
    visibility: data.visibility !== undefined ? data.visibility.toLowerCase() : product.visibility,
    warranty: data.warranty !== undefined ? data.warranty : product.warranty,
    brand: data.brand !== undefined ? data.brand.trim() : product.brand,
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
      value: data.weight?.value !== undefined ? data.weight.value : (product.weight?.value ?? null),
      unit:
        data.weight?.unit !== undefined
          ? data.weight.unit.toUpperCase()
          : (product.weight?.unit ?? null),
    },
  };

  return await updateOneProduct({ _id: id }, { ...updatedProduct, update_at: new Date() });
};

// ─────────────────────────────────────────────
// deleteProductService
// ─────────────────────────────────────────────
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

export const getProductStatsService = async (requester) => {
  const actor = await statsActor(requester, false);
  const result = await productStats(actor.role === 'admin' ? {} : { seller_id: actor._id });
  return { ...result, scope: actor.role === 'admin' ? 'all' : 'own' };
};

export const duplicateProductService = async (id, requester) => {
  const actor = await statsActor(requester);
  if (!ObjectId.isValid(id)) throw new Error('Invalid product id', { cause: { code: 400 } });
  const source = await findOneProduct({ _id: id });
  if (!source) throw new Error('Product not found', { cause: { code: 404 } });
  if (actor.role !== 'admin' && String(source.seller_id) !== String(actor._id))
    throw new Error('No Access', { cause: { code: 403 } });

  /*
   * باگ تکثیر محصول: fieldDocument بدون collection و بدون preserveBase نام/توضیحات
   * پایه را زمانی که ترجمه‌ها کلید en نداشتند حذف می‌کرد (محتوای پایه گم می‌شد).
   * با collection='products' و preserveBase=true متن پایه به‌عنوان مقدار en حفظ می‌شود.
   */
  const content = fieldDocument(source, 'products', 'en', true);
  const data = {};
  for (const field of [
    'name',
    'brand',
    'short_description',
    'description',
    'tags',
    'production',
    'price',
    'warranty',
    'dimensions',
    'weight',
  ])
    if (content[field] !== undefined) data[field] = structuredClone(content[field]);

  /* ابعاد/وزن ناقص در داده‌های قدیمی نباید کل تکثیر را بشکنند */
  if (!Number.isFinite(data.dimensions?.width?.value) || !Number.isFinite(data.dimensions?.height?.value))
    data.dimensions = { width: { value: 10, unit: 'CM' }, height: { value: 10, unit: 'CM' } };
  if (!Number.isFinite(data.weight?.value)) data.weight = { value: 200, unit: 'G' };

  /* تخفیفِ هنوز معتبر هم همراه نسخه‌ی کپی می‌آید (تخفیف منقضی نادیده گرفته می‌شود) */
  const sourceDiscount = source.discount;
  if (
    sourceDiscount &&
    Number.isFinite(Number(sourceDiscount.percentage)) &&
    sourceDiscount.expirationDate &&
    new Date(sourceDiscount.expirationDate) > new Date()
  )
    data.discount = {
      percentage: Number(sourceDiscount.percentage),
      expirationDate: new Date(sourceDiscount.expirationDate).toISOString(),
    };

  data.store_id = String(source.store_id);
  data.category_ids = (source.category_ids || [source.category_id]).filter(Boolean).map(String);
  data.images_id = (source.images_id || [])
    .filter(Boolean)
    .map(String);
  data.stock = 0;
  data.visibility = 'private';
  // Go through the same validation, access and subscription checks as a new product.
  return await createProductService(data, actor, { duplicate: true });
};
