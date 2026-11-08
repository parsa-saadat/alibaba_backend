import { ObjectId } from 'mongodb';

import {
  findCategories,
  findOneCategory,
  insertCategory,
  updateOneCategory,
  deleteOneCategory,
} from '../../model/controller/category.controller.js';
import { findOneProduct } from '../../model/controller/product.controller.js';

// ─── Constants ───
const MAX_NAME_LENGTH = 100;
const MAX_SLUG_LENGTH = 100;
const MAX_ANCESTORS_DEPTH = 5;

const VALID_STATUSES = ['ACTIVE', 'INACTIVE'];
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─────────────────────────────────────────────
// createCategoryService
// ─────────────────────────────────────────────
export const createCategoryService = async (data, requester) => {
  if (!requester || requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Data is not valid', { cause: { code: 400 } });

  // ─── name ───
  if (typeof data.name !== 'string' || !data.name.trim())
    throw new Error('Name is required', { cause: { code: 400 } });
  if (data.name.length > MAX_NAME_LENGTH)
    throw new Error('Name is too long', { cause: { code: 400 } });

  // ─── slug ───
  if (typeof data.slug !== 'string' || !SLUG_REGEX.test(data.slug))
    throw new Error('Slug is invalid', { cause: { code: 400 } });
  if (data.slug.length > MAX_SLUG_LENGTH)
    throw new Error('Slug is too long', { cause: { code: 400 } });

  // ─── status ───
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status))
    throw new Error('Status is not valid', { cause: { code: 400 } });

  // ─── sort_order ───
  if (data.sort_order !== undefined && (!Number.isInteger(data.sort_order) || data.sort_order < 0))
    throw new Error('Sort order is not valid', { cause: { code: 400 } });

  // ─── parent_id + tree fields ───
  let parentId = null;
  let ancestors = [];
  let level = 0;
  let path = data.slug;

  if (data.parent_id !== undefined && data.parent_id !== null) {
    if (typeof data.parent_id !== 'string' || !ObjectId.isValid(data.parent_id))
      throw new Error('Invalid parent id', { cause: { code: 400 } });

    const parent = await findOneCategory({ _id: data.parent_id });
    if (!parent) throw new Error('Parent category not found', { cause: { code: 404 } });

    parentId = new ObjectId(data.parent_id);
    ancestors = [...(parent.ancestors || []), parent._id];
    level = ancestors.length;
    path = parent.path ? `${parent.path}/${data.slug}` : data.slug;

    if (level > MAX_ANCESTORS_DEPTH)
      throw new Error(`Maximum depth is ${MAX_ANCESTORS_DEPTH}`, { cause: { code: 400 } });
  }

  // ─── slug یکتا در بین هم‌نیاها ───
  const siblingQuery = parentId
    ? { parent_id: parentId, slug: data.slug }
    : { parent_id: null, slug: data.slug };

  const siblingWithSlug = await findOneCategory(siblingQuery);
  if (siblingWithSlug)
    throw new Error('Slug already exists under this parent', { cause: { code: 400 } });

  // ─── path یکتا در کل سیستم ───
  const pathExists = await findOneCategory({ path });
  if (pathExists)
    throw new Error('Path already exists', { cause: { code: 400 } });

  const newCategory = {
    name: data.name.trim(),
    slug: data.slug,
    parent_id: parentId,
    ancestors,
    level,
    path,
    sort_order: data.sort_order ?? 0,
    status: data.status || 'ACTIVE',
    product_count: 0,
  };

  return await insertCategory(newCategory);
};

// ─────────────────────────────────────────────
// getCategoriesService — لیست دسته‌ها
// ─────────────────────────────────────────────
export const getCategoriesService = async (filter = {}, requester) => {
  let { page = 1, limit = 20, desc, parent_id, level, status, search } = filter;

  limit = Number(limit) || 20;
  page = Number(page) || 1;

  if (limit < 1 || limit > 100)
    throw new Error('Limit is not valid', { cause: { code: 400 } });
  if (page < 1)
    throw new Error('Page is not valid', { cause: { code: 400 } });

  const isAdmin = requester && requester.role === 'admin';

  const query = {};

  // ─── status ───
  if (status !== undefined) {
    if (!isAdmin) throw new Error('No Access', { cause: { code: 403 } });
    if (!VALID_STATUSES.includes(status))
      throw new Error('Status is not valid', { cause: { code: 400 } });
    query.status = status;
  } else if (!isAdmin) {
    query.status = 'ACTIVE';
  }

  // ─── parent_id ───
  if (parent_id !== undefined && parent_id !== null) {
    if (typeof parent_id !== 'string' || !ObjectId.isValid(parent_id))
      throw new Error('Invalid parent id', { cause: { code: 400 } });
    query.parent_id = new ObjectId(parent_id);
  }

  // ─── level ───
  if (level !== undefined) {
    if (!Number.isInteger(Number(level)) || Number(level) < 0)
      throw new Error('Level is not valid', { cause: { code: 400 } });
    query.level = Number(level);
  }

  // ─── search ───
  if (search !== undefined && search !== null) {
    if (typeof search !== 'string')
      throw new Error('Search must be string', { cause: { code: 400 } });
    if (search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }
  }

  let categories = await findCategories(query, desc === 'true' || desc === true);

  categories.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const total = categories.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  categories = categories.slice(start, start + limit);

  return { data: categories, total, totalPages };
};

