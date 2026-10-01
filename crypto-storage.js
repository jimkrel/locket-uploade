/**
 * crypto-storage.js
 * Mã hoá localStorage bằng AES-GCM 256-bit (Web Crypto API – native browser)
 *
 * Nguyên lý:
 *  - CryptoKey sinh ngẫu nhiên khi tab load, lưu tạm trong sessionStorage (mất khi đóng tab)
 *  - Mọi dữ liệu lưu localStorage đều được encrypt: base64(iv[12 bytes] + ciphertext)
 *  - Mỗi lần encrypt dùng IV khác nhau → không thể brute-force
 */

const CryptoStorage = (() => {
  const SESSION_KEY_NAME = '__lk_sk__';
  const ALGO = 'AES-GCM';
  const KEY_LENGTH = 256;
  const IV_LENGTH = 12; // bytes (96 bits – recommended cho AES-GCM)

  let _cryptoKey = null;

  /** Chuyển ArrayBuffer ↔ Base64 */
  function bufToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }
  function b64ToBuf(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  /** Sinh hoặc khôi phục CryptoKey từ sessionStorage */
  async function getKey() {
    if (_cryptoKey) return _cryptoKey;

    const stored = sessionStorage.getItem(SESSION_KEY_NAME);
    if (stored) {
      try {
        const rawKey = b64ToBuf(stored);
        _cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: ALGO }, false, ['encrypt', 'decrypt']);
        return _cryptoKey;
      } catch (_) {
        // Key hỏng → sinh mới
      }
    }

    // Sinh key mới
    _cryptoKey = await crypto.subtle.generateKey({ name: ALGO, length: KEY_LENGTH }, true, ['encrypt', 'decrypt']);
    const exported = await crypto.subtle.exportKey('raw', _cryptoKey);
    sessionStorage.setItem(SESSION_KEY_NAME, bufToB64(exported));
    return _cryptoKey;
  }

  /**
   * Khởi tạo CryptoStorage – gọi trước khi dùng bất kỳ method nào
   * Cũng migrate data plaintext cũ (nếu có) sang dạng mã hoá
   */
  async function init() {
    await getKey();
    // Migrate data cũ (plaintext) sang encrypted nếu tồn tại
    const OLD_KEYS = ['locket_session', 'locket_security'];
    for (const k of OLD_KEYS) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        // Nếu parse được JSON → đây là data plaintext cũ → re-encrypt
        const parsed = JSON.parse(raw);
        await set(k, parsed);
        console.log(`[CryptoStorage] Migrated plaintext key: ${k}`);
      } catch (_) {
        // Đã là encrypted hoặc corrupt → bỏ qua
      }
    }
  }

  /** Encrypt JSON value → lưu localStorage */
  async function set(key, value) {
    const key_ = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key_, encoded);

    // Ghép iv + ciphertext rồi base64
    const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), IV_LENGTH);
    localStorage.setItem(key, bufToB64(combined.buffer));
  }

  /** Đọc từ localStorage → decrypt → trả về object */
  async function get(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      const key_ = await getKey();
      const combined = new Uint8Array(b64ToBuf(raw));
      const iv = combined.slice(0, IV_LENGTH);
      const ciphertext = combined.slice(IV_LENGTH).buffer;
      const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key_, ciphertext);
      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      // Có thể là data plaintext cũ chưa được migrate
      try {
        const plain = localStorage.getItem(key);
        if (plain) return JSON.parse(plain);
      } catch (_) {}
      console.warn(`[CryptoStorage] Cannot decrypt key: ${key}`);
      return null;
    }
  }

  /** Xoá key khỏi localStorage */
  function remove(key) {
    localStorage.removeItem(key);
  }

  /** Xoá toàn bộ session data */
  function clearAll() {
    remove('locket_session');
    remove('locket_security');
    sessionStorage.removeItem(SESSION_KEY_NAME);
    _cryptoKey = null;
  }

  return { init, set, get, remove, clearAll };
})();
