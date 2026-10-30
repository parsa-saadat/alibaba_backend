import { config } from 'dotenv';
import { Logger } from '../../utils/generators/logs/logger.log.js';
import {
  createOrderService,
  getOrderService,
  getOrdersService,
  payOrderService,
  preOrderService,
  updateOrderService,
  verifyOrderPaymentService,
} from './orders.service.js';
import { response } from 'express';

config();

export const preOrderController = async (req, res) => {
  try {
    const order = await preOrderService(req.user);
    res.status(200).json({
      body: order,
      status: 200,
      message: 'Order created successfuly',
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

export const createOrderController = async (req, res) => {
  try {
    const order = await createOrderService(req.body, req.user);
    Logger.info(`Order created successfully`, {
      info: { ip: req.ip, url: req.url, user_agent: req.headers['user-agent'] },
      user: req.user,
    });
    res.status(200).json({
      body: order,
      status: 200,
      message: 'Order created successfuly',
      success: true,
    });
  } catch (e) {
    Logger.error(`Error-Order-Create : ${e.message}`, {
      info: { ip: req.ip, url: req.url, user_agent: req.headers['user-agent'] },
    });
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const updateOrderController = async (req, res) => {
  try {
    const order = await updateOrderService(req.params.orderId, req.body, req.user);
    Logger.info(`Order updated successfully`, {
      info: { ip: req.ip, url: req.url, user_agent: req.headers['user-agent'] },
      user: req.user,
    });
    res.status(200).json({
      body: order,
      status: 200,
      message: 'Order updated successfuly',
      success: true,
    });
  } catch (e) {
    Logger.error(`Error-Order-Update : ${e.message}`, {
      info: { ip: req.ip, url: req.url, user_agent: req.headers['user-agent'] },
    });
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const payOrderController = async (req, res) => {
  try {
    const order = await payOrderService(req.query.orderId, req.user);
    Logger.info(`Order payment request was sent successfully`, {
      info: { ip: req.ip, url: req.url, user_agent: req.headers['user-agent'] },
      user: req.user,
    });
    res.status(200).json({
      body: order,
      status: 200,
      message: 'Order payment request was sent successfully',
      success: true,
    });
  } catch (e) {
    Logger.error(`Error-Order-Pay : ${e.message}`, {
      info: { ip: req.ip, url: req.url, user_agent: req.headers['user-agent'] },
    });
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const verifyOrderPaymentController = async (req, res) => {
  try {
    const { CLIENT_URL } = process.env;
    const order = await verifyOrderPaymentService(req.query);
    Logger.info(`Order paid successfully`);
    res.redirect(`${CLIENT_URL}/order/${req.query.orderId}`);
  } catch (e) {
    Logger.error(`Error-Order-Verify : ${e.message}`);
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const getOrdersController = async (req, res) => {
  try {
    const userId = req.params.userId;
    const orders = await getOrdersService(userId, req.user, req.query);
    res.status(200).json({
      body: orders,
      status: 200,
      message: 'Orders fetched successfuly',
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

export const getOrderController = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const orders = await getOrderService(orderId, req.user);
    res.status(200).json({
      body: orders,
      status: 200,
      message: 'Orders fetched successfuly',
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

// export const refundOrderController = async (req, res) => {
//   try {
//     const order = await refundOrderService(req.query.orderId, req.user);
//     res.status(200).json({
//       body: order,
//       status: 200,
//       message: 'Order cancelled successfuly',
//       success: true,
//     });
//   } catch (e) {
//     res.status(e.cause?.code || 500).json({
//       body: null,
//       status: e.cause?.code || 500,
//       message: e.message,
//       success: false,
//     });
//   }
// };
