import { WebSocketServer } from 'ws';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import db from '../../config/mongodb.config.js';
import { contentValue } from '../../utils/helpers/content-fields.helper.js';
import { languages } from '../../utils/helpers/localization.helper.js';

/*
 * درگاه زمان‌واقعی چت روی همان سرور HTTP.
 *   client → server : {type:'ping'} | {type:'typing', conversation_id}
 *   server → client : ready | pong | message:new | message:updated | message:deleted
 *                     conversation:new | conversation:updated | read | typing | presence
 *
 * نوشتن داده (ارسال/ویرایش/حذف/خوانده‌شدن) عمداً از REST انجام می‌شود تا
 * اعتبارسنجی و تایید نقش فقط یک مسیر داشته باشد؛ این فایل فقط «رساندن» رویدادها
 * و نگه‌داشتن حضور/تایپ را بر عهده دارد.
 */

const clients = new Map(); // userId(string) → Set<WebSocket>
const pendingTyping = new Map(); // socket → timestamp of the last relayed typing frame
const TYPING_THROTTLE_MS = 1500;
const MAX_FRAMES_PER_WINDOW = 240;
const FRAME_WINDOW_MS = 60_000;

let server = null;

const allowedOrigins = () =>
  (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const originAllowed = (origin) => {
  if (!origin) return true; // ابزارهای غیرمرورگری و درخواست‌های same-origin
  const list = allowedOrigins();
  return list.includes('*') || list.includes(origin);
};

const send = (socket, payload) => {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    /* سوکت در حال بسته‌شدن */
  }
};

export const isOnline = (userId) => clients.has(String(userId)) && clients.get(String(userId)).size > 0;

