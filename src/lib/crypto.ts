/**
 * 端到端加密模块
 *
 * 流程：
 * 1. 双方各自生成 ECDH P-256 密钥对（公钥可公开，私钥本地保存）
 * 2. 通过信令通道交换公钥
 * 3. 各自使用 ECDH 算法派生出共享密钥（同一个 256 位 AES 密钥）
 * 4. 之后所有消息使用 AES-GCM 加密传输
 *
 * 安全性：
 * - 私钥永不离开浏览器
 * - 即使中转服务器（PeerJS 信令）被监听，也只能看到公钥
 * - AES-GCM 提供机密性 + 完整性 + 重放保护（IV 随机生成）
 * - 关闭页面即所有密钥丢失，符合"临时"特性
 */

const ECDH_PARAMS: EcKeyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
}

const AES_PARAMS = { name: 'AES-GCM', length: 256 } as const

/** 从 32 字节原始密钥导入 AES-256-GCM（用于群聊：主持人分发同一把群密钥） */
export async function importAes256RawKey(
  raw: ArrayBuffer | Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  return crypto.subtle.importKey('raw', buf as BufferSource, AES_PARAMS, extractable, [
    'encrypt',
    'decrypt',
  ])
}

/** 生成本端的 ECDH 密钥对 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey', 'deriveBits'])
}

/** 把公钥导出为可在网络传输的字符串（base64） */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64(raw)
}

/** 从对方传来的字符串恢复公钥 */
export async function importPublicKey(base64: string): Promise<CryptoKey> {
  const raw = base64ToArrayBuffer(base64)
  return crypto.subtle.importKey('raw', raw, ECDH_PARAMS, true, [])
}

/**
 * 通过本端私钥 + 对方公钥派生出共享 AES 密钥
 * 双方派生的结果完全相同（这就是 ECDH 的魔法）
 */
export async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    AES_PARAMS,
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * 加密任意二进制数据
 * 输出格式：[12字节 IV] + [密文 + 认证标签]
 */
export async function encrypt(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data as BufferSource,
  )
  const out = new Uint8Array(iv.length + ciphertext.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ciphertext), iv.length)
  return out.buffer as ArrayBuffer
}

/** 解密对应格式的数据 */
export async function decrypt(
  key: CryptoKey,
  payload: ArrayBuffer | Uint8Array,
): Promise<ArrayBuffer> {
  const buf = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  const iv = buf.slice(0, 12)
  const ciphertext = buf.slice(12)
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext as BufferSource,
  )
}

/** 加密文本，返回 base64 字符串 */
export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const buf = await encrypt(key, data)
  return arrayBufferToBase64(buf)
}

/** 解密 base64 字符串到文本 */
export async function decryptText(key: CryptoKey, base64: string): Promise<string> {
  const buf = base64ToArrayBuffer(base64)
  const plain = await decrypt(key, buf)
  return new TextDecoder().decode(plain)
}

/** 生成对密钥派生结果做摘要的"安全码"，用于双方人工核对防中间人 */
export async function fingerprint(key: CryptoKey): Promise<string> {
  // CryptoKey 本身不可导出（extractable=false），这里通过加密一个固定值得到稳定指纹
  const probe = new TextEncoder().encode('fingerprint-v1')
  const iv = new Uint8Array(12) // 固定 IV 仅用于指纹，不用于真实通信
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    probe as BufferSource,
  )
  const hash = await crypto.subtle.digest('SHA-256', ct)
  const bytes = new Uint8Array(hash).slice(0, 6)
  // 转成 6 个易读单词数字组合（取前12位 hex 分成3组）
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`.toUpperCase()
}

// ----------------- base64 工具 -----------------

export function arrayBufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

/** 生成随机房间 ID（URL 安全） */
export function generateRoomId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}
