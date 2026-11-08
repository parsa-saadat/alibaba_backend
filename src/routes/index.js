import { Router } from 'express';

import productsRouter from './product/product.route.js';
import storageRouter from './storage/storage.route.js';
import authRouter from './auth/auth.route.js';
import usersRouter from './user/user.route.js';
import addressRouter from './address/address.routes.js';
import cartsRouter from './cart/cart.routes.js';
import sellerRouter from './seller/seller.route.js';
import storeRouter from './store/store.route.js';
import planRouter from './plan/plan.route.js';
import orderRouter from './order/order.route.js'
import paymentRouter from './payment/payment.route.js'

const router = Router();

router.use('/', productsRouter);

router.use('/storage', storageRouter);

router.use('/auth', authRouter);

router.use('/user', usersRouter);

router.use('/user', cartsRouter);

router.use('/', sellerRouter);

router.use('/', addressRouter);

router.use('/', storeRouter);

router.use('/plan', planRouter);

router.use('/', orderRouter);

router.use('/', paymentRouter);

export default router;
