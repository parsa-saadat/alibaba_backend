import { payOrderService, payPlanService, verifyOrderPaymentService, verifyPlanPaymentService } from './payment.service.js';

export const payOrderController = async (req, res) => {
  try {
    const result = await payOrderService(req.params.orderId, req.user);
    res.status(200).json({
      body: result,
      status: 200,
      message: 'Payment link generated successfully',
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

export const verifyOrderPaymentController = async (req, res) => {
  try {
    const result = await verifyOrderPaymentService(req.query);

    const successUrl = process.env.PAYMENT_SUCCESS_REDIRECT_URL;

    if (successUrl) {
      const url = new URL(successUrl);
      url.searchParams.set('ref_id', String(result.ref_id));
      url.searchParams.set('order_id', String(req.query.orderId));
      url.searchParams.set('amount', String(result.paid_amount));
      return res.redirect(url.toString());
    }

    return res.status(200).json({
      body: result,
      status: 200,
      message: 'Payment verified successfully',
      success: true,
    });
  } catch (e) {
    const failedUrl = process.env.PAYMENT_FAILED_REDIRECT_URL;

    if (failedUrl) {
      const url = new URL(failedUrl);
      url.searchParams.set('order_id', String(req.query.orderId || ''));
      url.searchParams.set('message', e.message);
      return res.redirect(url.toString());
    }

    return res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};

export const payPlanController = async (req, res) => {
  try {
    const result = await payPlanService(req.params.planId, req.user);
    res.status(200).json({
      body: result,
      status: 200,
      message: 'Plan payment link generated successfully',
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

export const verifyPlanPaymentController = async (req, res) => {
  try {
    const result = await verifyPlanPaymentService(req.query);

    const successUrl = process.env.PAYMENT_SUCCESS_REDIRECT_URL;

    if (successUrl) {
      const url = new URL(successUrl);
      url.searchParams.set('ref_id', String(result.ref_id));
      url.searchParams.set('plan_id', String(result.plan_id));
      url.searchParams.set('type', 'plan');
      return res.redirect(url.toString());
    }

    return res.status(200).json({
      body: result,
      status: 200,
      message: 'Plan payment verified successfully',
      success: true,
    });
  } catch (e) {
    const failedUrl = process.env.PAYMENT_FAILED_REDIRECT_URL;

    if (failedUrl) {
      const url = new URL(failedUrl);
      url.searchParams.set('message', e.message);
      url.searchParams.set('type', 'plan');
      return res.redirect(url.toString());
    }

    return res.status(e.cause?.code || 500).json({
      body: null,
      status: e.cause?.code || 500,
      message: e.message,
      success: false,
    });
  }
};