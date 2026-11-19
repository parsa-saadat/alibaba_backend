import { Router } from 'express';
import { getRatesController, convertCurrencyController } from '../../module/fx/fx.controller.js';

import { validateConversionMiddleware } from '../../module/fx/fx.middleware.js';

const router = Router();

router.get('/rates', getRatesController);
router.post('/convert', validateConversionMiddleware, convertCurrencyController);

export default router;
