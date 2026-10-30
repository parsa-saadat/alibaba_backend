import { loginService, sendCodeService } from './auth.service.js';

export const sendCodeController = async (req, res) => {
  try {
    const { phone } = req.body;
    const code = await sendCodeService({ phone });

    res.status(200).json({
      body: code || null,
      status: 200,
      message: 'Code sent successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const loginController = async (req, res) => {
  try {
    const { phone, code } = req.body;
    const token = await loginService({ phone, code });

    res.status(200).json({
      body: token,
      status: 200,
      message: 'Login successfully',
      success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};
