const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const port = 8767;

// Config multer for memory storage - Limit 50MB
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } 
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));


// Locket API Credentials - Lấy từ thiết bị thật qua Mitmproxy / Burp Suite
// CẢNH BÁO: AppCheck và Instance ID Token thường xuyên hết hạn. Nếu upload "thành công" nhưng không hiện ảnh, hãy cập nhật các token này.
const USER_AGENT = 'FirebaseAuth.iOS/10.23.1 com.locket.Locket/2.8.0 iPhone/18.0 hw/iPhone12_1';
const STORAGE_USER_AGENT = 'com.locket.Locket/1.43.1 iPhone/17.3 hw/iPhone15_3 (GTMSUF/1)';
const FIREBASE_GMPID = '1:641029076083:ios:cc8eb46290d69b234fa606';
const FIREBASE_GMPID_STORAGE = '1:641029076083:ios:cc8eb46290d69b234fa609';
const FIREBASE_APP_CHECK = 'eyJraWQiOiJNbjVDS1EiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxOjY0MTAyOTA3NjA4Mzppb3M6Y2M4ZWI0NjI5MGQ2OWIyMzRmYTYwNiIsImF1ZCI6WyJwcm9qZWN0c1wvNjQxMDI5MDc2MDgzIiwicHJvamVjdHNcL2xvY2tldC00MjUyYSJdLCJwcm92aWRlciI6ImRldmljZV9jaGVja19kZXZpY2VfaWRlbnRpZmljYXRpb24iLCJpc3MiOiJodHRwczpcL1wvZmlyZWJhc2VhcHBjaGVjay5nb29nbGVhcGlzLmNvbVwvNjQxMDI5MDc2MDgzIiwiZXhwIjoxNzIyMTY3ODk4LCJpYXQiOjE3MjIxNjQyOTgsImp0aSI6ImlHUGlsT1dDZGg4Mll3UTJXRC1neEpXeWY5TU9RRFhHcU5OR3AzTjFmRGcifQ.lqTOJfdoYLpZwYeeXtRliCdkVT7HMd7_Lj-d44BNTGuxSYPIa9yVAR4upu3vbZSh9mVHYS8kJGYtMqjP-L6YXsk_qsV_gzKC2IhVAV6KbPDRHdevMfBC6fRiOSVn7vt749GVFdZqAuDCXhCILsaMhvgDBgZoDilgAPtpNwyjz-VtRB7OdOUbuKTCqdoSOX0SJWVUMyuI8nH0-unY--YRctunK8JHZDxBaM_ahVggYPWBCpzxq9Yeq8VSPhadG_tGNaADStYPaeeUkZ7DajwWqH5ze6ESpuFNgAigwPxCM735_ZiPeD7zHYwppQA9uqTWszK9v9OvWtFCsgCEe22O8awbNbuEBTKJpDQ8xvZe8iEYyhfUPncER3S-b1CmuXR7tFCdTgQe5j7NGWjFvN_CnL7D2nudLwxWlpqwASCHvHyi8HBaJ5GpgriTLXAAinY48RukRDBi9HwEzpRecELX05KTD2lTOfQCjKyGpfG2VUHP5Xm36YbA3iqTDoDXWMvV';
const FIREBASE_CLIENT = 'H4sIAAAAAAAAAKtWykhNLCpJSk0sKVayio7VUSpLLSrOzM9TslIyUqoFAFyivEQfAAAA';
const INSTANCE_ID_TOKEN = 'dIIokP3BqUpqtg_4ETWpqo:APA91bGJpQcQNrUeUCNR0e-Si9vT6ixqqiDZHYyg6OYTQ19b4-LPwgWpz5K66KU_W_HYL3vxBgGhr1ATs05VLeXI6OhQiYtvZrwHjQkFOVyDs-HLtIN7z68';

function logToFile(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, 'server_logs.txt'), line);
  console.log(msg);
}

// Locket expects 20-character lowercase alphabet names
function generateRandomName() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let name = "";
  for (let i = 0; i < 20; i++) {
    name += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return name;
}

