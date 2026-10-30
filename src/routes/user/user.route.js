import express from 'express';
import {
  deleteUserController,
  getUserController,
  getUsersController,
  updateUserController,
} from '../../module/user/user.controller.js';
import { authenticateToken, authorizeRoles } from '../../module/user/user.middleware.js';

const router = express.Router();

router.get('/', authenticateToken, authorizeRoles('admin'), getUsersController);

router.get('/:userId', authenticateToken, getUserController);

router.put('/:userId', authenticateToken, updateUserController);

router.delete('/:userId', authenticateToken, deleteUserController);

export default router;
