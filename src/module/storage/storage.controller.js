import {
  deleteFileService,
  getFileService,
  getFilesService,
  uploadService,
} from './storage.service.js';

export const uploadController = async (req, res) => {
  try {
    const files = req.files;
    const fileUploaded = await uploadService(files, req);
    res.status(200).json({
      body: fileUploaded,
      status: 200,
      message: 'File uploaded successfully',
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

export const getFilesController = async (req, res) => {
  try {
    const files = await getFilesService(req.query);
    res.status(200).json({
      body: files,
      status: 200,
      message: 'Files feched successfully',
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

export const getOneFileController = async (req, res) => {
  try {
    const file = await getFileService(req.params.id);
    res.status(200).json({
      body: file,
      status: 200,
      message: 'File feched successfully',
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

export const deleteOneFileController = async (req, res) => {
  try {
    const file = await deleteFileService(req.params.id);
    res.status(200).json({
      body: file,
      status: 200,
      message: 'File deleted successfully',
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
