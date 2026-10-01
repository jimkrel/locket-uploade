'use strict';
require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const axios    = require('axios');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const {
  loginLimiter,
  refreshLimiter,
  uploadLimiter,
  postLimiter,
  generalLimiter,
} = require('./middleware/rateLimit');

// ── Validate required env vars ────────────────────────────────────────────────
const REQUIRED_ENV = [
  'FIREBASE_API_KEY',
  'FIREBASE_GMPID',
  'FIREBASE_GMPID_STORAGE',
  'FIREBASE_APP_CHECK',
  'FIREBASE_CLIENT',
  'INSTANCE_ID_TOKEN',
  'USER_AGENT',
  'STORAGE_USER_AGENT',
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.warn('⚠️ Cảnh báo thiếu biến môi trường:', missingEnv.join(', '));
  console.warn('   Hãy cấu hình trong Vercel Settings > Environment Variables.');
  // Không exit(1) trên môi trường Vercel/serverless để tránh crash toàn bộ web
  if (!process.env.VERCEL) {
    // Chỉ exit trên local nếu thiếu env
    // process.exit(1);
  }
}

// ── Credentials từ env vars ───────────────────────────────────────────────────
const FIREBASE_API_KEY      = process.env.FIREBASE_API_KEY || '';
const USER_AGENT            = process.env.USER_AGENT || 'FirebaseAuth.iOS/10.23.1 com.locket.Locket/2.8.0 iPhone/18.0 hw/iPhone12_1';
const STORAGE_USER_AGENT    = process.env.STORAGE_USER_AGENT || 'com.locket.Locket/1.43.1 iPhone/17.3 hw/iPhone15_3 (GTMSUF/1)';
const FIREBASE_GMPID        = process.env.FIREBASE_GMPID || '1:641029076083:ios:cc8eb46290d69b234fa606';
const FIREBASE_GMPID_STORAGE= process.env.FIREBASE_GMPID_STORAGE || '1:641029076083:ios:cc8eb46290d69b234fa609';
const FIREBASE_APP_CHECK    = process.env.FIREBASE_APP_CHECK || '';
const FIREBASE_CLIENT       = process.env.FIREBASE_CLIENT || 'H4sIAAAAAAAAAKtWykhNLCpJSk0sKVayio7VUSpLLSrOzM9TslIyUqoFAFyivEQfAAAA';
const INSTANCE_ID_TOKEN     = process.env.INSTANCE_ID_TOKEN || '';
const ALLOWED_ORIGIN        = process.env.ALLOWED_ORIGIN;
const PORT                  = process.env.PORT || 8767;

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