// ── Proxy Login ──────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { email, password, apiKey, appCheck, instanceId } = req.body;
    const response = await axios.post(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${apiKey}`, {
      email,
      password,
      returnSecureToken: true,
      clientType: 'CLIENT_TYPE_IOS',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Firebase-GMPID': FIREBASE_GMPID,
        'X-Firebase-AppCheck': appCheck || FIREBASE_APP_CHECK,
        'X-Firebase-Client': FIREBASE_CLIENT,
        'X-Client-Version': 'iOS/FirebaseSDK/10.23.1/FirebaseCore-iOS',
        'X-Ios-Bundle-Identifier': 'com.locket.Locket',
        'Firebase-Instance-ID-Token': instanceId || INSTANCE_ID_TOKEN,
      }
    });
    res.json(response.data);
  } catch (error) {
    logToFile(`Login error: ${JSON.stringify(error.response?.data || error.message)}`);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// ── Proxy Token Refresh ───────────────────────────────────────
app.post('/api/refresh', async (req, res) => {
  try {
    const { refreshToken, apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'Missing apiKey' });
    
    const response = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      { 
        headers: { 
          'Content-Type': 'application/json',
          'X-Ios-Bundle-Identifier': 'com.locket.Locket',
          'X-Client-Version': 'iOS/FirebaseSDK/10.23.1/FirebaseCore-iOS'
        } 
      }
    );
    logToFile(`Token refreshed successfully for new idToken`);
    res.json(response.data); // { id_token, refresh_token, expires_in, ... }
  } catch (error) {
    logToFile(`Token refresh error: ${JSON.stringify(error.response?.data || error.message)}`);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});


async function tryUploadToFolder(file, userId, idToken, bucket, folder, finalMimeType, ext, appCheck, instanceId) {
  const name = `${generateRandomName()}.${ext}`;
  const storagePath = `users/${userId}/moments/${folder}/${name}`;
  const encodedPath = encodeURIComponent(storagePath);

  logToFile(`  → Trying folder: ${folder} mime: ${finalMimeType} | path: ${storagePath}`);

  const initUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=resumable&name=${encodedPath}`;
  const initRes = await axios.post(initUrl, {
    name: storagePath,
    contentType: finalMimeType,
    bucket: '',
    metadata: { creator: userId, visibility: 'private' },
  }, {
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
    }
  });

  const uploadUrl = initRes.headers['x-goog-upload-url'];
  if (!uploadUrl) throw new Error('Could not get upload URL from Firebase');

  await axios.put(uploadUrl, file.buffer, {
    headers: {
      'content-type': 'application/octet-stream',
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-offset': '0',
      'x-goog-upload-command': 'upload, finalize',
      'user-agent': STORAGE_USER_AGENT,
    }
  });

  const getUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}`;
  const metaRes = await axios.get(getUrl, {
    headers: { 
      'authorization': `Bearer ${idToken}`,
      'user-agent': 'com.locket.Locket/1.121.1 (iPhone; iOS 18.0; Scale/3.00)',
    }
  });

  const dlToken = metaRes.data.downloadTokens;
  const directUrl = `${getUrl}?alt=media&token=${dlToken}`;
  
  // Locket V2 requires MD5 of the Firebase media URL, not the file buffer
  const md5 = crypto.createHash('md5').update(directUrl).digest('hex');
  
  return { url: directUrl, md5 };
}

// ── Proxy Upload ──────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
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
    logToFile(`Upload error (outer): ${JSON.stringify(error.response?.data || error.message)}`);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// ── Proxy Post Moment ─────────────────────────────────────────
app.post('/api/post', async (req, res) => {
  try {
    const { idToken, data, appCheck, instanceId } = req.body;
    const caption = data.caption || "";
    
    // Determine the primary media URL for md5 hashing
    const primaryMediaUrl = data.video_url || data.image_url || data.thumbnail_url;
    const computedMd5 = crypto.createHash('md5').update(primaryMediaUrl).digest('hex');

    // Helper functions for analytics sync
    const createIntValue = (value) => ({
        "@type": "type.googleapis.com/google.protobuf.Int64Value",
        value: value.toString(),
    });

    const generateUUID = () => {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    };

    // Advanced analytics to bypass Locket filters
    const analytics = {
        experiments: {
            flag_4: createIntValue(43),
            flag_10: createIntValue(505),
            flag_23: createIntValue(400),
            flag_22: createIntValue(1203),
            flag_19: createIntValue(52),
            flag_18: createIntValue(1203),
            flag_16: createIntValue(303),
            flag_15: createIntValue(501),
            flag_14: createIntValue(500),
            flag_25: createIntValue(23),
        },
        amplitude: {
            device_id: generateUUID(),
            session_id: createIntValue(Date.now().toString()),
        },
        google_analytics: {
            app_instance_id: "5BDC04DA16FF4B0C9CA14FFB9C502900",
        },
        platform: "ios",
        camera_position: 1,
        did_record_video: !!data.video_url,
        flash_mode: 0,
        low_light: false,
        time_to_take: 5.0,
        was_uploaded: true,
    };

    // Handle streak date in Vietnam timezone
    const nowVN = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const yyyy = nowVN.getFullYear();
    const mm = String(nowVN.getMonth() + 1).padStart(2, "0");
    const dd = String(nowVN.getDate()).padStart(2, "0");
    const streakDate = Number(`${yyyy}${mm}${dd}`);

    const payload = {
      data: {
        thumbnail_url: data.thumbnail_url || data.image_url,
        md5: computedMd5,
        show_personally: false,
        analytics: analytics,
        overlays: data.overlays || [],
        update_streak_for_yyyymmdd: streakDate,
        streak_restoration_value: data.restore_streak || 0,
        sent_to_all: !!data.sent_to_all,
        sent_to_self_only: !!data.sent_to_self_only,
        recipients: Array.isArray(data.recipients) ? data.recipients : [],
        sent_to: Array.isArray(data.sent_to) ? data.sent_to : (Array.isArray(data.recipients) ? data.recipients : [])
      }
    };

    if (caption) payload.data.caption = caption;
    if (data.video_url) {
      payload.data.video_url = data.video_url;
    } else {
      payload.data.image_url = data.image_url || data.thumbnail_url;
    }

    logToFile('--- Post Moment Payload (Deep Sync V4) ---');
    logToFile(JSON.stringify(payload, null, 2));

    const response = await axios.post('https://api.locketcamera.com/postMomentV2', payload, {
      headers: {
        'Host': 'api.locketcamera.com',
        'Accept': '*/*',
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
        'sentry-trace': '2cdda588ea0041ed93d052932b127a3e-a3e2ba7a095d4f9d-0'
      }
    });

    logToFile(`Post success: ${JSON.stringify(response.data)}`);
    res.json(response.data);
  } catch (error) {
    const errorData = error.response?.data || error.message;
    logToFile(`Post error: ${JSON.stringify(errorData)}`);
    res.status(error.response?.status || 500).json(errorData);
  }
});

// ── Proxy Get Friends ─────────────────────────────────────────
app.post('/api/friends', async (req, res) => {
  try {
    const { userId, idToken, appCheck, instanceId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

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

    // 1. Lấy danh sách UID bạn bè từ Firestore
    do {
      // Dùng project number 641029076083 để đảm bảo trỏ đúng project
      const dbUrl = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${userId}/friends`;
      const response = await axios.get(dbUrl, {
        params: { pageSize: 100, ...(pageToken && { pageToken }) },
        headers
      });

      const docs = response.data.documents || [];
      const parsed = docs.map((doc) => doc.fields?.user?.stringValue).filter(Boolean);
      friendUids.push(...parsed);
      pageToken = response.data.nextPageToken || null;
    } while (pageToken);

    // 2. Lấy thông tin chi tiết từng người bạn
    // Note: Có thể tối ưu bằng Promise.all thay vì call tuần tự nếu số lượng ít, nhưng Locket API cho lấy qua Firestore.
    const friendDetails = await Promise.all(friendUids.map(async (fUid) => {
      try {
        const userUrl = `https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents/users/${fUid}`;
        const uRes = await axios.get(userUrl, { headers });
        const fields = uRes.data.fields || {};
        
        let dName = fields.first_name?.stringValue || '';
        if (fields.last_name?.stringValue) dName += ' ' + fields.last_name.stringValue;
        if (!dName.trim()) dName = fields.username?.stringValue || 'Friend';

        return {
          uid: fUid,
          display_name: dName.trim(),
          username: fields.username?.stringValue || '',
          thumbnail_url: fields.profile_picture_url?.stringValue || null,
        };
      } catch (e) {
        return { uid: fUid, display_name: 'Unknown', username: '', thumbnail_url: null };
      }
    }));

    logToFile(`Fetched ${friendDetails.length} friends via Firestore`);
    res.json({ friends: friendDetails });
  } catch (error) {
    const errorData = error.response?.data || error.message;
    logToFile(`Get Friends error: ${JSON.stringify(errorData)}`);
    res.status(error.response?.status || 500).json(errorData);
  }
});

// ── Proxy Friend Requests (Mocked since Locket disabled it) ──
app.post('/api/friends/requests', async (req, res) => {
  res.json({ invitations: [] });
});

app.post('/api/friends/respond', async (req, res) => {
  res.json({ success: true, message: "Mocked response, API deprecated" });
});

app.use(express.static(path.join(__dirname)));

app.listen(process.env.PORT || port, () => {
  console.log(`Locket Uploader server running on port ${process.env.PORT || port}`);
});
