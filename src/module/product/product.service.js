import {
  deleteOneProduct,
  findOneProduct,
  findProducts,
  insertProduct,
  updateOneProduct,
} from '../../model/controller/product.controller.js';

import { findOneFile } from '../../model/controller/storage.controller.js';
import { MarkdownValidator } from '../../utils/validators/markdown.validator.js';

// import { deleteCarts, updateOneCart } from '../../model/controller/carts.controller.js';

export const createProductService = async (data) => {
  const requiredFields = [
    'name',
    'category_id',
    'short_description',
    'description',
    'production',
    'images_id',
    'price',
    'stock',
    'stock_status',
    'status',
    'visibility',
    'warranty',
    'brand',
    'dimensions',
    'weight',
  ];

  // Get validation config
  let valid_currencies = ['IRR', 'USD'];
  let valid_stock_status = ['IN STOCK', 'OUT OF STOCK', 'COMING SOON'];
  let valid_status = ['ACTIVE', 'INACTIVE'];
  let valid_visibility = ['PUBLIC', 'PRIVATE'];
  let valid_dimension_units = ['CM', 'M'];
  let valid_weight_units = ['KG', 'G'];

  // Validate required fields
  const isValidProduct = requiredFields.every((field) =>
    Object.prototype.hasOwnProperty.call(data, field),
  );

  if (!isValidProduct) throw new Error('Required fields missing', { cause: { code: 400 } });

  // name
  if (!data.name || typeof data.name !== 'string' || !data.name.trim())
    throw new Error('Name is required', { cause: { code: 400 } });

  // category_id
  if (!Number.isInteger(data.category_id) || data.category_id <= 0)
    throw new Error('category_id must be a positive integer', { cause: { code: 400 } });

  // short_description
  if (!data.short_description || typeof data.short_description !== 'string')
    throw new Error('short_description is required', { cause: { code: 400 } });

  // description
  if (!data.description || typeof data.description !== 'string')
    throw new Error('Description is required', { cause: { code: 400 } });

  if (!MarkdownValidator(data.description))
    throw new Error('Invalid markdown', { cause: { code: 400 } });

  // production
  if (
    !Number.isInteger(data.production) ||
    data.production < 1900 ||
    data.production > new Date().getFullYear()
  )
    throw new Error('Production year must be less than or equal to current year', {
      cause: { code: 400 },
    });

  // images_id
  if (!Array.isArray(data.images_id))
    throw new Error('images_id must be an array', { cause: { code: 400 } });

  for (const imageId of data.images_id) {
    if (!imageId || typeof imageId !== 'string')
      throw new Error('Each image id must be a non-empty string', { cause: { code: 400 } });

    const image = await findOneFile({ _id: imageId });
    if (!image) throw new Error('Image not found', { cause: { code: 404 } });
  }

  // price
  if (!data.price || typeof data.price !== 'object')
    throw new Error('Price is required', { cause: { code: 400 } });

  if (!data.price.currency || !valid_currencies.includes(data.price.currency.toUpperCase()))
    throw new Error(`Currency must be ${valid_currencies}`, { cause: { code: 400 } });

  if (!Number.isFinite(data.price.amount) || data.price.amount <= 0)
    throw new Error('Price amount must be greater than 0', { cause: { code: 400 } });

  // discount
  if (data.discount !== null && data.discount !== undefined) {
    if (!data.discount.percentage || !data.discount.expirationDate)
      throw new Error('Discount percentage and expiration date is required', {
        cause: { code: 400 },
      });

    if (data.discount.percentage > 100 || data.discount.percentage < 0)
      throw new Error('Discount percentage must be upper 0 and lowwer 100', {
        cause: { code: 400 },
      });

    if (data.discount.expirationDate < new Date())
      throw new Error('Discount expiration date must be in the future', {
        cause: { code: 400 },
      });
  }

  // stock
  if (!Number.isInteger(data.stock) || data.stock < 0)
    throw new Error('Stock must be greater than -1', { cause: { code: 400 } });

  // stock_status
  if (!data.stock_status || !valid_stock_status.includes(data.stock_status.toUpperCase()))
    throw new Error(`Stock status must be ${valid_stock_status}`, { cause: { code: 400 } });

  if (data.stock_status.toUpperCase() === 'OUT OF STOCK' && data.stock > 0)
    throw new Error('Stock must be 0 when stock status is out of stock', {
      cause: { code: 400 },
    });

  if (data.stock_status.toUpperCase() === 'IN STOCK' && data.stock === 0)
    throw new Error('Stock must be upper 0 when stock status is in stock', {
      cause: { code: 400 },
    });

  if (data.stock_status.toUpperCase() === 'COMING SOON' && data.stock > 0)
    throw new Error('Stock must be 0 when stock status is coming soon', {
      cause: { code: 400 },
    });

  // status
  if (!data.status || !valid_status.includes(data.status.toUpperCase()))
    throw new Error(`Status must be ${valid_status}`, { cause: { code: 400 } });

  // visibility
  if (!data.visibility || !valid_visibility.includes(data.visibility.toUpperCase()))
    throw new Error(`Visibility must be ${valid_visibility}`, { cause: { code: 400 } });

  // warranty
  if (typeof data.warranty !== 'boolean')
    throw new Error('Warranty must be boolean', { cause: { code: 400 } });

  // brand (lowercase)
  if (!data.brand || typeof data.brand !== 'string' || !data.brand.trim())
    throw new Error('Brand is required', { cause: { code: 400 } });

  // tags
  if (!Array.isArray(data.tags))
    throw new Error('Tags must be an array', { cause: { code: 400 } });

  // dimensions
  if (!data.dimensions || typeof data.dimensions !== 'object')
    throw new Error('Dimensions is required', { cause: { code: 400 } });

  if (!data.dimensions.width || typeof data.dimensions.width !== 'object')
    throw new Error('Dimensions width is required', { cause: { code: 400 } });

  if (!data.dimensions.height || typeof data.dimensions.height !== 'object')
    throw new Error('Dimensions height is required', { cause: { code: 400 } });

  if (!Number.isFinite(data.dimensions.width.value) || data.dimensions.width.value <= 0)
    throw new Error('Dimensions width value must be greater than 0', {
      cause: { code: 400 },
    });

  if (!valid_dimension_units.includes(data.dimensions.width.unit?.toUpperCase()))
    throw new Error(`Dimensions width unit must be ${valid_dimension_units}`, {
      cause: { code: 400 },
    });

  if (!Number.isFinite(data.dimensions.height.value) || data.dimensions.height.value <= 0)
    throw new Error('Dimensions height value must be greater than 0', {
      cause: { code: 400 },
    });

  if (!valid_dimension_units.includes(data.dimensions.height.unit?.toUpperCase()))
    throw new Error(`Dimensions height unit must be ${valid_dimension_units}`, {
      cause: { code: 400 },
    });

  // weight
  if (!data.weight || typeof data.weight !== 'object')
    throw new Error('Weight is required', { cause: { code: 400 } });

  if (!Number.isFinite(data.weight.value) || data.weight.value <= 0)
    throw new Error('Weight value must be greater than 0', { cause: { code: 400 } });

  if (!data.weight.unit || !valid_weight_units.includes(data.weight.unit.toUpperCase()))
    throw new Error(`Weight unit must be ${valid_weight_units}`, { cause: { code: 400 } });

  // seo (optional)
  if (data.seo !== undefined && data.seo !== null) {
    if (typeof data.seo !== 'object')
      throw new Error('SEO must be an object', { cause: { code: 400 } });

    if (data.seo.title !== undefined && typeof data.seo.title !== 'string')
      throw new Error('SEO title must be a string', { cause: { code: 400 } });

    if (data.seo.description !== undefined && typeof data.seo.description !== 'string')
      throw new Error('SEO description must be a string', { cause: { code: 400 } });

    if (data.seo.keywords !== undefined && !Array.isArray(data.seo.keywords))
      throw new Error('SEO keywords must be an array', { cause: { code: 400 } });
  }

  const newProduct = {
    name: data.name.trim(),
    category_id: data.category_id,
    short_description: data.short_description.trim(),
    description: data.description,
    production: data.production,
    images_id: data.images_id,
    price: {
      currency: data.price.currency.toUpperCase(),
      amount: data.price.amount,
    },
    discount: {
      percentage: data.discount?.percentage,
      expirationDate: data.discount?.expirationDate,
    },
    stock: data.stock,
    stock_status: data.stock_status.toUpperCase(),
    status: data.status.toLowerCase(),
    visibility: data.visibility.toLowerCase(),
    warranty: data.warranty,
    brand: data.brand.toLowerCase().trim(),
    tags: data.tags,
    dimensions: {
      width: {
        value: data.dimensions.width.value,
        unit: data.dimensions.width.unit,
      },
      height: {
        value: data.dimensions.height.value,
        unit: data.dimensions.height.unit,
      },
    },
    weight: {
      value: data.weight.value,
      unit: data.weight.unit,
    },
    seo: {
      title: data?.seo?.title ?? null,
      description: data?.seo?.description ?? null,
      keywords: data?.seo?.keywords ?? null,
    },
  };

  return await insertProduct(newProduct);
};

