import express from 'express';

import { getSellerController, getSellersController, registerSellerController, trustSellerController, updateSellerController } from '../../module/seller/seller.controller.js';
import { authenticateToken, authorizeRoles } from '../../module/seller/seller.middleware.js';

const router = express.Router();

router.post('/seller', authenticateToken, registerSellerController);

router.put('/seller/:id', authenticateToken, updateSellerController);

router.get('/seller/:id', authenticateToken, authorizeRoles('admin'), getSellerController);

router.get('/sellers', authenticateToken, authorizeRoles('admin'), getSellersController);

router.put('/seller/:id/trust', authenticateToken, authorizeRoles('admin'), trustSellerController);

export default router;
