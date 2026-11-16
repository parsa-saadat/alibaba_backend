import express from 'express';

import { loginController, sendCodeController, sessionController } from '../../module/auth/aurh.controller.js';
import createLimiter from '../../middleware/safety/ratelimiter.middleware.js';
import { authenticateToken } from '../../module/auth/auth.middleware.js';

const router = express.Router();
const rateLimiter = createLimiter({ windowMs: 5 * 60 * 1000, max: 3 });

router.post('/pre', rateLimiter, sendCodeController);

router.post('/login', loginController);

router.get('/session', authenticateToken, sessionController);

export default router;