import express from 'express';
import { authenticateToken, authorizeRoles } from '../../module/order/order.middleware.js';
import {
  createOrderController,
  getOrdersController,
  payOrderController,
  preOrderController,
  verifyOrderPaymentController,
  updateOrderController,
  getOrderController,
} from '../../module/order/order.controller.js';
import createLimiter from '../../middleware/safety/ratelimiter.middleware.js';

const router = express.Router();
const rateLimiter = createLimiter({ windowMs: 5 * 60 * 1000, max: 10 });

router.post('/orders/pre', authenticateToken, rateLimiter, preOrderController);

router.post('/orders', authenticateToken, createOrderController);

router.get('/users/:userId/orders', authenticateToken, getOrdersController);

router.get('/orders/verify', verifyOrderPaymentController);

router.get('/orders/:orderId', authenticateToken, getOrderController);

router.post('/orders/pay', authenticateToken, payOrderController);

router.get('/orders', authenticateToken, authorizeRoles('admin'), getOrdersController);

router.put('/orders/:orderId', authenticateToken, authorizeRoles('admin'), updateOrderController);

export default router;
