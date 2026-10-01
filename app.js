/* ─────────────────────────────────────────────────────────────
   LOCKET UPLOADER – app.js (Proxy Version)
   Calls local Express proxy to bypass CORS
   ⚠️  FIREBASE_API_KEY được lấy từ server qua /api/config
       Không còn hardcode trong source code!
───────────────────────────────────────────────────────────── */

// FIREBASE_API_KEY sẽ được load async từ server (xem initApp())
let FIREBASE_API_KEY = null;

// ── DOM refs ──────────────────────────────────────────────────
const loginScreen    = document.getElementById('loginScreen');
const uploadScreen   = document.getElementById('uploadScreen');
const headerActions  = document.getElementById('headerActions');
const userChip       = document.getElementById('userChip');
const btnLogout      = document.getElementById('btnLogout');

const btnOpenLogin   = document.getElementById('btnOpenLogin');
const modalOverlay   = document.getElementById('modalOverlay');
const modalClose     = document.getElementById('modalClose');
const emailInput     = document.getElementById('emailInput');
const passwordInput  = document.getElementById('passwordInput');
const eyeBtn         = document.getElementById('eyeBtn');
const eyeIcon        = document.getElementById('eyeIcon');
const loginError     = document.getElementById('loginError');
const btnLogin       = document.getElementById('btnLogin');
const loginBtnText   = document.getElementById('loginBtnText');
const loginSpinner   = document.getElementById('loginSpinner');

const dropZone       = document.getElementById('dropZone');
const fileInput      = document.getElementById('fileInput');
const dropLink       = document.getElementById('dropLink');
const captionInput   = document.getElementById('captionInput');
const charCount      = document.getElementById('charCount'); // Limit 500 in UI
const sentToAll      = document.getElementById('sentToAll');
const btnPost        = document.getElementById('btnPost');
const progressWrap   = document.getElementById('progressWrap');
const progressLabel  = document.getElementById('progressLabel');
const progressFill   = document.getElementById('progressFill');

const phoneScreen         = document.getElementById('phoneScreen');
const phoneCaptionPreview = document.getElementById('phoneCaptionPreview');
const toastContainer      = document.getElementById('toastContainer');

const friendsCard         = document.getElementById('friendsCard');
const friendsList         = document.getElementById('friendsList');
const friendsCount        = document.getElementById('friendsCount');
const friendsSearch       = document.getElementById('friendsSearch');

const navUpload       = document.getElementById('navUpload');
const navFriends      = document.getElementById('navFriends');
const pageTitle       = document.getElementById('pageTitle');
const btnSettingsSidebar = document.getElementById('btnSettingsSidebar');

const presetsGrid     = document.querySelector('.presets-grid');
const restoreStreak   = document.getElementById('restoreStreak');
const streakValue     = document.getElementById('streakValue');

// Security modal refs
const securityModalOverlay = document.getElementById('securityModalOverlay');
const securityModalClose   = document.getElementById('securityModalClose');
const btnSaveSecurity      = document.getElementById('btnSaveSecurity');
const appCheckInput        = document.getElementById('appCheckInput');
const instanceIdInput      = document.getElementById('instanceIdInput');

// ── State ─────────────────────────────────────────────────────
let session = null;
let selectedFile = null;
let allFriends = [];
let selectedFriends = new Set();
let securityTokens = { appCheck: '', instanceId: '' };
let pendingRequests = [];
let activeTab = 'text'; // 'text', 'music', 'location'
let activeScreen = 'upload'; // 'upload', 'friends'
let fileMd5 = null;

// ── Session persistence (Encrypted via CryptoStorage) ────────
async function saveSession(data) {
  session = data;
  await CryptoStorage.set('locket_session', data);
}
async function loadSession() {
  try {
    const data = await CryptoStorage.get('locket_session');
    if (data) {
      session = data;
      if (session.userId && !session.localId) session.localId = session.userId;
    }
    const sec = await CryptoStorage.get('locket_security');
    if (sec) {
      securityTokens = sec;
      if (appCheckInput) appCheckInput.value = securityTokens.appCheck || '';
      if (instanceIdInput) instanceIdInput.value = securityTokens.instanceId || '';
    }
  } catch (_) { session = null; }
}
async function clearSession() {
  session = null;
  CryptoStorage.remove('locket_session');
}

