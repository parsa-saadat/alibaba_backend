import {
  createProductService,
  deleteProductService,
  getProductPermService,
  getProductService,
  getProductsPermService,
  getProductsService,
  updateProductService,
} from './product.service.js';

export const createProductController = async (req, res) => {
  try {
    const data = req.body;
    const user = req.user
    const product = await createProductService(data, user);

    res.status(200).json({
      body: product,
      status: 200,
      message: 'Product created successfully',
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

export const getProductsController = async (req, res) => {
  try {
    const products = await getProductsService(req.query);
    res.status(200).json({
      body: products, status: 200,
      message: 'Products fetched successfully', success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null, status: e.cause?.code || 500,
      message: e.message, success: false,
    });
  }
};

export const getProductsPermController = async (req, res) => {
  try {
    const products = await getProductsPermService(
      req.params.sellerId,
      req.user,
      req.query,
    );
    res.status(200).json({
      body: products, status: 200,
      message: 'Products fetched successfully', success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null, status: e.cause?.code || 500,
      message: e.message, success: false,
    });
  }
};

export const getProductController = async (req, res) => {
  try {
    const product = await getProductService(req.params.id);
    res.status(200).json({
      body: product, status: 200,
      message: 'Product fetched successfully', success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null, status: e.cause?.code || 500,
      message: e.message, success: false,
    });
  }
};

export const getProductPermController = async (req, res) => {
  try {
    const product = await getProductPermService(req.params.productId, req.user);
    res.status(200).json({
      body: product, status: 200,
      message: 'Product fetched successfully', success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null, status: e.cause?.code || 500,
      message: e.message, success: false,
    });
  }
};

export const updateProductController = async (req, res) => {
  try {
    const product = await updateProductService(req.params.id, req.body, req.user);

    res.status(200).json({
      body: product,
      status: 200,
      message: 'Product updated successfully',
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

export const deleteProductController = async (req, res) => {
  try {
    const product = await deleteProductService(req.params.id, req.user);

    res.status(200).json({
      body: product,
      status: 200,
      message: 'Product deleted successfully',
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
