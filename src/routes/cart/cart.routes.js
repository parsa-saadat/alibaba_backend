import express from 'express';
import {
  createCartController,
  deleteCartController,
  getCartController,
  getCartsController,
  updateCartController,
} from '../../module/cart/cart.controller.js';
import { authenticateToken } from '../../module/cart/cart.middleware.js';

const router = express.Router();

router.post('/:userId/cart', authenticateToken, createCartController);

router.get('/:userId/cart', authenticateToken, getCartsController);

router.get('/:userId/cart/:productId', authenticateToken, getCartController);

router.put('/:userId/cart/:productId', authenticateToken, updateCartController);

router.delete('/:userId/cart/:productId', authenticateToken, deleteCartController);

export default router;
