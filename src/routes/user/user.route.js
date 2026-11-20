import { getUserStatsController } from '../../module/user/user.controller.js';
import express from 'express';
import {
  deleteUserController,
  getUserController,
  getUsersController,
  updateUserController,
} from '../../module/user/user.controller.js';
import {
  authenticateToken,
  authorizeRoles,
  optionalAuthenticateToken,
} from '../../module/user/user.middleware.js';

const router = express.Router();
router.get('/stats', authenticateToken, getUserStatsController);

router.get('/', authenticateToken, authorizeRoles('admin'), getUsersController);

router.get('/:userId', optionalAuthenticateToken, getUserController);

router.put('/:userId', authenticateToken, updateUserController);

router.delete('/:userId', authenticateToken, authorizeRoles(['admin']), deleteUserController);

export default router;
