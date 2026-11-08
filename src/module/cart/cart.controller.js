import {
  createCartService,
  deleteCartService,
  getCartsService,
  getCartService,
  updateCartSsrvice,
} from './cart.service.js';

export const createCartController = async (req, res) => {
  try {
    const data = req.body;
    const requester = req.user;
    const user = req.params.userId;
    const cart = await createCartService(user, data, requester);

    res.status(201).json({
      body: cart,
      status: 201,
      message: 'Cart created successfully',
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

export const getCartsController = async (req, res) => {
  try {
    const carts = await getCartsService(req.params.userId, req.user, req.query);
    res.status(200).json({
      body: carts,
      status: 200,
      message: 'Carts retrieved successfully',
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

export const getCartController = async (req, res) => {
  try {
    const cart = await getCartService(req.params.userId, req.params.productId, req.user);
    res.status(200).json({
      body: cart,
      status: 200,
      message: 'Cart retrieved successfully',
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

export const updateCartController = async (req, res) => {
  try {
    const cart = await updateCartSsrvice(
      req.params.userId,
      req.params.productId,
      req.body,
      req.user,
    );

    res.status(200).json({
      body: cart,
      status: 200,
      message: 'Cart updated successfully',
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

export const deleteCartController = async (req, res) => {
  try {
    const cart = await deleteCartService(req.params.userId, req.params.productId, req.user);

    res.status(200).json({
      body: cart,
      status: 200,
      message: 'Cart deleted successfully',
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
