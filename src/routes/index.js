import { Router } from 'express';

import productsRouter from './product/product.route.js';
import storageRouter from './storage/storage.route.js';
import authRouter from './auth/auth.route.js';
import usersRouter from './user/user.route.js';
import addressRouter from './address/address.routes.js';
import cartsRouter from './cart/cart.routes.js';
import sellerRouter from './seller/seller.route.js';

const router = Router();

router.use('/product', productsRouter);

router.use('/storage', storageRouter);

router.use('/auth', authRouter);

router.use('/user', usersRouter);

router.use('/user', cartsRouter);

router.use('/', sellerRouter);

router.use('/', addressRouter);

export default router;
