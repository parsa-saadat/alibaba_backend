import {
  createPlanService,
  getPlanService,
  getPlansService,
  updatePlanService,
  deletePlanService,
} from './plan.service.js';

export const createPlanController = async (req, res) => {
  try {
    const plan = await createPlanService(req.body, req.user);
    res.status(201).json({
      body: plan,
      status: 201,
      message: 'Plan created successfully',
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

export const getPlansController = async (req, res) => {
  try {
    const plans = await getPlansService(req.query, req.user);
    res.status(200).json({
      body: plans,
      status: 200,
      message: 'Plans fetched successfully',
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

export const getPlanController = async (req, res) => {
  try {
    const plan = await getPlanService(req.params.id, req.user);
    res.status(200).json({
      body: plan,
      status: 200,
      message: 'Plan fetched successfully',
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

export const updatePlanController = async (req, res) => {
  try {
    const plan = await updatePlanService(req.params.id, req.body, req.user);
    res.status(200).json({
      body: plan,
      status: 200,
      message: 'Plan updated successfully',
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

export const deletePlanController = async (req, res) => {
  try {
    const plan = await deletePlanService(req.params.id, req.user);
    res.status(200).json({
      body: plan,
      status: 200,
      message: 'Plan deleted successfully',
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