// ─────────────────────────────────────────────
// getCategoryService — تک دسته
// ─────────────────────────────────────────────
export const getCategoryService = async (id, requester) => {
  if (!id || !ObjectId.isValid(id))
    throw new Error('Invalid category id', { cause: { code: 400 } });

  const category = await findOneCategory({ _id: id });
  if (!category) throw new Error('Category not found', { cause: { code: 404 } });

  const isAdmin = requester && requester.role === 'admin';

  if (!isAdmin && category.status !== 'ACTIVE')
    throw new Error('Category not found', { cause: { code: 404 } });

  return category;
};

// ─────────────────────────────────────────────
// updateCategoryService
// ─────────────────────────────────────────────
export const updateCategoryService = async (id, data, requester) => {
  if (!requester || requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  if (!id || !ObjectId.isValid(id))
    throw new Error('Invalid category id', { cause: { code: 400 } });

  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Data is not valid', { cause: { code: 400 } });

  const category = await findOneCategory({ _id: id });
  if (!category) throw new Error('Category not found', { cause: { code: 404 } });

  const update = {};

  // ─── name ───
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim())
      throw new Error('Name is required', { cause: { code: 400 } });
    if (data.name.length > MAX_NAME_LENGTH)
      throw new Error('Name is too long', { cause: { code: 400 } });
    update.name = data.name.trim();
  }

  // ─── slug ───
  if (data.slug !== undefined) {
    if (typeof data.slug !== 'string' || !SLUG_REGEX.test(data.slug))
      throw new Error('Slug is invalid', { cause: { code: 400 } });
    if (data.slug.length > MAX_SLUG_LENGTH)
      throw new Error('Slug is too long', { cause: { code: 400 } });
    update.slug = data.slug;
  }

  // ─── status ───
  if (data.status !== undefined) {
    if (!VALID_STATUSES.includes(data.status))
      throw new Error('Status is not valid', { cause: { code: 400 } });
    update.status = data.status;
  }

  // ─── sort_order ───
  if (data.sort_order !== undefined) {
    if (!Number.isInteger(data.sort_order) || data.sort_order < 0)
      throw new Error('Sort order is not valid', { cause: { code: 400 } });
    update.sort_order = data.sort_order;
  }

  // ─── parent_id + tree recalculation ───
  const parentChanged = data.parent_id !== undefined;
  let newParentId = category.parent_id;
  let newAncestors = category.ancestors || [];
  let newLevel = category.level || 0;
  let newPath = category.path;

  if (parentChanged) {
    if (data.parent_id === null) {
      newParentId = null;
      newAncestors = [];
      newLevel = 0;
      update.parent_id = null;
    } else {
      if (typeof data.parent_id !== 'string' || !ObjectId.isValid(data.parent_id))
        throw new Error('Invalid parent id', { cause: { code: 400 } });

      if (String(data.parent_id) === String(id))
        throw new Error('Category cannot be its own parent', { cause: { code: 400 } });

      const newParent = await findOneCategory({ _id: data.parent_id });
      if (!newParent) throw new Error('Parent category not found', { cause: { code: 404 } });

      const newParentAncestors = (newParent.ancestors || []).map(String);
      if (newParentAncestors.includes(String(id)))
        throw new Error('Cannot create cycle in category tree', { cause: { code: 400 } });

      newParentId = new ObjectId(data.parent_id);
      newAncestors = [...(newParent.ancestors || []), newParent._id];
      newLevel = newAncestors.length;

      if (newLevel > MAX_ANCESTORS_DEPTH)
        throw new Error(`Maximum depth is ${MAX_ANCESTORS_DEPTH}`, { cause: { code: 400 } });

      update.parent_id = newParentId;
    }
  }

  // ─── slug یا parent عوض شده → چک یکتایی هم‌نیا ───
  const slugChanged = update.slug !== undefined && update.slug !== category.slug;
  const needsUniquenessCheck = parentChanged || slugChanged;

  if (needsUniquenessCheck) {
    const finalSlug = update.slug !== undefined ? update.slug : category.slug;
    const finalParentId = newParentId;

    const siblingQuery = {
      _id: { $ne: new ObjectId(id) },
      slug: finalSlug,
    };

    if (finalParentId) siblingQuery.parent_id = finalParentId;
    else siblingQuery.parent_id = null;

    const sibling = await findOneCategory(siblingQuery);
    if (sibling)
      throw new Error('Slug already exists under this parent', { cause: { code: 400 } });
  }

  // ─── محاسبه‌ی path جدید ───
  const finalSlug = update.slug !== undefined ? update.slug : category.slug;

  if (parentChanged) {
    if (newParentId) {
      const parentPath = (await findOneCategory({ _id: newParentId }))?.path || '';
      newPath = parentPath ? `${parentPath}/${finalSlug}` : finalSlug;
    } else {
      newPath = finalSlug;
    }

    update.ancestors = newAncestors;
    update.level = newLevel;
    update.path = newPath;
  } else if (slugChanged) {
    const parentPath = category.path
      ? category.path.split('/').slice(0, -1).join('/')
      : '';
    newPath = parentPath ? `${parentPath}/${finalSlug}` : finalSlug;
    update.path = newPath;
  }

  // ─── path یکتایی ───
  if (parentChanged || slugChanged) {
    const pathDup = await findOneCategory({
      _id: { $ne: new ObjectId(id) },
      path: newPath,
    });
    if (pathDup)
      throw new Error('Path already exists', { cause: { code: 400 } });
  }

  if (Object.keys(update).length === 0)
    throw new Error('No fields to update', { cause: { code: 400 } });

  // ─── update descendants ───
  if (parentChanged || slugChanged) {
    const oldPath = category.path;

    const descendants = await findCategories({ ancestors: new ObjectId(id) });

    for (const desc of descendants) {
      const descAncestorsStr = (desc.ancestors || []).map(String);
      const idIdx = descAncestorsStr.findIndex((a) => a === String(id));
      if (idIdx === -1) continue;

      const afterSelf = desc.ancestors.slice(idIdx + 1);
      const newDescAncestors = [
        ...newAncestors,
        new ObjectId(id),
        ...afterSelf,
      ];

      let newDescPath = desc.path;
      if (oldPath && desc.path && desc.path.startsWith(`${oldPath}/`)) {
        newDescPath = `${newPath}${desc.path.substring(oldPath.length)}`;
      }

      await updateOneCategory(
        { _id: desc._id },
        {
          ancestors: newDescAncestors,
          level: newDescAncestors.length,
          path: newDescPath,
        },
      );
    }
  }

  return await updateOneCategory({ _id: id }, update);
};

