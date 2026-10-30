import {
  registerSellerService,
  getSellerService,
  getSellersService,
  updateSellerService,
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