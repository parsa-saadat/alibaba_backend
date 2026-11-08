import { findOneUser } from '../../model/controller/user.controller.js';
import {
  createStoreService,
  getStoreService,
  getStoresService,
  updateStoreService,
  deleteStoreService,
  getStoresPermService,
  getStorePermService,
} from './store.service.js';

export const createStoreController = async (req, res) => {
  try {
    const targetUserId = req.body?.user_id ?? req.user._id;

    const user =
      targetUserId.toString() === req.user._id.toString()
        ? req.user
        : await findOneUser({ _id: targetUserId });

    const store = await createStoreService(user, req.body, req.user);
    res.status(201).json({
      body: store,
      status: 201,
      message: 'Store created successfully',
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

export const getStoresController = async (req, res) => {
  try {
    const stores = await getStoresService(req.query);
    res.status(200).json({
      body: stores,
      status: 200,
      message: 'Stores fetched successfully',
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

export const getStoresPermController = async (req, res) => {
  try {
    const stores = await getStoresPermService(req.query?.user_id, req.user, req.query);
    res.status(200).json({
      body: stores,
      status: 200,
      message: 'Stores fetched successfully',
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

export const getStoreController = async (req, res) => {
  try {
    const store = await getStoreService(req.params.id);
    res.status(200).json({
      body: store, status: 200,
      message: 'Store fetched successfully', success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null, status: e.cause?.code || 500,
      message: e.message, success: false,
    });
  }
};

export const getStorePermController = async (req, res) => {
  try {
    const store = await getStorePermService(req.params.storeId, req.user);
    res.status(200).json({
      body: store, status: 200,
      message: 'Store fetched successfully', success: true,
    });
  } catch (e) {
    res.status(e.cause?.code || 500).json({
      body: null, status: e.cause?.code || 500,
      message: e.message, success: false,
    });
  }
};

export const updateStoreController = async (req, res) => {
  try {
    const store = await updateStoreService(req.params.id, req.body, req.user);
    res.status(200).json({
      body: store,
      status: 200,
      message: 'Store updated successfully',
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

export const deleteStoreController = async (req, res) => {
  try {
    const store = await deleteStoreService(req.params.id, req.user);
    res.status(200).json({
      body: store,
      status: 200,
      message: 'Store deleted successfully',
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