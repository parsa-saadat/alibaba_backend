import express from 'express';

import {
  createProductController,
  deleteProductController,
  getProductController,
  getProductsController,
  updateProductController,
} from '../../module/product/product.controller.js';
import { authenticateToken, authorizeRoles } from '../../module/product/product.middleware.js';

const router = express.Router();

router.post('/', authenticateToken, authorizeRoles('admin'), createProductController);

router.get('/', getProductsController);

router.get('/:id', getProductController);

router.put('/:id', authenticateToken, authorizeRoles('admin'), updateProductController);

router.delete('/:id', authenticateToken, authorizeRoles('admin'), deleteProductController);

export default router;