/** رویداد را به همهٔ نشست‌های فعال این کاربران می‌فرستد. */
export function broadcast(userIds, payload) {
  const seen = new Set();
  for (const raw of Array.isArray(userIds) ? userIds : [userIds]) {
    const key = String(raw ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    for (const socket of clients.get(key) || []) send(socket, payload);
  }
}

/** رویداد را به هر کسی جز این کاربر می‌فرستد (برای تایپ و رسید خوانده‌شدن). */
export function broadcastExcept(userId, userIds, payload) {
  const exclude = String(userId);
  broadcast(
    (Array.isArray(userIds) ? userIds : [userIds]).filter((id) => String(id) !== exclude),
    payload,
  );
}

async function participantsOf(conversationId) {
  const row = await db
    .collection('chat_conversations')
    .findOne({ _id: new ObjectId(conversationId) });
  if (!row) return null;
  return { buyer_id: String(row.buyer_id), seller_id: String(row.seller_id), document: row };
}

/**
 * نام نمایشی فرستندهٔ تایپ. firstname/lastname ممکن است نقشهٔ چندزبانه باشد،
 * پس یا یک رشتهٔ واحد برگردانده می‌شود یا نقشهٔ زبان→رشته.
 */
function actorDisplayName(user) {
  const part = (value, language) => {
    const raw = contentValue(value, language);
    return typeof raw === 'string' ? raw.trim() : '';
  };
  const fallback = typeof user?.username === 'string' ? user.username.trim() : '';
  const byLanguage = {};
  for (const language of languages) {
    const full = [part(user?.firstname, language), part(user?.lastname, language)]
      .filter(Boolean)
      .join(' ')
      .trim();
    byLanguage[language] = full || fallback;
  }
  const distinct = new Set(Object.values(byLanguage));
  if (distinct.size === 1) return [...distinct][0] || '';
  return byLanguage;
}

function attachSocket(userId, socket) {
  const key = String(userId);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(socket);
}

/** حضور طرف مقابل را برای هر دو عضو یک گفتگو اعلام می‌کند. */
async function announcePresence(userId, online) {
  const rows = await db
    .collection('chat_conversations')
    .find({ $or: [{ buyer_id: new ObjectId(userId) }, { seller_id: new ObjectId(userId) }] })
    .toArray();
  for (const row of rows) {
    const counterpart =
      String(row.buyer_id) === String(userId) ? String(row.seller_id) : String(row.buyer_id);
    broadcast([counterpart], {
      type: 'presence',
      conversation_id: String(row._id),
      user_id: String(userId),
      online,
    });
  }
}

export function attachChatGateway(httpServer) {
  if (server) return server;

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: ({ origin }, done) => done(originAllowed(origin), 403, 'Origin not allowed'),
  });

  server = wss;

  wss.on('connection', async (socket, request) => {
    socket.__frames = 0;
    socket.__windowStart = Date.now();
    socket.__alive = true;
    socket.on('pong', () => {
      socket.__alive = true;
    });

    let actor = null;
    try {
      const url = new URL(request.url, 'http://localhost');
      const token = url.searchParams.get('token') || request.headers.authorization || '';
      if (!token) throw new Error('missing token');
      const claims = jwt.verify(token, process.env.JWT_SECRET);
      if (!claims?._id) throw new Error('malformed token');
      /* نقش/وجود از دیتابیس بازخوانی می‌شود؛ ادعای خام توکن معتبر نیست */
      actor = await db.collection('users').findOne({ _id: new ObjectId(String(claims._id)) });
      if (!actor) throw new Error('unknown user');
    } catch {
      send(socket, { type: 'error', message: 'Access denied' });
      socket.close(4403, 'Access denied');
      return;
    }

    const userId = String(actor._id);
    socket.__chatUserId = userId;
    attachSocket(userId, socket);

    send(socket, { type: 'ready', user_id: userId });
    await announcePresence(userId, true).catch(() => {});

    socket.on('message', async (raw) => {
      let frame;
      try {
        frame = JSON.parse(String(raw));
      } catch {
        return send(socket, { type: 'error', message: 'Invalid frame' });
      }

      const now = Date.now();
      if (now - socket.__windowStart > FRAME_WINDOW_MS) {
        socket.__windowStart = now;
        socket.__frames = 0;
      }
      if (++socket.__frames > MAX_FRAMES_PER_WINDOW) {
        return send(socket, { type: 'error', message: 'Too many events, slow down' });
      }

      if (frame?.type === 'ping') return send(socket, { type: 'pong', at: now });

      if (frame?.type === 'typing') {
        const id = String(frame.conversation_id || '');
        if (!/^[a-f\d]{24}$/i.test(id)) return;
        const parties = await participantsOf(id).catch(() => null);
        if (!parties) return;
        if (userId !== parties.buyer_id && userId !== parties.seller_id) return;
        if (parties.document.status === 'BLOCKED') return;

        const last = pendingTyping.get(socket) || 0;
        if (now - last < TYPING_THROTTLE_MS) return;
        pendingTyping.set(socket, now);

        const others = [parties.buyer_id, parties.seller_id].filter((x) => x !== userId);
        broadcastExcept(userId, others, {
          type: 'typing',
          conversation_id: id,
          user_id: userId,
          /* نام هم به‌صورت نقشهٔ زبان ارسال می‌شود تا کلاینت درست انتخاب کند */
          name: actorDisplayName(actor),
        });
      }
    });

    socket.on('close', () => {
      const wasLast = (() => {
        const set = clients.get(userId);
        if (!set) return false;
        set.delete(socket);
        const empty = set.size === 0;
        if (empty) clients.delete(userId);
        return empty;
      })();
      pendingTyping.delete(socket);
      if (wasLast) announcePresence(userId, false).catch(() => {});
    });

    socket.on('error', () => socket.close());
  });

  const heartbeat = setInterval(() => {
    for (const set of clients.values())
      for (const socket of set) {
        if (socket.__alive === false) {
          socket.terminate();
          continue;
        }
        socket.__alive = false;
        socket.ping?.();
      }
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

export const chatGatewayStats = () => ({
  users: clients.size,
  sockets: [...clients.values()].reduce((total, set) => total + set.size, 0),
});
