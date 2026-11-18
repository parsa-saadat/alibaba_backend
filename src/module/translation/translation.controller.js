import { translateContent } from './translation.service.js';

export const generateTranslationsController = async (req, res) => {
  try {
    const result = await translateContent(req.body);
    res.json({ body: result, success: true, status: 200, message: 'Translations generated' });
  } catch (error) {
    const status = error.cause?.code || 502;
    res.status(status).json({
      body: null,
      success: false,
      status,
      error_code: 'TRANSLATION_FAILED',
      message: status >= 500 ? 'Translation service temporarily unavailable' : error.message,
    });
  }
};
