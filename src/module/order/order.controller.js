import {
  createOrderService,
  approveSubOrderService,
  cancelSubOrderService,
  updateSubOrderStatusService,
  getOrdersService,
  getOrderService,
  getSubOrdersService,
  getSubOrderService,
} from './order.service.js';

// ─── CREATE ───
export const createOrderController = async (req, res) => {
  try {
    const order = await createOrderService(req.body, req.user);
    res.status(200).json({
      body: order,
      status: 200,
      message: 'Order created successfully',
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

// ─── LIST PARENTS ───
export const getOrdersController = async (req, res) => {
  try {
    const orders = await getOrdersService(req.query, req.user);
    res.status(200).json({
      body: orders,
      status: 200,
      message: 'Orders fetched successfully',
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

// ─── SINGLE PARENT ───
export const getOrderController = async (req, res) => {
  try {
    const order = await getOrderService(req.params.id, req.user);
    res.status(200).json({
      body: order,
      status: 200,
      message: 'Order fetched successfully',
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

// ─── SUB-ORDER ACTIONS ───
export const approveSubOrderController = async (req, res) => {
  try {
    const sub = await approveSubOrderService(req.params.subOrderId, req.user);
    res.status(200).json({
      body: sub,
      status: 200,
      message: 'Sub-order approved successfully',
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

export const cancelSubOrderController = async (req, res) => {
  try {
    const sub = await cancelSubOrderService(
      req.params.subOrderId,
      req.body,
      req.user,
    );
    res.status(200).json({
      body: sub,
      status: 200,
      message: 'Sub-order cancelled successfully',
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

export const updateSubOrderStatusController = async (req, res) => {
  try {
    const sub = await updateSubOrderStatusService(
      req.params.subOrderId,
      req.body,
      req.user,
    );
    res.status(200).json({
      body: sub,
      status: 200,
      message: 'Sub-order status updated successfully',
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

// ─── SUB-ORDER GET — لیست ───

export const getSubOrdersAllController = async (req, res) => {
  try {
    const subs = await getSubOrdersAllService(req.query, req.user);
    res.status(200).json({
      body: subs,
      status: 200,
      message: 'Sub-orders fetched successfully',
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

export const getSubOrdersController = async (req, res) => {
  try {
    const subs = await getSubOrdersService(
      req.params.parentId,
      req.query,
      req.user,
    );
    res.status(200).json({
      body: subs,
      status: 200,
      message: 'Sub-orders fetched successfully',
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

// ─── SUB-ORDER GET — تک ───
export const getSubOrderController = async (req, res) => {
  try {
    const sub = await getSubOrderService(req.params.subOrderId, req.user);
    res.status(200).json({
      body: sub,
      status: 200,
      message: 'Sub-order fetched successfully',
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