// ── Toast helper ──────────────────────────────────────────────
function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-dot"></div><span class="toast-msg">${message}</span>`;
  toastContainer.appendChild(t);
  setTimeout(() => {
    t.classList.add('exit');
    t.addEventListener('animationend', () => t.remove());
  }, 3600);
}

// ── UI transitions ────────────────────────────────────────────
function showUploadScreen() {
  loginScreen.style.display = 'none';
  uploadScreen.style.display = '';
  headerActions.style.display = 'flex';
  userChip.textContent = session.displayName || session.email || 'Bạn';
  fetchFriends();
}
function showLoginScreen() {
  uploadScreen.style.display = 'none';
  loginScreen.style.display = '';
  headerActions.style.display = 'none';
  clearFile();
}

// ── Modal open/close ──────────────────────────────────────────
function openModal() {
  modalOverlay.classList.add('open');
  emailInput.focus();
  loginError.style.display = 'none';
}
function closeModal() { modalOverlay.classList.remove('open'); }

function openSecurityModal() { securityModalOverlay.classList.add('open'); }
function closeSecurityModal() { securityModalOverlay.classList.remove('open'); }

btnOpenLogin.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

if (btnSettingsSidebar) btnSettingsSidebar.addEventListener('click', openSecurityModal);
if (securityModalClose) securityModalClose.addEventListener('click', closeSecurityModal);
if (securityModalOverlay) securityModalOverlay.addEventListener('click', e => { if (e.target === securityModalOverlay) closeSecurityModal(); });

if (btnSaveSecurity) btnSaveSecurity.addEventListener('click', async () => {
  securityTokens.appCheck = appCheckInput ? appCheckInput.value.trim() : '';
  securityTokens.instanceId = instanceIdInput ? instanceIdInput.value.trim() : '';
  await CryptoStorage.set('locket_security', securityTokens);
  showToast('Đã lưu cài đặt bảo mật!');
  closeSecurityModal();
});

// Navigation logic moved below Audience Selection

