import { preService } from './auth.service.js';

export const preMiddleware = async (req, res, next) => {
  try {
    const { phone, accept_rules } = req.body;
    const data = {
      phone,
      accept_rules,
    };
    await preService(data);
    next();
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: 400,
      message: e.message,
      success: false,
    });
  }
};
