import express from 'express';

import { preMiddleware } from '../../module/auth/auth.middleware.js';
import { loginController, sendCodeController } from '../../module/auth/aurh.controller.js';
import createLimiter from '../../middleware/safety/ratelimiter.middleware.js';

const router = express.Router();
const rateLimiter = createLimiter({ windowMs: 5 * 60 * 1000, max: 3 });

router.post('/pre', rateLimiter, preMiddleware, sendCodeController);

router.post('/login', loginController);

export default router;