// ── Presets Data ─────────────────────────────────────────────
// ── Presets Data ─────────────────────────────────────────────
const CAPTION_PRESETS = [
  { id: "default", label: "Mặc định", icon: "Aa", text: "", color: "default" },
  { id: "music", label: "Đang phát", icon: "🎵", text: "🎵 Now playing...", color: "green" },
  { id: "custom", label: "Tuỳ chỉnh", icon: "Aa", text: "", color: "gray" },
  { id: "location", label: "Vị trí", icon: "📍", text: "📍 Check-in tại đây!", color: "gray" },
  { id: "time", label: "Thời gian", icon: "🕓", text: "", color: "gray" },
  { id: "women_day", label: "Phụ nữ", icon: "🌸", text: "🌸 Mừng ngày Phụ nữ!", color: "pink" },
  { id: "hello_2026", label: "Xin chào 2026!", icon: "🎆", text: "🎆 Xin chào 2026!", color: "blue" },
  { id: "hello_bing_ngo", label: "Bính Ngọ!", icon: "🐎", text: "🐎 Xin chào Bính Ngọ!", color: "red" },
  { id: "love", label: "Tình yêu", icon: "💟", text: "💟 Tình yêu của mình đây", color: "pink-vibrant" },
  { id: "year_2026", label: "2026", icon: "2026", text: "2026", color: "orange" },
  { id: "xmas_peace", label: "Giáng sinh", icon: "🎄", text: "🎄 Giáng sinh an lành", color: "green-dark" },
  { id: "tis_season", label: "'Tis the season", icon: "❄️", text: "❄️ 'Tis the season", color: "blue-light" },
  { id: "teachers", label: "Thầy cô", icon: "👩‍🏫", text: "👩‍🏫 Tôn vinh thầy cô", color: "green-teal" },
  { id: "halloween", label: "Halloween", icon: "🎃", text: "🎃 Halloween", color: "orange-dark" },
  { id: "women_day_2", label: "Phụ nữ", icon: "🌷", text: "🌷 Ngày Phụ nữ", color: "purple-light" },
  { id: "mid_autumn", label: "Trung Thu", icon: "🥮", text: "🥮 Vui Tết Trung Thu", color: "brown-dark" },
  { id: "nation_day", label: "Quốc khánh 2/9", icon: "🇻🇳", text: "🇻🇳 Quốc khánh 2/9", color: "red-vibrant" },
  { id: "july_4th", label: "July 4th!", icon: "🇺🇸", text: "🇺🇸 Happy July 4th!", color: "blue-dark" },
  { id: "father_day", label: "Father's Day", icon: "🥇", text: "🥇 Father's Day", color: "blue-vibrant" },
  { id: "memorial", label: "Memorial Day", icon: "🎖️", text: "🎖️ Memorial Day", color: "green-olive" },
  { id: "mother_day", label: "Mother's Day", icon: "🤱", text: "🤱 Mother's Day", color: "pink-soft" },
  { id: "liberation", label: "Chào mừng 30/4", icon: "🇻🇳", text: "🇻🇳 Chào mừng 30/4", color: "red-vibrant" },
  { id: "earth_day", label: "Earth Day", icon: "🌍", text: "🌍 Earth Day", color: "blue-pacific" },
  { id: "easter", label: "Happy Easter!", icon: "🐣", text: "🐣 Happy Easter!", color: "yellow-olive" },
  { id: "review", label: "Review", icon: "⭐", text: "⭐ Review", color: "blue-darker" },
  { id: "valentine", label: "Valentine!", icon: "💖", text: "💖 Happy Valentine's Day!", color: "pink-love" },
  { id: "lunarnewyear", label: "Tết Nguyên Đán", icon: "🧧", text: "🧧 Tết Nguyên Đán", color: "red-dark" },
  { id: "happynewyear", label: "New Year!", icon: "🎆", text: "🎆 Happy New Year!", color: "purple-blue" },
  { id: "merryxmas", label: "Merry Xmas!", icon: "🎄", text: "🎄 Merry Christmas!", color: "red-xmas" },
  { id: "morning", label: "Morning", icon: "☀️", text: "☀️ Good Morning", color: "orange-yellow" },
  { id: "night", label: "Night", icon: "🌙", text: "🌙 Good Night", color: "blue-night" },
  { id: "party", label: "Party Time!", icon: "🥳", text: "🥳 Party Time!", color: "green-cyan" },
  { id: "ootd", label: "OOTD", icon: "🕶️", text: "🕶️ OOTD", color: "gray-dark" },
  { id: "missyou", label: "Miss you", icon: "🥰", text: "🥰 Miss you", color: "red-vibrant" },
  { id: "vibes", label: "Vibes", icon: "🌊", text: "🌊 Good vibes only", color: "blue-vibrant" },
  { id: "foodie", label: "Foodie", icon: "🍜", text: "🍜 Yum yum!", color: "orange" },
  { id: "workout", label: "Workout", icon: "💪", text: "💪 No pain, no gain", color: "gray-dark" },
  { id: "gaming", label: "Gaming", icon: "🎮", text: "🎮 Level up!", color: "purple-blue" },
];

function initPresets() {
  if (!presetsGrid) return;
  presetsGrid.innerHTML = CAPTION_PRESETS.map(p => `
    <button class="btn-preset preset-${p.color}" data-text="${p.text}">
      <span class="preset-icon">${p.icon}</span>
      <span class="preset-label">${p.label}</span>
    </button>
  `).join('');
}

// ── Audience Selection ────────────────────────────────────────
const btnAudienceAll  = document.getElementById('btnAudienceAll');
const btnAudienceSelf = document.getElementById('btnAudienceSelf');
let audienceMode = 'all'; // 'all' or 'self'

function updateAudienceUI(mode) {
  audienceMode = mode;
  if (btnAudienceAll) btnAudienceAll.classList.toggle('active', mode === 'all');
  if (btnAudienceSelf) btnAudienceSelf.classList.toggle('active', mode === 'self');
  
  if (mode === 'self') {
    selectedFriends.clear();
    if (sentToAll) sentToAll.checked = false; 
    renderFriendsList();
  } else {
    if (sentToAll) sentToAll.checked = true;
    renderFriendsList();
  }
}

btnAudienceAll?.addEventListener('click', () => updateAudienceUI('all'));
btnAudienceSelf?.addEventListener('click', () => updateAudienceUI('self'));

// ── Navigation ────────────────────────────────────────────────
navUpload.addEventListener('click', () => switchScreen('upload'));
navFriends.addEventListener('click', () => switchScreen('friends'));

