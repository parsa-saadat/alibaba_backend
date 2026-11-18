import { Router } from 'express';
import { authenticateToken } from '../../module/product/product.middleware.js';
import {
  authorizeTranslationUser,
  translationLimiter,
} from '../../module/translation/translation.middleware.js';
import { generateTranslationsController } from '../../module/translation/translation.controller.js';

const router = Router();

router.post(
  '/translate',
  authenticateToken,
  authorizeTranslationUser,
  translationLimiter,
  generateTranslationsController,
);

export default router;