// Security headers (helmet)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS flexible cho cả localhost và Vercel
app.use(cors({
  origin: (origin, callback) => {
    // Cho phép request cùng origin (không có header origin), hoặc localhost, hoặc vercel.app
    if (!origin || origin.includes('localhost') || origin.endsWith('.vercel.app') || (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN)) {
      return callback(null, true);
    }
    return callback(null, true); // fallback permissive để tránh chặn UI
  },
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limit chung cho tất cả /api/*
app.use('/api/', generalLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

// Config multer for memory storage - Limit 50MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ── Logging (token-masked) ─────────────────────────────────────────────────────
function maskToken(token) {
  if (!token || token.length < 16) return '[EMPTY]';
  return token.substring(0, 8) + '...[MASKED]';
}
function logToFile(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(path.join(__dirname, 'server_logs.txt'), line);
  } catch (_) {
    // Trên Vercel filesystem là read-only, bỏ qua lỗi ghi file
  }
  console.log(msg);
}

// Locket expects 20-character lowercase alphabet names
function generateRandomName() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let name = '';
  for (let i = 0; i < 20; i++) {
    name += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return name;
}

// ── Phục vụ giao diện trang chủ ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── GET /api/config – trả API key cho frontend (không expose App Check/InstanceID) ──
app.get('/api/config', (req, res) => {
  res.json({ apiKey: FIREBASE_API_KEY });
});

// ── POST /api/login ───────────────────────────────────────────────────────────
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, appCheck, instanceId } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    // Không log email/password
    logToFile(`Login attempt for: ${email.substring(0, 3)}***`);

    const response = await axios.post(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${FIREBASE_API_KEY}`,
      { email, password, returnSecureToken: true, clientType: 'CLIENT_TYPE_IOS' },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'X-Firebase-GMPID': FIREBASE_GMPID,
          'X-Firebase-AppCheck': appCheck || FIREBASE_APP_CHECK,
          'X-Firebase-Client': FIREBASE_CLIENT,
          'X-Client-Version': 'iOS/FirebaseSDK/10.23.1/FirebaseCore-iOS',
          'X-Ios-Bundle-Identifier': 'com.locket.Locket',
          'Firebase-Instance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
        },
      }
    );
    logToFile(`Login success for: ${email.substring(0, 3)}***`);
    res.json(response.data);
  } catch (error) {
    logToFile(`Login error: ${JSON.stringify(error.response?.data?.error?.message || error.message)}`);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// ── POST /api/refresh ─────────────────────────────────────────────────────────
app.post('/api/refresh', refreshLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

    const response = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Ios-Bundle-Identifier': 'com.locket.Locket',
          'X-Client-Version': 'iOS/FirebaseSDK/10.23.1/FirebaseCore-iOS',
        },
      }
    );
    logToFile('Token refreshed successfully');
    res.json(response.data);
  } catch (error) {
    logToFile(`Token refresh error: ${error.response?.data?.error?.message || error.message}`);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// ── Upload helper ─────────────────────────────────────────────────────────────
async function tryUploadToFolder(file, userId, idToken, bucket, folder, finalMimeType, ext, appCheck, instanceId) {
  const name = `${generateRandomName()}.${ext}`;
  const storagePath = `users/${userId}/moments/${folder}/${name}`;
  const encodedPath = encodeURIComponent(storagePath);

  logToFile(`  → Trying folder: ${folder} mime: ${finalMimeType} | path: ${storagePath}`);

  const initUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=resumable&name=${encodedPath}`;
  const initRes = await axios.post(
    initUrl,
    { name: storagePath, contentType: finalMimeType, bucket: '', metadata: { creator: userId, visibility: 'private' } },
    {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'authorization': `Bearer ${idToken}`,
        'x-goog-upload-protocol': 'resumable',
        'x-goog-upload-command': 'start',
        'x-goog-upload-content-length': `${file.size}`,
        'x-goog-upload-content-type': finalMimeType,
        'x-firebase-storage-version': 'ios/10.13.0',
        'x-firebase-gmpid': FIREBASE_GMPID_STORAGE,
        'user-agent': STORAGE_USER_AGENT,
        'X-Firebase-AppCheck': appCheck || FIREBASE_APP_CHECK,
        'Firebase-Instance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
        'X-Firebase-GMPSDK-Version': 'ios/10.13.0',
      },
    }
  );

  const uploadUrl = initRes.headers['x-goog-upload-url'];
  if (!uploadUrl) throw new Error('Could not get upload URL from Firebase');

  await axios.put(uploadUrl, file.buffer, {
    headers: {
      'content-type': 'application/octet-stream',
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-offset': '0',
      'x-goog-upload-command': 'upload, finalize',
      'user-agent': STORAGE_USER_AGENT,
    },
  });

  const getUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}`;
  const metaRes = await axios.get(getUrl, {
    headers: {
      'authorization': `Bearer ${idToken}`,
      'user-agent': 'com.locket.Locket/1.121.1 (iPhone; iOS 18.0; Scale/3.00)',
    },
  });

  const dlToken = metaRes.data.downloadTokens;
  const directUrl = `${getUrl}?alt=media&token=${dlToken}`;
  const md5 = crypto.createHash('md5').update(directUrl).digest('hex');
  return { url: directUrl, md5 };
}

// ── POST /api/upload ──────────────────────────────────────────────────────────
app.post('/api/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    const { userId, idToken, type, isOriginal, appCheck, instanceId } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    let ext = 'webp';
    let finalMimeType = file.mimetype;
    let targetBucket = 'locket-img';
    let targetFolder = 'original';

    if (type === 'video') {
      ext = 'mp4';
      finalMimeType = 'video/mp4';
      targetBucket = 'locket-video';
      targetFolder = 'videos';
    } else {
      if (file.mimetype === 'image/jpeg') ext = 'jpg';
      if (file.mimetype === 'image/png') ext = 'png';
      targetFolder = isOriginal === 'true' ? 'original' : 'thumbnails';
      targetBucket = 'locket-img';
    }

    logToFile(`Upload request | type=${type} | size=${file.size} | bucket=${targetBucket} | folder=${targetFolder}`);

    try {
      const { url, md5 } = await tryUploadToFolder(file, userId, idToken, targetBucket, targetFolder, finalMimeType, ext, appCheck, instanceId);
      logToFile(`  ✓ Upload SUCCESS | folder: ${targetFolder} | mime: ${finalMimeType}`);
      return res.json({ url, md5 });
    } catch (err) {
      logToFile(`Upload FAILED: ${err.message}`);
      const status = err.response?.status;
      return res.status(status || 500).json(err.response?.data || { error: err.message });
    }
  } catch (error) {
    logToFile(`Upload error (outer): ${error.message}`);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// ── POST /api/post ────────────────────────────────────────────────────────────
app.post('/api/post', postLimiter, async (req, res) => {
  try {
    const { idToken, data, appCheck, instanceId } = req.body;
    const caption = data.caption || '';

    const primaryMediaUrl = data.video_url || data.image_url || data.thumbnail_url;
    const computedMd5 = crypto.createHash('md5').update(primaryMediaUrl).digest('hex');

    const createIntValue = (value) => ({
      '@type': 'type.googleapis.com/google.protobuf.Int64Value',
      value: value.toString(),
    });
    const generateUUID = () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

    const analytics = {
      experiments: {
        flag_4: createIntValue(43), flag_10: createIntValue(505),
        flag_23: createIntValue(400), flag_22: createIntValue(1203),
        flag_19: createIntValue(52), flag_18: createIntValue(1203),
        flag_16: createIntValue(303), flag_15: createIntValue(501),
        flag_14: createIntValue(500), flag_25: createIntValue(23),
      },
      amplitude: { device_id: generateUUID(), session_id: createIntValue(Date.now().toString()) },
      google_analytics: { app_instance_id: '5BDC04DA16FF4B0C9CA14FFB9C502900' },
      platform: 'ios', camera_position: 1,
      did_record_video: !!data.video_url, flash_mode: 0, low_light: false,
      time_to_take: 5.0, was_uploaded: true,
    };

    const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const yyyy = nowVN.getFullYear();
    const mm = String(nowVN.getMonth() + 1).padStart(2, '0');
    const dd = String(nowVN.getDate()).padStart(2, '0');
    const streakDate = Number(`${yyyy}${mm}${dd}`);

    const payload = {
      data: {
        thumbnail_url: data.thumbnail_url || data.image_url,
        md5: computedMd5, show_personally: false,
        analytics, overlays: data.overlays || [],
        update_streak_for_yyyymmdd: streakDate,
        streak_restoration_value: data.restore_streak || 0,
        sent_to_all: !!data.sent_to_all, sent_to_self_only: !!data.sent_to_self_only,
        recipients: Array.isArray(data.recipients) ? data.recipients : [],
        sent_to: Array.isArray(data.sent_to) ? data.sent_to : (Array.isArray(data.recipients) ? data.recipients : []),
      },
    };

    if (caption) payload.data.caption = caption;
    if (data.video_url) payload.data.video_url = data.video_url;
    else payload.data.image_url = data.image_url || data.thumbnail_url;

    logToFile('--- Post Moment ---');

    const response = await axios.post('https://api.locketcamera.com/postMomentV2', payload, {
      headers: {
        'Host': 'api.locketcamera.com', 'Accept': '*/*',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
        'User-Agent': USER_AGENT,
        'X-Firebase-GMPID': FIREBASE_GMPID,
        'X-Firebase-AppCheck': appCheck || FIREBASE_APP_CHECK,
        'X-Firebase-Client': FIREBASE_CLIENT,
        'Firebase-Instance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
        'Firebase-Intance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
        'X-Ios-Bundle-Identifier': 'com.locket.Locket',
        'X-Client-Version': 'iOS/FirebaseSDK/10.23.1/FirebaseCore-iOS',
        'Connection': 'keep-alive',
        'baggage': 'sentry-environment=production,sentry-public_key=78fa64317f434fd89d9cc728dd168f50,sentry-release=com.locket.Locket%401.121.1%2B1,sentry-trace_id=2cdda588ea0041ed93d052932b127a3e',
        'sentry-trace': '2cdda588ea0041ed93d052932b127a3e-a3e2ba7a095d4f9d-0',
      },
    });

    logToFile('Post success');
    res.json(response.data);
  } catch (error) {
    const errorData = error.response?.data || error.message;
    logToFile(`Post error: ${JSON.stringify(errorData)}`);
    res.status(error.response?.status || 500).json(errorData);
  }
});

