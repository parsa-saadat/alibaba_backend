import { ObjectId } from 'mongodb';

/*
 * اعتبارسنجی‌های خالص چت — هیچ دسترسی به دیتابیس ندارند و خطا را با
 * `cause.code` به‌عنوان کد HTTP پرتاب می‌کنند (همان قرارداد بقیهٔ ماژول‌ها).
 */
export const chatError = (message, code = 400) => new Error(message, { cause: { code } });

export const chatOid = (value, label = 'id') => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw chatError(`Invalid ${label}`, 400);
  return new ObjectId(value);
};

/* یک شناسهٔ اختیاری: یا معتبر، یا null */
export const optionalOid = (value, label = 'id') => {
  if (value === undefined || value === null || value === '') return null;
  return chatOid(value, label);
};

export const CONVERSATION_STATUSES = ['OPEN', 'CLOSED', 'BLOCKED'];
export const MESSAGE_KINDS = ['text', 'image'];
export const MAX_BODY_LENGTH = 4000;
export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const chatListQuery = (query = {}) => {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  const page = Math.max(Number(query.page) || 1, 1);
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 120) : '';
  return { page, limit, search };
};

export const chatMessageQuery = (query = {}) => {
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
  const before = optionalOid(query.before, 'before');
  const after = optionalOid(query.after, 'after');
  return { limit, before, after };
};

/* بدنهٔ پیام: متن خالی مجاز است فقط وقتی تصویر پیوست شده باشد */
export function chatMessageInput(data = {}) {
  const body = typeof data.body === 'string' ? data.body.replace(/\r\n/g, '\n').trim() : '';
  const images = Array.isArray(data.images) ? data.images : [];

  if (images.length > MAX_IMAGES_PER_MESSAGE)
    throw chatError(`At most ${MAX_IMAGES_PER_MESSAGE} images per message`, 400);

  const imageIds = images.map((id) => chatOid(id, 'image id'));

  if (!body && !imageIds.length) throw chatError('Message cannot be empty', 400);
  if (body.length > MAX_BODY_LENGTH)
    throw chatError(`Message is too long (max ${MAX_BODY_LENGTH} characters)`, 400);

  return { body, imageIds };
}

export function chatEditedBody(data = {}) {
  const body = typeof data.body === 'string' ? data.body.replace(/\r\n/g, '\n').trim() : '';
  if (!body) throw chatError('Message cannot be empty', 400);
  if (body.length > MAX_BODY_LENGTH)
    throw chatError(`Message is too long (max ${MAX_BODY_LENGTH} characters)`, 400);
  return body;
}

/* پین محصول/فروشگاه که همراه پیام می‌آید */
export function chatPinInput(pin) {
  if (pin === undefined || pin === null || pin === '') return null;
  if (typeof pin !== 'object' || Array.isArray(pin)) throw chatError('Invalid message pin', 400);

  const kind = pin.kind === 'store' ? 'store' : 'product';
  const product_id = optionalOid(pin.product_id, 'product id');
  const store_id = optionalOid(pin.store_id, 'store id');

  if (kind === 'product' && !product_id) throw chatError('Product pin needs a product id', 400);
  if (kind === 'store' && !store_id && !product_id)
    throw chatError('Store pin needs a store id', 400);

  return { kind, product_id, store_id };
}

/* بررسی جادویی‌های تصویر، دقیقاً مثل مسیر آپلود نظرات */
export function assertChatImage(file) {
  const b = file.buffer;
  const png =
    b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  const webp =
    b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

  if (
    file.size > MAX_IMAGE_BYTES ||
    !(
      (file.mimetype === 'image/png' && png) ||
      (file.mimetype === 'image/jpeg' && jpg) ||
      (file.mimetype === 'image/webp' && webp)
    )
  )
    throw chatError('Only valid JPEG, PNG and WebP images up to 5 MB are allowed', 400);
}

/* فروشنده فقط وقتی قابل گفتگو است که تأیید و فعال باشد */
export const isReachableSeller = (user) =>
  Boolean(user) &&
  user.is_seller === true &&
  user.seller_approved_status === true &&
  String(user.seller_active_status || '').toUpperCase() === 'ACTIVE';
