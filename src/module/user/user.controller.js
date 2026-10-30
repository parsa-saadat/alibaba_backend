import {
  deleteUserService,
  getUserService,
  getUsersService,
  updateUserService,
} from './user.service.js';

export const getUsersController = async (req, res) => {
  try {
    const users = await getUsersService(req.query);
    res.status(200).json({
      body: users,
      status: 200,
      message: 'Users fetched successfully',
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

export const getUserController = async (req, res) => {
  try {
    const user = await getUserService(req.user._id, req.user);
    res.status(200).json({
      body: user,
      status: 200,
      message: 'User fetched successfully',
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

export const updateUserController = async (req, res) => {
  try {
    const user = await updateUserService(req.user._id, req.body, req.user);
    res.status(200).json({
      body: user,
      status: 200,
      message: 'User updated successfully',
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

export const deleteUserController = async (req, res) => {
  try {
    const user = await deleteUserService(req.user._id, req.user);
    res.status(200).json({
      body: user,
      status: 200,
      message: 'User deleted successfully',
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
