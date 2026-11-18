import { Router } from 'express';
import { getRatesController, convertCurrencyController } from '../../module/fx/fx.controller.js';

const router = Router();

router.get('/rates', getRatesController);
router.post('/convert', convertCurrencyController);

export default router;