export const getProductsService = async (filter) => {
  let {
    page = 1,
    limit = 10,
    brand = undefined,
    name = undefined,
    min_production = undefined,
    max_production = undefined,
    category_id = undefined,
    stock_status = undefined,
    status = undefined,
    visibility = undefined,
    warranty = undefined,
    tags = undefined,
    currency = undefined,
    discount = undefined,
    min_price = undefined,
    max_price = undefined,
    desc = undefined,
  } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  let products;
  if (desc) products = await findProducts({}, true);
  else products = await findProducts();

  if (brand)
    products = products.filter((product) =>
      product.brand.toLowerCase().includes(brand.toLowerCase()),
    );

  if (name)
    products = products.filter((product) =>
      product.name.toLowerCase().includes(name.toLowerCase()),
    );

  if (category_id) {
    const catId = Number(category_id);
    products = products.filter((product) => product.category_id === catId);
  }

  if (stock_status)
    products = products.filter((product) =>
      product.stock_status.toLowerCase().includes(stock_status.toLowerCase()),
    );

  if (status)
    products = products.filter(
      (product) => product.status.toLowerCase() === status.toLowerCase(),
    );

  if (visibility)
    products = products.filter(
      (product) => product.visibility.toLowerCase() === visibility.toLowerCase(),
    );

  if (warranty !== undefined) {
    const isWarranty = warranty === 'true' || warranty === true;
    products = products.filter((product) => product.warranty === isWarranty);
  }

  if (tags) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    products = products.filter((product) =>
      tagList.some((tag) =>
        product.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase())),
      ),
    );
  }

  if (currency)
    products = products.filter(
      (product) => product.price.currency.toLowerCase() === currency.toLowerCase(),
    );

  if (discount)
    products = products.filter((product) => product.discount?.percentage > 0);

  if (min_production)
    products = products.filter((product) => product.production >= min_production);

  if (max_production)
    products = products.filter((product) => product.production <= max_production);

  if (min_price)
    products = products.filter((product) => product.price.amount >= min_price);

  if (max_price)
    products = products.filter((product) => product.price.amount <= max_price);

  const start = (page - 1) * limit;
  const total = products.length;

  const totalPages = Math.ceil(total / limit);
  products = products.slice(start, start + limit);

  return {
    data: products,
    total,
    totalPages,
  };
};