function switchScreen(screen) {
  activeScreen = screen;
  navUpload.classList.toggle('active', screen === 'upload');
  navFriends.classList.toggle('active', screen === 'friends');
  
  if (screen === 'upload') {
    pageTitle.textContent = 'Đăng khoảnh khắc';
    document.querySelector('.upload-panel').style.display = 'block';
    document.querySelector('.preview-card').style.display = 'block';
    friendsCard.style.display = 'none';
  } else {
    pageTitle.textContent = 'Quản lý bạn bè';
    document.querySelector('.upload-panel').style.display = 'none';
    document.querySelector('.preview-card').style.display = 'none';
    friendsCard.style.display = 'block';
  }
}

// ── Presets & Streak ──────────────────────────────────────────
if (presetsGrid) presetsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-preset');
  if (!btn) return;
  captionInput.value = btn.dataset.text;
  updateCharCount();
  updatePhonePreview();
  
  // Auto switch to text tab
  const textTab = document.querySelector('.cap-tab[data-tab="text"]');
  if (textTab) textTab.click();
});

if (restoreStreak) restoreStreak.addEventListener('change', () => {
  document.getElementById('streakValueWrap').style.display = restoreStreak.checked ? 'flex' : 'none';
});

function updateCharCount() {
  charCount.textContent = `${captionInput.value.length}/500`;
}

// ── Tab switching ─────────────────────────────────────────────
document.querySelectorAll('.cap-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cap-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.cap-content').forEach(c => c.style.display = 'none');
    
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    const contentId = 'cap' + activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
    document.getElementById(contentId).style.display = 'block';
    
    updatePhonePreview();
  });
});

function updatePhonePreview() {
    phoneCaptionPreview.textContent = activeTab === 'text' ? captionInput.value : '';
    
    const overlays = document.getElementById('phoneOverlays');
    overlays.innerHTML = '';
    
    if (activeTab === 'music') {
        const url = document.getElementById('musicUrl').value;
        if (url) {
            overlays.innerHTML = `<div class="preview-overlay music-overlay">🎵 Music Link Attached</div>`;
        }
    } else if (activeTab === 'location') {
        const loc = document.getElementById('locationName').value;
        if (loc) {
            overlays.innerHTML = `<div class="preview-overlay location-overlay">📍 ${loc}</div>`;
        }
    }
}

document.getElementById('musicUrl')?.addEventListener('input', updatePhonePreview);
document.getElementById('locationName')?.addEventListener('input', updatePhonePreview);

// ── Password eye toggle ───────────────────────────────────────
let passwordVisible = false;
eyeBtn.addEventListener('click', () => {
  passwordVisible = !passwordVisible;
  passwordInput.type = passwordVisible ? 'text' : 'password';
  eyeIcon.innerHTML = passwordVisible
    ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
});

// ── LOGIN ─────────────────────────────────────────────────────
btnLogin.addEventListener('click', doLogin);

async function doLogin() {
  const email    = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;

  setLoginLoading(true);
  loginError.style.display = 'none';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        // apiKey không còn hardcode ở frontend – server tự dùng từ env
        appCheck: securityTokens.appCheck,
        instanceId: securityTokens.instanceId
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || res.statusText);
    }

    const data = await res.json();
    await saveSession({
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      localId: data.localId,
      userId: data.localId,
      displayName: data.displayName || '',
      email: data.email,
    });

    closeModal();
    showUploadScreen();
    fetchFriendRequests();
    showToast(`Chào mừng ${session.displayName || email}! 👋`);
  } catch (err) {
    showLoginError(err.message || 'Đăng nhập thất bại.');
  } finally {
    setLoginLoading(false);
  }
}

function setLoginLoading(on) {
  loginBtnText.style.display = on ? 'none' : '';
  loginSpinner.style.display = on ? '' : 'none';
  btnLogin.disabled = on;
}
function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = '';
}

// ── LOGOUT ────────────────────────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await clearSession();
  showLoginScreen();
  showToast('Đã đăng xuất.');
});

// ── FILE HANDLING ─────────────────────────────────────────────
dropLink.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('click', e => { if (!e.target.closest('.file-selected-info')) fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

function handleFile(file) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) return showToast('Chỉ hỗ trợ ảnh và video!', 'error');
  if (file.size > 50 * 1024 * 1024) return showToast('File tối đa 50MB', 'error');

  selectedFile = file;
  renderDropZoneSelected(file);
  renderPreview(file, isImage);
  btnPost.disabled = false;
}