// ── POST /api/friends ─────────────────────────────────────────────────────────
app.post('/api/friends', async (req, res) => {
  try {
    const { userId, idToken, appCheck, instanceId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'User-Agent': USER_AGENT,
      'X-Firebase-GMPID': FIREBASE_GMPID,
      'X-Firebase-AppCheck': appCheck || FIREBASE_APP_CHECK,
      'X-Firebase-Client': FIREBASE_CLIENT,
      'Firebase-Instance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
    };

    let pageToken = null;
    const friendUids = [];
    do {
      const dbUrl = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${userId}/friends`;
      const response = await axios.get(dbUrl, {
        params: { pageSize: 100, ...(pageToken && { pageToken }) },
        headers,
      });
      const docs = response.data.documents || [];
      const parsed = docs.map((doc) => doc.fields?.user?.stringValue).filter(Boolean);
      friendUids.push(...parsed);
      pageToken = response.data.nextPageToken || null;
    } while (pageToken);

    const friendDetails = await Promise.all(
      friendUids.map(async (fUid) => {
        try {
          const userUrl = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${fUid}`;
          const uRes = await axios.get(userUrl, { headers });
          const fields = uRes.data.fields || {};
          let dName = fields.first_name?.stringValue || '';
          if (fields.last_name?.stringValue) dName += ' ' + fields.last_name.stringValue;
          if (!dName.trim()) dName = fields.username?.stringValue || 'Friend';
          return {
            uid: fUid, display_name: dName.trim(),
            username: fields.username?.stringValue || '',
            thumbnail_url: fields.profile_picture_url?.stringValue || null,
          };
        } catch (e) {
          return { uid: fUid, display_name: 'Unknown', username: '', thumbnail_url: null };
        }
      })
    );

    logToFile(`Fetched ${friendDetails.length} friends`);
    res.json({ friends: friendDetails });
  } catch (error) {
    const errorData = error.response?.data || error.message;
    logToFile(`Get Friends error: ${JSON.stringify(errorData)}`);
    res.status(error.response?.status || 500).json(errorData);
  }
});

