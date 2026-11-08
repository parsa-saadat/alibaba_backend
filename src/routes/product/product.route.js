import express from 'express';

import {
  createProductController,
  deleteProductController,
  getProductController,
  getProductPermController,
  getProductsController,
  getProductsPermController,
  updateProductController,
} from '../../module/product/product.controller.js';
import { authenticateToken, authorizeRoles } from '../../module/product/product.middleware.js';

const router = express.Router();

router.post('/product', authenticateToken, createProductController);

router.get('/product', getProductsController);

router.get('/product/:id', getProductController);

router.get('/perm/products', authenticateToken, getProductsPermController);

router.get('/perm/product/:productId', authenticateToken, getProductPermController);

router.put('/product/:id', authenticateToken, updateProductController);

router.delete('/product/:id', authenticateToken, deleteProductController);

export default router;
