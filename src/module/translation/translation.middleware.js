import { rateLimit } from 'express-rate-limit';
import { findOneUser } from '../../model/controller/user.controller.js';

export const translationLimiter = rateLimit({
  windowMs: 60000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

export const authorizeTranslationUser = async (req, res, next) => {
  try {
    let allowed = ['admin', 'seller'].includes(req.user?.role);
    if (!allowed) {
      const user = await findOneUser({ _id: req.user._id });
      allowed =
        user?.is_seller === true &&
        user?.seller_approved_status !== false &&
        user?.seller_active_status !== 'inactive';
    }
    if (!allowed)
      return res
        .status(403)
        .json({ body: null, success: false, status: 403, message: 'Access denied' });
    next();
  } catch (error) {
    next(error);
  }
};
