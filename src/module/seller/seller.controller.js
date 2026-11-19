import { getSellerStatsService } from './seller.service.js';
import {
  registerSellerService,
  getSellerService,
  getSellersService,
  updateSellerService,
  trustSellerService,
} from './seller.service.js';

export const registerSellerController = async (req, res) => {
  try {
    const seller = await registerSellerService(req.body, req.user);
    res.status(200).json({
      body: seller,
      status: 200,
      message: 'Seller registered successfully',
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

export const getSellersController = async (req, res) => {
  try {
    const sellers = await getSellersService(req.query);
    res.status(200).json({
      body: sellers,
      status: 200,
      message: 'Sellers fetched successfully',
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

export const getSellerController = async (req, res) => {
  try {
    const seller = await getSellerService(req.params.id, req.user);
    res.status(200).json({
      body: seller,
      status: 200,
      message: 'Seller fetched successfully',
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

export const updateSellerController = async (req, res) => {
  try {
    const seller = await updateSellerService(req.params.id, req.body, req.user);
    res.status(200).json({
      body: seller,
      status: 200,
      message: 'Seller updated successfully',
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

export const trustSellerController = async (req, res) => {
  try {
    const { trust = true } = req.body;
    const seller = await trustSellerService(req.params.id, trust, req.user);
    res.status(200).json({
      body: seller,
      status: 200,
      message: trust ? 'Seller trusted successfully' : 'Seller trust revoked successfully',
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
export const getSellerStatsController = async (req, res) => {
  try {
    const stats = await getSellerStatsService(req.user, req.query.currency || 'USD');
    res.json({ body: stats, success: true, status: 200 });
  } catch (error) {
    const status = error.cause?.code || 500;
    res.status(status).json({ body: null, success: false, status, message: error.message });
  }
};
