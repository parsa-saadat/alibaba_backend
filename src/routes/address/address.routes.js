import express from 'express';
import {
  createAddressController,
  deleteAddressController,
  getAddressController,
  getAllAddressController,
  getOneAddressController,
  updateAddressController,
} from '../../module/address/address.controller.js';
import { authenticateToken, authorizeRoles } from '../../module/address/address.middleware.js';

const router = express.Router();

router.post('/users/:userId/address', authenticateToken, createAddressController);

router.get('/users/:userId/address', authenticateToken, getAddressController);

router.get('/users/:userId/address/:id', authenticateToken, getOneAddressController);

router.put('/users/:userId/address/:id', authenticateToken, updateAddressController);

router.delete('/users/:userId/address/:id', authenticateToken, deleteAddressController);

router.get('/address', authenticateToken, authorizeRoles('admin'), getAllAddressController);

export default router;