function renderDropZoneSelected(file) {
  dropZone.classList.add('has-file');
  const old = dropZone.querySelector('.file-selected-info'); if (old) old.remove();
  const info = document.createElement('div');
  info.className = 'file-selected-info';
  info.innerHTML = `
    <div class="file-info-text"><div class="file-info-name">${file.name}</div><div class="file-info-size">${formatSize(file.size)}</div></div>
    <button class="file-remove" id="btnRemoveFile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg></button>`;
  dropZone.appendChild(info);
  document.getElementById('btnRemoveFile').addEventListener('click', e => { e.stopPropagation(); clearFile(); });
}

function clearFile() {
  selectedFile = null; fileInput.value = ''; dropZone.classList.remove('has-file');
  const old = dropZone.querySelector('.file-selected-info'); if (old) old.remove();
  phoneScreen.innerHTML = '<div class="preview-placeholder"><span>Preview sẽ hiện ở đây</span></div>';
  phoneCaptionPreview.textContent = ''; btnPost.disabled = true;
  selectedFriends.clear(); renderFriendsList();
}

function renderPreview(file, isImage) {
  const url = URL.createObjectURL(file);
  const el = document.createElement(isImage ? 'img' : 'video');
  el.src = url; if (!isImage) { el.autoplay = true; el.muted = true; el.loop = true; el.playsInline = true; }
  phoneScreen.innerHTML = ''; phoneScreen.appendChild(el);
}

captionInput.addEventListener('input', () => {
  charCount.textContent = `${captionInput.value.length}/500`;
  phoneCaptionPreview.textContent = captionInput.value;
});

function formatSize(b) { return b < 1048576 ? (b/1024).toFixed(1)+'KB' : (b/1048576).toFixed(1)+'MB'; }

// ── FRIENDS LOGIC ─────────────────────────────────────────────
async function fetchFriends() {
  if (!session) return;
  friendsCard.style.display = '';
  friendsList.innerHTML = '<div class="friends-loading">Đang tải danh sách...</div>';
  
  const doFetch = async (token) => {
    return fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: session.localId,
        idToken: token,
        appCheck: securityTokens.appCheck,
        instanceId: securityTokens.instanceId
      }),
    });
  };

  try {
    let res = await doFetch(session.idToken);
    
    // Auto-refresh token on 401/403
    if (res.status === 401 || res.status === 403) {
      console.log('⚠️ Friends fetch got ' + res.status + ' — refreshing token...');
      try {
        const newToken = await refreshIdToken();
        res = await doFetch(newToken);
      } catch (refreshErr) {
        throw new Error('Token hết hạn — vui lòng đăng nhập lại');
      }
    }
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.error?.status || `Lỗi ${res.status}`);
    }
    const data = await res.json();
    allFriends = data.friends || [];
    friendsCount.textContent = allFriends.length;
    renderFriendsList();
  } catch (err) {
    friendsList.innerHTML = `<div class="friends-empty">Lỗi: ${err.message}</div>`;
  }
}

function renderFriendsList() {
  const query = friendsSearch.value.toLowerCase();
  const filtered = allFriends.filter(f => 
    (f.display_name || '').toLowerCase().includes(query) || 
    (f.username || '').toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    friendsList.innerHTML = '<div class="friends-empty">Không tìm thấy bạn bè</div>';
    return;
  }

  friendsList.innerHTML = filtered.map((f, i) => `
    <div class="friend-item ${selectedFriends.has(f.uid) ? 'selected' : ''}" onclick="toggleFriend('${f.uid}')" style="--i: ${i}">
      ${f.thumbnail_url ? `<img src="${f.thumbnail_url}" class="friend-avatar" />` : `<div class="friend-avatar">${(f.display_name || '?')[0].toUpperCase()}</div>`}
      <div class="friend-info">
        <div class="friend-name">${f.display_name || 'Người dùng Locket'}</div>
        <div class="friend-username">@${f.username || ''}</div>
      </div>
      <div class="friend-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
    </div>
  `).join('');
}

