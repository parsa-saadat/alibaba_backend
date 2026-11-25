import express from 'express';

import { authenticateToken, authorizeRoles } from '../../module/user/user.middleware.js';
import {
  requestRefundController,
  reconcileRefundController,
  payOrderController,
  payPlanController,
  verifyOrderPaymentController,
  verifyPlanPaymentController,
} from '../../module/payment/payment.controller.js';

const router = express.Router();
router.post(
  '/order/sub/:subOrderId/refund',
  authenticateToken,
  authorizeRoles(['admin']),
  requestRefundController,
);
router.post(
  '/order/sub/:subOrderId/refund/status',
  authenticateToken,
  authorizeRoles(['admin']),
  reconcileRefundController,
);

router.post('/order/:orderId/pay/', authenticateToken, payOrderController);

router.get('/order/pay/verify', verifyOrderPaymentController);

router.post('/plan/:planId/pay', authenticateToken, payPlanController);

router.get('/plan/pay/verify', verifyPlanPaymentController);

export default router;
