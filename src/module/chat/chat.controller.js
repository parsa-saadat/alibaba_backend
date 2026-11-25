import {
  chatStatsService,
  chatUnreadService,
  deleteMessageService,
  editMessageService,
  getConversationService,
  listConversationsService,
  listMessagesService,
  markReadService,
  openConversationService,
  sendMessageService,
  setConversationStatusService,
  uploadChatImages,
} from './chat.service.js';

/* همان پاکت پاسخ بقیهٔ ماژول‌ها: { body, status, message, success } */
const reply = (res, body, message, status = 200) =>
  res.status(status).json({ body, status, message, success: true });

const fail = (res, error) => {
  const status = error.cause?.code && error.cause.code >= 400 ? error.cause.code : 500;
  res.status(status).json({
    body: null,
    status,
    message: status >= 500 ? 'Chat service unavailable' : error.message,
    success: false,
  });
};

export const openConversationController = async (req, res) => {
  try {
    const row = await openConversationService(req.body || {}, req.user);
    /* همان شکل عمومی گفتگو برگردانده می‌شود تا کلاینت به نقش/طرف‌ها دسترسی داشته باشد */
    const conversation = await getConversationService(String(row._id), req.user);
    reply(res, { conversation, reused: Boolean(row.reused) }, 'Conversation ready');
  } catch (error) {
    fail(res, error);
  }
};

export const listConversationsController = async (req, res) => {
  try {
    reply(res, await listConversationsService(req.query || {}, req.user), 'Conversations fetched');
  } catch (error) {
    fail(res, error);
  }
};

export const getConversationController = async (req, res) => {
  try {
    reply(res, await getConversationService(req.params.id, req.user), 'Conversation fetched');
  } catch (error) {
    fail(res, error);
  }
};

export const listMessagesController = async (req, res) => {
  try {
    reply(res, await listMessagesService(req.params.id, req.query || {}, req.user), 'Messages fetched');
  } catch (error) {
    fail(res, error);
  }
};

export const sendMessageController = async (req, res) => {
  try {
    const message = await sendMessageService(req.params.id, req.body || {}, req.user);
    reply(res, { message: { ...message, _id: String(message._id) } }, 'Message sent', 201);
  } catch (error) {
    fail(res, error);
  }
};

export const editMessageController = async (req, res) => {
  try {
    const message = await editMessageService(req.params.id, req.body || {}, req.user);
    reply(res, { message: { ...message, _id: String(message._id) } }, 'Message updated');
  } catch (error) {
    fail(res, error);
  }
};

export const deleteMessageController = async (req, res) => {
  try {
    reply(res, await deleteMessageService(req.params.id, req.user), 'Message deleted');
  } catch (error) {
    fail(res, error);
  }
};

export const markReadController = async (req, res) => {
  try {
    reply(res, await markReadService(req.params.id, req.user), 'Conversation marked as read');
  } catch (error) {
    fail(res, error);
  }
};

export const chatUnreadController = async (req, res) => {
  try {
    reply(res, await chatUnreadService(req.user), 'Unread count fetched');
  } catch (error) {
    fail(res, error);
  }
};

export const uploadChatImagesController = async (req, res) => {
  try {
    reply(res, await uploadChatImages(req.files, req.user), 'Images uploaded', 201);
  } catch (error) {
    fail(res, error);
  }
};

export const setConversationStatusController = async (req, res) => {
  try {
    reply(
      res,
      await setConversationStatusService(req.params.id, (req.body || {}).status, req.user),
      'Conversation status updated',
    );
  } catch (error) {
    fail(res, error);
  }
};

export const chatStatsController = async (req, res) => {
  try {
    reply(res, await chatStatsService(req.user), 'Chat stats fetched');
  } catch (error) {
    fail(res, error);
  }
};
