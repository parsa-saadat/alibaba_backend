import {
  createCategoryService,
  getCategoriesService,
  getCategoryService,
  updateCategoryService,
  deleteCategoryService,
  getCategoryTreeService,
} from './category.service.js';

export const createCategoryController = async (req, res) => {
  try {
    const category = await createCategoryService(req.body, req.user);
    res.status(200).json({
      body: category,
      status: 200,
      message: 'Category created successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const getCategoriesController = async (req, res) => {
  try {
    const categories = await getCategoriesService(req.query, req.user);
    res.status(200).json({
      body: categories,
      status: 200,
      message: 'Categories fetched successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const getCategoryController = async (req, res) => {
  try {
    const category = await getCategoryService(req.params.id, req.user);
    res.status(200).json({
      body: category,
      status: 200,
      message: 'Category fetched successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const updateCategoryController = async (req, res) => {
  try {
    const category = await updateCategoryService(req.params.id, req.body, req.user);
    res.status(200).json({
      body: category,
      status: 200,
      message: 'Category updated successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const deleteCategoryController = async (req, res) => {
  try {
    const result = await deleteCategoryService(req.params.id, req.user);
    res.status(200).json({
      body: result,
      status: 200,
      message: 'Category deleted successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const getCategoryTreeController = async (req, res) => {
  try {
    const tree = await getCategoryTreeService(req.query, req.user);
    res.status(200).json({
      body: tree,
      status: 200,
      message: 'Category tree fetched successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};