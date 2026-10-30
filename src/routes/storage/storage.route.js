import express from 'express';

import {
  authenticateToken,
  authorizeRoles,
  uploadMiddleware,
} from '../../module/storage/storage.middleware.js';
import {
  deleteOneFileController,
  getFilesController,
  getOneFileController,
  uploadController,
} from '../../module/storage/storage.controller.js';

const router = express.Router();

router.post(
  '/',
  authenticateToken,
  uploadMiddleware.array('files'),
  uploadController,
);

router.get('/', getFilesController);

router.get('/:id', getOneFileController);

router.delete('/:id', authenticateToken, authorizeRoles('admin'), deleteOneFileController);

export default router;