window.toggleFriend = (uid) => {
  if (selectedFriends.has(uid)) selectedFriends.delete(uid);
  else selectedFriends.add(uid);
  
  if (selectedFriends.size > 0) sentToAll.checked = false;
  renderFriendsList();
};

friendsSearch?.addEventListener('input', renderFriendsList);
// sentToAll was replaced by audienceMode logic


// ── UPLOAD FLOW ───────────────────────────────────────────────
btnPost.addEventListener('click', doPost);

async function doPost() {
  if (!selectedFile || !session) return;
  const isImage = selectedFile.type.startsWith('image/');
  const caption = captionInput.value.trim();

  btnPost.disabled = true;
  showProgress('Bắt đầu upload…', 5);

  try {
    let thumbnailUrl = null;
    let videoUrl     = null;
    let image_url    = null;

    if (isImage) {
      showProgress('Đang upload ảnh chính…', 30);
      const { url: originalUrl, md5: originalMd5 } = await uploadToProxy(selectedFile, 'image', true);
      
      showProgress('Đang upload thumbnail…', 60);
      const { url: tUrl } = await uploadToProxy(selectedFile, 'image', false);
      
      image_url = originalUrl;
      thumbnailUrl = tUrl;
      fileMd5 = originalMd5;
    } else {
      showProgress('Trích xuất thumbnail…', 10);
      const thumbBlob = await extractVideoThumbnail(selectedFile);
      
      showProgress('Đang upload thumbnail…', 30);
      const { url: tUrl } = await uploadToProxy(thumbBlob, 'image', false);
      thumbnailUrl = tUrl;

      showProgress('Đang upload video…', 60);
      const { url: vUrl, md5: vMd5 } = await uploadToProxy(selectedFile, 'video', false);
      videoUrl = vUrl;
      fileMd5 = vMd5;
      
      image_url = thumbnailUrl;
    }

    showProgress('Đang tạo post…', 90);
    
    // Build overlays
    const overlays = [];
    if (activeTab === 'text' && caption) {
        // Caption standard is handled by server fallback or we can add it here explicitly
    } else if (activeTab === 'music') {
      const musicUrlVal = document.getElementById('musicUrl').value.trim();
      if (musicUrlVal) {
        overlays.push({
          overlay_id: "music:standard",
          overlay_type: "music",
          data: {
            text: musicUrlVal, // Simplification for now, usually it's track metadata
            type: "standard"
          }
        });
      }
    } else if (activeTab === 'location') {
      const loc = document.getElementById('locationName').value.trim();
      if (loc) {
        overlays.push({
          overlay_id: "location:standard",
          overlay_type: "location",
          data: {
            name: loc,
            style: "standard"
          }
        });
      }
    }

    const postData = {
        idToken: session.idToken,
        data: {
          thumbnail_url: thumbnailUrl,
          image_url: image_url,
          video_url: videoUrl,
          md5: fileMd5,
          sent_to_all: audienceMode === 'all',
          sent_to_self_only: audienceMode === 'self',
          recipients: Array.from(selectedFriends),
          sent_to: Array.from(selectedFriends),
          overlays: overlays,
          restore_streak: restoreStreak.checked ? parseInt(streakValue.value) || 0 : 0
        },
        appCheck: securityTokens.appCheck,
        instanceId: securityTokens.instanceId
    };

    const res = await fetch('/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData)
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || errData?.error?.status || 'Lỗi khi tạo post');
    }

    showProgress('Thành công! 🎉', 100);
    showToast('Đã đăng lên Locket thành công!');
    setTimeout(hideProgress, 2000);
    clearFile();
    captionInput.value = '';
  } catch (err) {
    hideProgress();
    btnPost.disabled = false;
    showToast(`Lỗi: ${err.message}`, 'error');
  }
}

// Auto-refresh idToken khi expire (Firebase token hết hạn sau 1 giờ)
async function refreshIdToken() {
  if (!session?.refreshToken) throw new Error('No refresh token - please login again');
  const res = await fetch('/api/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: session.refreshToken,
      // apiKey không cần gửi – server tự lấy từ env
    }),
  });
  if (!res.ok) throw new Error('Token refresh failed - please login again');
  const data = await res.json();
  // Cập nhật session với token mới (encrypted)
  session.idToken = data.id_token;
  session.refreshToken = data.refresh_token;
  await CryptoStorage.set('locket_session', session);
  console.log('🔄 Token refreshed successfully');
  return data.id_token;
}

