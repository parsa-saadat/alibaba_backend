import {
  createProductService,
  deleteProductService,
  getProductService,
  getProductsService,
  updateProductService,
} from './product.service.js';

export const createProductController = async (req, res) => {
  try {
    const data = req.body;
    const product = await createProductService(data);

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
      body: products,
      status: 200,
      message: 'Products fetched successfully',
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

export const getProductController = async (req, res) => {
  try {
    const product = await getProductService(req.params.id);
    res.status(200).json({
      body: product,
      status: 200,
      message: 'Product fetched successfully',
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

export const updateProductController = async (req, res) => {
  try {
    const product = await updateProductService(req.params.id, req.body);

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
    const product = await deleteProductService(req.params.id);

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
