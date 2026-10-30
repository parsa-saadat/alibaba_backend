import express from 'express';

import { getSellerController, getSellersController, registerSellerController, updateSellerController } from '../../module/seller/seller.controller.js';
import { authenticateToken, authorizeRoles } from '../../module/seller/seller.middleware.js';

const router = express.Router();

router.post('/seller', authenticateToken, registerSellerController);

router.put('/seller/:id', authenticateToken, updateSellerController);

router.get('/seller/:id', authenticateToken, getSellerController);

router.get('/sellers', authenticateToken, getSellersController);

export default router;