async function uploadToProxy(blob, type, isOriginal = false) {
  const doUpload = async (token) => {
    if (!session || !session.localId) {
      throw new Error('Bạn cần đăng nhập lại (Thiếu User ID)');
    }
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('userId', session.localId);
    formData.append('idToken', token);
    formData.append('type', type);
    formData.append('isOriginal', isOriginal);
    formData.append('bucket', 'locket-4252a.appspot.com');
    formData.append('appCheck', securityTokens.appCheck);
    formData.append('instanceId', securityTokens.instanceId);
    return fetch('/api/upload', { method: 'POST', body: formData });
  };

  let res = await doUpload(session.idToken);

  // Nếu 403, thử refresh token và upload lại 1 lần
  if (res.status === 403) {
    console.log('⚠️ Upload got 403 - refreshing token and retrying...');
    try {
      const newToken = await refreshIdToken();
      res = await doUpload(newToken);
    } catch (refreshErr) {
      throw new Error(refreshErr.message);
    }
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return { url: data.url, md5: data.md5 };
}

function showProgress(l, p) { progressWrap.style.display = ''; progressLabel.textContent = l; progressFill.style.width = p+'%'; }
function hideProgress() { progressWrap.style.display = 'none'; }

function extractVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.src = URL.createObjectURL(file);
    v.onloadeddata = () => v.currentTime = 0.1;
    v.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      c.toBlob(b => resolve(b), 'image/jpeg', 0.8);
    };
    v.onerror = reject;
  });
}

// ── FRIEND REQUESTS ───────────────────────────────────────────
async function fetchFriendRequests() {
  if (!session) return;
  const requestsCard = document.getElementById('requestsCard');
  const requestsList = document.getElementById('requestsList');
  const requestsCount = document.getElementById('requestsCount');
  
  requestsCard.style.display = 'block';
  requestsList.innerHTML = '<div class="friends-loading">Đang kiểm tra...</div>';
  
  try {
    const res = await fetch('/api/friends/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: session.localId,
        idToken: session.idToken,
        appCheck: securityTokens.appCheck,
        instanceId: securityTokens.instanceId
      }),
    });
    const data = await res.json();
    pendingRequests = data.invitations || [];
    requestsCount.textContent = pendingRequests.length;
    renderFriendRequests();
  } catch (err) {
    requestsList.innerHTML = `<div class="friends-empty">Lỗi: ${err.message}</div>`;
  }
}

function renderFriendRequests() {
  const requestsList = document.getElementById('requestsList');
  if (pendingRequests.length === 0) {
    requestsList.innerHTML = '<div class="friends-empty">Không có lời mời nào</div>';
    return;
  }

  requestsList.innerHTML = pendingRequests.map(req => `
    <div class="request-item">
      <div class="friend-info">
        <div class="friend-name">${req.display_name || req.username}</div>
        <div class="friend-username">@${req.username}</div>
      </div>
      <div class="request-actions">
        <button class="btn-action btn-accept" onclick="respondRequest('${req.contact_id}', 'accept')" title="Chấp nhận">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button class="btn-action btn-ignore" onclick="respondRequest('${req.contact_id}', 'ignore')" title="Bỏ qua">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

window.respondRequest = async (contactId, action) => {
  try {
    const res = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        idToken: session.idToken,
        contactId,
        action,
        appCheck: securityTokens.appCheck,
        instanceId: securityTokens.instanceId
      }),
    });
    if (res.ok) {
      showToast(action === 'accept' ? 'Đã chấp nhận kết bạn!' : 'Đã bỏ qua lời mời.');
      fetchFriendRequests();
      fetchFriends();
    }
  } catch (err) {
    showToast('Lỗi khi phản hồi: ' + err.message, 'error');
  }
};


// ── App Initialisation (async) ────────────────────────────────
async function initApp() {
  // 1. Init CryptoStorage (migrate dữ liệu plaintext cũ nếu có)
  await CryptoStorage.init();

  // 2. Load session đã được mã hoá
  await loadSession();

  // 3. Init UI
  initPresets();

  if (session?.idToken) {
    showUploadScreen();
    fetchFriendRequests();
  } else {
    showLoginScreen();
  }
}

initApp().catch(err => {
  console.error('❌ App init failed:', err);
});

