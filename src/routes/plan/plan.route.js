import express from 'express';
import { authenticateToken, authorizeRoles } from '../../module/plan/plan.middleware.js';
import {
  createPlanController,
  getPlansController,
  getPlanController,
  updatePlanController,
  deletePlanController,
} from '../../module/plan/plan.controller.js';

const router = express.Router();

router.get('/', getPlansController);

router.get('/:id', getPlanController);

router.post('/', authenticateToken, authorizeRoles('admin'), createPlanController);

router.put('/:id', authenticateToken, authorizeRoles('admin'), updatePlanController);

router.delete('/:id', authenticateToken, authorizeRoles('admin'), deletePlanController);

export default router;