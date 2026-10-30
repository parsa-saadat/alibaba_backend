import multer from 'multer';
import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader;
  if (!token) {
    return res.status(401).json({
      body: null,
      status: 401,
      message: 'Access Denied: No Token Provided',
      success: false,
    });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(403).json({
      body: null,
      status: 403,
      message: 'Access Denied: Invalid Token',
      success: false,
    });
  }
};

export const authorizeRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        body: null,
        status: 403,
        message: 'Access Denied: Insufficient Permissions',
        success: false,
      });
    }
    next();
  };
};

const storate = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage: storate,
  limits: { fileSize: process.env.MAX_MB_UPLOAD_SIZE * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  },
});
