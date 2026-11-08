import express from 'express';

import { authenticateToken } from '../../module/user/user.middleware.js';
import { payOrderController, payPlanController, verifyOrderPaymentController, verifyPlanPaymentController } from '../../module/payment/payment.controller.js';


const router = express.Router();


router.post('/order/:orderId/pay/', authenticateToken, payOrderController);

router.get('/order/pay/verify', verifyOrderPaymentController);

router.post('/plan/:planId/pay', authenticateToken, payPlanController);

router.get('/plan/pay/verify', verifyPlanPaymentController);

export default router;