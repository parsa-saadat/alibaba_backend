import {
  createAddressService,
  deleteAddressService,
  getAddressService,
  getAllAddressService,
  getOneAddressService,
  updateAddressService,
} from './address.service.js';

export const createAddressController = async (req, res) => {
  try {
    const address = await createAddressService(req.params.userId, req.body, req.user);

    res.status(200).json({
      body: address,
      status: 200,
      message: 'Address created successfully',
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

export const getAddressController = async (req, res) => {
  try {
    const address = await getAddressService(req.params.userId, req.user, req.query);
    res.status(200).json({
      body: address,
      status: 200,
      message: 'Address found successfully',
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

export const getOneAddressController = async (req, res) => {
  try {
    const address = await getOneAddressService(req.params.id, req.params.userId, req.user);
    res.status(200).json({
      body: address,
      status: 200,
      message: 'Address found successfully',
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

export const getAllAddressController = async (req, res) => {
  try {
    const address = await getAllAddressService(req.query);
    res.status(200).json({
      body: address,
      status: 200,
      message: 'Address found successfully',
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

export const updateAddressController = async (req, res) => {
  try {
    const address = await updateAddressService(
      req.params.id,
      req.params.userId,
      req.body,
      req.user,
    );
    res.status(200).json({
      body: address,
      status: 200,
      message: 'Address updated successfully',
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

export const deleteAddressController = async (req, res) => {
  try {
    const address = await deleteAddressService(req.params.id, req.params.userId, req.user);

    res.status(200).json({
      body: address,
      status: 200,
      message: 'Address deleted successfully',
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
