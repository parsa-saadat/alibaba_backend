import express from 'express';

import {
  createStoreController,
  deleteStoreController,
  getStoreController,
  getStorePermController,
  getStoresController,
  getStoresPermController,
  updateStoreController,
} from '../../module/store/store.controller.js';
import { authenticateToken, authorizeRoles } from '../../module/store/store.middleware.js';

const router = express.Router();

router.post('/store', authenticateToken, createStoreController);

router.get('/store', getStoresController);

router.get('/perm/stores', authenticateToken, getStoresPermController);

router.get('/store/:id', getStoreController);

router.get('/perm/store/:storeId', authenticateToken, getStorePermController);

router.put('/store/:id', authenticateToken, updateStoreController);

router.delete('/store/:id', authenticateToken, deleteStoreController);

export default router;