export const getProductService = async (id) => {
  if (!id) throw new Error('Product id is required', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });

  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  return product;
};

export const updateProductService = async (id, data) => {
  if (!id) throw new Error('Product id is required', { cause: { code: 400 } });

  if (!data) throw new Error('body is required', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });

  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  let valid_currencies = ['IRR', 'USD'];
  let valid_stock_status = ['IN STOCK', 'OUT OF STOCK', 'COMING SOON'];
  let valid_status = ['ACTIVE', 'INACTIVE'];
  let valid_visibility = ['PUBLIC', 'PRIVATE'];
  let valid_dimension_units = ['CM', 'M'];
  let valid_weight_units = ['KG', 'G'];

  // name
  if (data?.name !== undefined && (typeof data.name !== 'string' || !data.name.trim()))
    throw new Error('Name must be a non-empty string', { cause: { code: 400 } });

  // category_id
  if (
    data?.category_id !== undefined &&
    (!Number.isInteger(data.category_id) || data.category_id <= 0)
  )
    throw new Error('category_id must be a positive integer', { cause: { code: 400 } });

  // short_description
  if (data?.short_description !== undefined && typeof data.short_description !== 'string')
    throw new Error('short_description must be a string', { cause: { code: 400 } });

  // description
  if (data?.description !== undefined) {
    if (typeof data.description !== 'string')
      throw new Error('Description must be a string', { cause: { code: 400 } });

    if (!MarkdownValidator(data.description))
      throw new Error('Invalid markdown', { cause: { code: 400 } });
  }

  // production
  if (
    data?.production !== undefined &&
    (!Number.isInteger(data.production) ||
      data.production < 1900 ||
      data.production > new Date().getFullYear())
  )
    throw new Error('Production year must be less than or equal to current year', {
      cause: { code: 400 },
    });

  // images_id
  if (data?.images_id !== undefined) {
    if (!Array.isArray(data.images_id))
      throw new Error('images_id must be an array', { cause: { code: 400 } });

    for (const imageId of data.images_id) {
      if (!imageId || typeof imageId !== 'string')
        throw new Error('Each image id must be a non-empty string', {
          cause: { code: 400 },
        });

      const image = await findOneFile({ _id: imageId });
      if (!image) throw new Error('Image not found', { cause: { code: 404 } });
    }
  }

  // price
  if (data?.price !== undefined) {
    if (typeof data.price !== 'object' || data.price === null)
      throw new Error('Price must be an object', { cause: { code: 400 } });

    if (
      data.price.currency !== undefined &&
      !valid_currencies.includes(data.price.currency.toUpperCase())
    )
      throw new Error(`Currency must be ${valid_currencies}`, { cause: { code: 400 } });

    if (
      data.price.amount !== undefined &&
      (!Number.isFinite(data.price.amount) || data.price.amount <= 0)
    )
      throw new Error('Price amount must be greater than 0', { cause: { code: 400 } });
  }

  // discount
  if (data?.discount !== undefined && data.discount !== null) {
    if (!data.discount.percentage || !data.discount.expirationDate)
      throw new Error('Discount percentage and expiration date is required', {
        cause: { code: 400 },
      });

    if (data.discount.percentage > 100 || data.discount.percentage < 0)
      throw new Error('Discount percentage must be upper 0 and lowwer 100', {
        cause: { code: 400 },
      });

    if (data.discount.expirationDate < new Date())
      throw new Error('Discount expiration date must be in the future', {
        cause: { code: 400 },
      });
  }

  // stock
  if (data?.stock !== undefined && (!Number.isInteger(data.stock) || data.stock < 0))
    throw new Error('Stock must be greater than -1', { cause: { code: 400 } });

  // stock_status
  if (
    data?.stock_status !== undefined &&
    !valid_stock_status.includes(data.stock_status.toUpperCase())
  )
    throw new Error(`Stock status must be ${valid_stock_status}`, { cause: { code: 400 } });

  // Handle stock / stock_status interactions
  const nextStock = data.stock !== undefined ? data.stock : product.stock;
  const nextStockStatus =
    data.stock_status !== undefined ? data.stock_status.toUpperCase() : product.stock_status;

  if (nextStockStatus === 'OUT OF STOCK' && nextStock > 0) {
    if (data.stock !== undefined)
      throw new Error('Stock must be 0 when stock status is out of stock', {
        cause: { code: 400 },
      });
    data.stock = 0;
  }

  if (nextStockStatus === 'IN STOCK' && nextStock === 0)
    throw new Error('Stock must be upper 0 when stock status is in stock', {
      cause: { code: 400 },
    });

  if (nextStockStatus === 'COMING SOON' && nextStock > 0) {
    if (data.stock !== undefined)
      throw new Error('Stock must be 0 when stock status is coming soon', {
        cause: { code: 400 },
      });
    data.stock = 0;
  }

  // Auto-sync: stock to 0 => OUT OF STOCK
  if (data.stock === 0 && data.stock_status === undefined) data.stock_status = 'OUT OF STOCK';

  // Auto-sync: stock > 0 while previously out => IN STOCK
  if (
    data.stock > 0 &&
    data.stock_status === undefined &&
    product.stock_status === 'OUT OF STOCK'
  )
    data.stock_status = 'IN STOCK';

  // status
  if (data?.status !== undefined && !valid_status.includes(data.status.toUpperCase()))
    throw new Error(`Status must be ${valid_status}`, { cause: { code: 400 } });

  // visibility
  if (
    data?.visibility !== undefined &&
    !valid_visibility.includes(data.visibility.toUpperCase())
  )
    throw new Error(`Visibility must be ${valid_visibility}`, { cause: { code: 400 } });

  // warranty
  if (data?.warranty !== undefined && typeof data.warranty !== 'boolean')
    throw new Error('Warranty must be boolean', { cause: { code: 400 } });

  // brand
  if (data?.brand !== undefined && (typeof data.brand !== 'string' || !data.brand.trim()))
    throw new Error('Brand must be a non-empty string', { cause: { code: 400 } });

  // tags
  if (data?.tags !== undefined && !Array.isArray(data.tags))
    throw new Error('Tags must be an array', { cause: { code: 400 } });

  // dimensions
  if (data?.dimensions !== undefined) {
    if (typeof data.dimensions !== 'object' || data.dimensions === null)
      throw new Error('Dimensions must be an object', { cause: { code: 400 } });

    if (data.dimensions.width !== undefined) {
      if (
        !Number.isFinite(data.dimensions.width.value) ||
        data.dimensions.width.value <= 0
      )
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
        !Number.isFinite(data.dimensions.height.value) ||
        data.dimensions.height.value <= 0
      )
        throw new Error('Dimensions height value must be greater than 0', {
          cause: { code: 400 },
        });

      if (!valid_dimension_units.includes(data.dimensions.height.unit?.toUpperCase()))
        throw new Error(`Dimensions height unit must be ${valid_dimension_units}`, {
          cause: { code: 400 },
        });
    }
  }

  // weight
  if (data?.weight !== undefined) {
    if (typeof data.weight !== 'object' || data.weight === null)
      throw new Error('Weight must be an object', { cause: { code: 400 } });

    if (!Number.isFinite(data.weight.value) || data.weight.value <= 0)
      throw new Error('Weight value must be greater than 0', { cause: { code: 400 } });

    if (!valid_weight_units.includes(data.weight.unit?.toUpperCase()))
      throw new Error(`Weight unit must be ${valid_weight_units}`, { cause: { code: 400 } });
  }

  // seo
  if (data?.seo !== undefined) {
    if (typeof data.seo !== 'object' || data.seo === null)
      throw new Error('SEO must be an object', { cause: { code: 400 } });

    if (data.seo.title !== undefined && typeof data.seo.title !== 'string')
      throw new Error('SEO title must be a string', { cause: { code: 400 } });

    if (data.seo.description !== undefined && typeof data.seo.description !== 'string')
      throw new Error('SEO description must be a string', { cause: { code: 400 } });

    if (data.seo.keywords !== undefined && !Array.isArray(data.seo.keywords))
      throw new Error('SEO keywords must be an array', { cause: { code: 400 } });
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
      amount:
        data.price?.amount !== undefined ? data.price.amount : product.price.amount,
    },
    discount:
      data.discount !== undefined
        ? data.discount === null
          ? { percentage: null, expirationDate: null }
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
            ? data.dimensions.width.unit
            : product.dimensions.width.unit,
      },
      height: {
        value:
          data.dimensions?.height?.value !== undefined
            ? data.dimensions.height.value
            : product.dimensions.height.value,
        unit:
          data.dimensions?.height?.unit !== undefined
            ? data.dimensions.height.unit
            : product.dimensions.height.unit,
      },
    },
    weight: {
      value:
        data.weight?.value !== undefined ? data.weight.value : product.weight?.value ?? null,
      unit:
        data.weight?.unit !== undefined ? data.weight.unit : product.weight?.unit ?? null,
    },
    seo: {
      title: data?.seo?.title ?? product?.seo?.title ?? null,
      description: data?.seo?.description ?? product?.seo?.description ?? null,
      keywords: data?.seo?.keywords ?? product?.seo?.keywords ?? null,
    },
  };

  // Update cart items if stock decreased
  if (product.stock > updatedProduct.stock) {
    if (updatedProduct.stock === 0) {
      await deleteCarts({ product_id: id });
    } else {
      await updateOneCart(
        { product_id: id, quantity: { $gt: updatedProduct.stock } },
        { $set: { quantity: updatedProduct.stock, update_at: new Date() } },
      );
    }
  }

  return await updateOneProduct({ _id: id }, { ...updatedProduct });
};

export const deleteProductService = async (id) => {
  if (!id) throw new Error('Product id is required', { cause: { code: 400 } });

  const product = await findOneProduct({ _id: id });

  if (!product) throw new Error('Product not found', { cause: { code: 404 } });

  await deleteOneProduct({ _id: id });

  // await deleteCarts({ product_id: id });

  return true;
};