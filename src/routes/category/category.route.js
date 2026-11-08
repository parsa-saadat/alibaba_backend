import express from 'express';
import { createCategoryController, deleteCategoryController, getCategoriesController, getCategoryController, getCategoryTreeController, updateCategoryController } from '../../module/category/category.controller.js';
import { authenticateToken, optionalAuthenticateToken } from '../../module/category/category.middleware.js';



const router = express.Router();

router.post('/category', authenticateToken, createCategoryController);

router.get('/category', optionalAuthenticateToken, getCategoriesController);

router.get('/category/tree', optionalAuthenticateToken, getCategoryTreeController);

router.get('/category/:id', optionalAuthenticateToken, getCategoryController);

router.put('/category/:id', authenticateToken, updateCategoryController);

router.delete('/category/:id', authenticateToken, deleteCategoryController);

export default router;
