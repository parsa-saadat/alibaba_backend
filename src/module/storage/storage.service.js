import {
  deleteOneFile,
  findFiles,
  findOneFile,
  insertFile,
} from '../../model/controller/storage.controller.js';

export const uploadService = async (files, requester) => {
  if (!files || files.length < 0) throw new Error('File not found', { cause: { code: 400 } });

  let newFiles = [];

  for (let i = 0; i < files.length; i++) {
    const { originalname, mimetype, size, buffer } = files[i];

    if (requester.user.role == 'user' && !mimetype.startsWith('image/')) 
      throw new Error('Only image files are allowed', { cause: { code: 400 } });

    if (!mimetype.startsWith('image/') && !mimetype.startsWith('video/'))
      throw new Error('Only image and video files are allowed', { cause: { code: 400 } });

    if (size > (process.env.MAX_MB_UPLOAD_SIZE || 10) * 1024 * 1024)
      throw new Error(
        `File size exceeds the maximum limit ( ${process.env.MAX_MB_UPLOAD_SIZE || 10}MB )`,
        { cause: { code: 400 } },
      );

    newFiles.push(
      await insertFile({
        name: originalname,
        contentType: mimetype,
        size: size,
        data: buffer,
      }),
    );
  }

  return newFiles;
};

export const getFilesService = async (filter) => {
  let { page, limit, contentType, search, desc } = filter;

  limit = Number(limit) || 10;
  page = Number(page) || 1;

  let files = await findFiles({}, desc);

  if (contentType) files = files.filter((file) => file.contentType.includes(contentType));

  if (search) files = files.filter((file) => file.name.includes(search));

  const start = (page - 1) * limit;
  const total = files.length;
  const totalPages = Math.ceil(total / limit);

  files = files.slice(start, page * limit);

  return {
    data: files,
    total,
    totalPages,
  };
};

export const getFileService = async (id) => {
  const file = await findOneFile({ _id: id });

  if (!file) throw new Error('File not found', { cause: { code: 404 } });

  return file;
};

export const deleteFileService = async (id) => {
  const file = await findOneFile({ _id: id });

  if (!file) throw new Error('File not found', { cause: { code: 404 } });

  await deleteOneFile({ _id: id });

  return file;
};