// ── POST /api/friends/requests ────────────────────────────────────────────────
app.post('/api/friends/requests', async (req, res) => {
  try {
    const { userId, idToken, appCheck, instanceId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      'User-Agent': USER_AGENT,
      'X-Firebase-GMPID': FIREBASE_GMPID,
      'X-Firebase-AppCheck': appCheck || FIREBASE_APP_CHECK,
      'X-Firebase-Client': FIREBASE_CLIENT,
      'Firebase-Instance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
    };

    const invUrl = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${userId}/invitations`;
    const response = await axios.get(invUrl, { headers });
    const docs = response.data.documents || [];

    const invitations = await Promise.all(
      docs.map(async (doc) => {
        const parts = doc.name.split('/');
        const contactId = parts[parts.length - 1];
        try {
          const userUrl = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${contactId}`;
          const uRes = await axios.get(userUrl, { headers });
          const fields = uRes.data.fields || {};
          return {
            contact_id: contactId,
            display_name: fields.first_name?.stringValue || 'Người dùng Locket',
            username: fields.username?.stringValue || '',
            thumbnail_url: fields.profile_picture_url?.stringValue || null,
          };
        } catch (e) {
          return { contact_id: contactId, display_name: 'Unknown', username: '', thumbnail_url: null };
        }
      })
    );

    logToFile(`Fetched ${invitations.length} friend requests`);
    res.json({ invitations });
  } catch (error) {
    if (error.response?.status === 404) return res.json({ invitations: [] });
    const errorData = error.response?.data || error.message;
    logToFile(`Friend Requests error: ${JSON.stringify(errorData)}`);
    res.status(error.response?.status || 500).json(errorData);
  }
});

// ── POST /api/friends/respond ─────────────────────────────────────────────────
app.post('/api/friends/respond', async (req, res) => {
  try {
    const { idToken, contactId, action, appCheck, instanceId } = req.body;
    const payload = { contact_id: contactId, action: action === 'accept' ? 'ACCEPT' : 'IGNORE' };

    const response = await axios.post('https://api.locketcamera.com/respondToInvitation', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
        'User-Agent': USER_AGENT,
        'X-Firebase-AppCheck': appCheck || FIREBASE_APP_CHECK,
        'Firebase-Instance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
      },
    });

    logToFile(`Respond to invitation (${action}): success`);
    res.json(response.data);
  } catch (error) {
    const errorData = error.response?.data || error.message;
    logToFile(`Respond error: ${JSON.stringify(errorData)}`);
    res.status(error.response?.status || 500).json(errorData);
  }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ Locket Uploader server running on port ${PORT}`);
    console.log(`   CORS allowed origin: ${ALLOWED_ORIGIN || '*'}`);
    console.log(`   App Check token: ${maskToken(FIREBASE_APP_CHECK)}`);
  });
}

module.exports = app;

