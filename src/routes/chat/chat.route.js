import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';

import { authenticateToken, authorizeRoles } from '../../module/category/category.middleware.js';
import {
  chatStatsController,
  chatUnreadController,
  deleteMessageController,
  editMessageController,
  getConversationController,
  listConversationsController,
  listMessagesController,
  markReadController,
  openConversationController,
  sendMessageController,
  setConversationStatusController,
  uploadChatImagesController,
} from '../../module/chat/chat.controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
});

/* نوشتن در چت محدودتر از بقیهٔ مسیرها است (ضد هرزنامه/فلود) */
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      body: null,
      status: 429,
      success: false,
      message: 'Too many messages, please slow down',
    }),
});

router.post('/conversations', authenticateToken, openConversationController);
router.get('/conversations', authenticateToken, listConversationsController);
router.get('/unread', authenticateToken, chatUnreadController);

router.get('/conversations/:id', authenticateToken, getConversationController);
router.get('/conversations/:id/messages', authenticateToken, listMessagesController);
router.post('/conversations/:id/messages', authenticateToken, writeLimiter, sendMessageController);
router.post('/images', authenticateToken, upload.array('files', 4), uploadChatImagesController);
router.put('/conversations/:id/read', authenticateToken, markReadController);

router.put('/messages/:id', authenticateToken, writeLimiter, editMessageController);
router.delete('/messages/:id', authenticateToken, writeLimiter, deleteMessageController);

/* نظارت ادمین — نقش واقعی از دیتابیس داخل سرویس دوباره بررسی می‌شود */
router.get('/stats', authenticateToken, authorizeRoles(['admin', 'root']), chatStatsController);
router.put(
  '/conversations/:id/status',
  authenticateToken,
  authorizeRoles(['admin', 'root']),
  setConversationStatusController,
);

export default router;
