import express from 'express';
import { authenticateToken, authorizeRoles } from '../../module/user/user.middleware.js';
import {
  createOrderController,
  approveSubOrderController,
  cancelSubOrderController,
  updateSubOrderStatusController,
  getOrdersController,
  getOrderController,
  getSubOrdersController,
  getSubOrderController,
  getSubOrdersAllController,
} from '../../module/order/order.controller.js';
import createLimiter from '../../middleware/safety/ratelimiter.middleware.js';

const router = express.Router();

const rateLimiter = createLimiter({ windowMs: 5 * 60 * 1000, max: 10 });

// ─── CREATE ───
router.post('/order', authenticateToken, createOrderController);

// ─── LIST / SINGLE PARENT ───
router.get('/orders', authenticateToken, getOrdersController);
router.get('/order/:id', authenticateToken, getOrderController);

// ─── SUB-ORDER ACTIONS ───
router.put('/order/sub/:subOrderId/approve', authenticateToken, approveSubOrderController);
router.put('/order/sub/:subOrderId/cancel', authenticateToken, cancelSubOrderController);
router.put('/order/sub/:subOrderId/status', authenticateToken, updateSubOrderStatusController);

// ─── SUB-ORDER GET ───

router.get('/order/sub/all', authenticateToken, getSubOrdersAllController);

router.get('/order/sub/parent/:parentId', authenticateToken, authorizeRoles(['user', 'admin']), getSubOrdersController,);

router.get('/order/sub/:subOrderId', authenticateToken, getSubOrderController);

export default router;