// ─────────────────────────────────────────────
// deleteCategoryService
// ─────────────────────────────────────────────
export const deleteCategoryService = async (id, requester) => {
  if (!requester || requester.role !== 'admin')
    throw new Error('No Access', { cause: { code: 403 } });

  if (!id || !ObjectId.isValid(id))
    throw new Error('Invalid category id', { cause: { code: 400 } });

  const category = await findOneCategory({ _id: id });
  if (!category) throw new Error('Category not found', { cause: { code: 404 } });

  // ─── has children? ───
  const child = await findOneCategory({ parent_id: new ObjectId(id) });
  if (child) throw new Error('Cannot delete category with children', { cause: { code: 400 } });

  // ─── has products? ───
  const product = await findOneProduct({ category_id: new ObjectId(id) });
  if (product)
    throw new Error('Cannot delete category with products', { cause: { code: 400 } });

  await deleteOneCategory({ _id: id });

  return true;
};

// ─────────────────────────────────────────────
// getCategoryTreeService — درخت کامل
// ─────────────────────────────────────────────
export const getCategoryTreeService = async (filter = {}, requester) => {
  const { parent_id } = filter;

  const isAdmin = requester && requester.role === 'admin';

  const query = {};

  if (!isAdmin) query.status = 'ACTIVE';

  let allCategories = await findCategories(query);

  allCategories.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  // build tree
  const byId = new Map();
  for (const c of allCategories) {
    byId.set(String(c._id), { ...c, children: [] });
  }

  const roots = [];

  for (const c of allCategories) {
    const node = byId.get(String(c._id));

    if (c.parent_id) {
      const parent = byId.get(String(c.parent_id));
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }

  // if parent_id filter, return only that subtree
  if (parent_id !== undefined && parent_id !== null) {
    if (typeof parent_id !== 'string' || !ObjectId.isValid(parent_id))
      throw new Error('Invalid parent id', { cause: { code: 400 } });

    const startNode = byId.get(parent_id);
    if (!startNode) throw new Error('Category not found', { cause: { code: 404 } });

    return { data: startNode.children };
  }

  return { data: roots };
};