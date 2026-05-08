import Peer, { type DataConnection } from 'peerjs'
import {
  decrypt,
  decryptText,
  deriveSharedKey,
  encrypt,
  encryptText,
  exportPublicKey,
  fingerprint,
  generateKeyPair,
  importPublicKey,
} from './crypto'

/**
 * 协议帧 —— 在 PeerJS DataConnection 上传输的所有内容
 *
 * 流程：
 *   A 发起连接 → 双方互发 'handshake'（携带 ECDH 公钥）
 *   双方派生共享密钥后，状态变为 'ready'
 *   后续消息都是 'enc-msg' / 'enc-file-meta' / 'enc-file-chunk' / 'enc-file-end'
 */
type Frame =
  | { type: 'handshake'; publicKey: string; nickname: string }
  | { type: 'enc-msg'; payload: string; id: string; ts: number }
  | { type: 'enc-file-meta'; payload: string; id: string; ts: number }
  | { type: 'enc-file-chunk'; id: string; index: number; data: ArrayBuffer }
  | { type: 'enc-file-end'; id: string }
  | { type: 'enc-file-ack'; id: string; index: number }
  | { type: 'typing'; isTyping: boolean }

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'awaiting-peer'
  | 'handshaking'
  | 'ready'
  | 'disconnected'
  | 'error'

export interface IncomingMessage {
  id: string
  text: string
  ts: number
  fromMe: false
}

export interface IncomingFileMeta {
  id: string
  name: string
  size: number
  mime: string
  totalChunks: number
  ts: number
}

export interface ChatHandlers {
  onStatus: (status: ConnectionStatus, info?: string) => void
  onMessage: (msg: IncomingMessage) => void
  onFileMeta: (meta: IncomingFileMeta) => void
  onFileChunk: (id: string, index: number, total: number, decryptedChunk: ArrayBuffer) => void
  onFileComplete: (id: string) => void
  onFileProgress: (id: string, sent: number, total: number) => void
  onPeerNickname: (nickname: string) => void
  onSecurityCode: (code: string) => void
  onTyping: (isTyping: boolean) => void
  onError: (err: string) => void
}

export interface ChatOptions {
  nickname: string
  handlers: ChatHandlers
}

const FILE_CHUNK_SIZE = 64 * 1024 // 64KB 加密前明文块大小

export class ChatSession {
  private peer: Peer | null = null
  private conn: DataConnection | null = null
  private myKeys: CryptoKeyPair | null = null
  private sharedKey: CryptoKey | null = null
  private nickname: string
  private handlers: ChatHandlers
  private status: ConnectionStatus = 'idle'

  constructor(opts: ChatOptions) {
    this.nickname = opts.nickname
    this.handlers = opts.handlers
  }

  /** 创建房间：以 roomId 作为自己的 PeerJS ID 等待连接 */
  async host(roomId: string): Promise<void> {
    await this.initPeer(roomId)
    this.setStatus('awaiting-peer', '等待对方连接…')
  }

  /** 加入房间：连接到 host 那个 peerId */
  async join(roomId: string): Promise<void> {
    const myId = `${roomId}-${Math.random().toString(36).slice(2, 8)}`
    await this.initPeer(myId)
    this.setStatus('connecting', '正在连接对方…')
    const conn = this.peer!.connect(roomId, { reliable: true })
    this.bindConnection(conn)
  }

  /** 发送文本消息（已加密） */
  async sendMessage(text: string): Promise<{ id: string; ts: number }> {
    if (!this.conn || !this.sharedKey) throw new Error('未建立安全连接')
    const id = crypto.randomUUID()
    const ts = Date.now()
    const payload = await encryptText(this.sharedKey, text)
    const frame: Frame = { type: 'enc-msg', payload, id, ts }
    this.conn.send(frame)
    return { id, ts }
  }

  /** 发送"正在输入"信号（不加密，只是状态） */
  sendTyping(isTyping: boolean): void {
    if (!this.conn) return
    const frame: Frame = { type: 'typing', isTyping }
    try {
      this.conn.send(frame)
    } catch {
      /* 静默 */
    }
  }

  /**
   * 发送文件 —— 分块加密传输
   * 进度通过 onFileProgress 回调返回
   */
  async sendFile(
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<{ id: string; ts: number }> {
    if (!this.conn || !this.sharedKey) throw new Error('未建立安全连接')
    const id = crypto.randomUUID()
    const ts = Date.now()
    const totalChunks = Math.max(1, Math.ceil(file.size / FILE_CHUNK_SIZE))

    const meta = { name: file.name, size: file.size, mime: file.type, totalChunks, ts }
    const metaPayload = await encryptText(this.sharedKey, JSON.stringify(meta))
    this.conn.send({ type: 'enc-file-meta', payload: metaPayload, id, ts } satisfies Frame)

    let sent = 0
    for (let i = 0; i < totalChunks; i++) {
      const start = i * FILE_CHUNK_SIZE
      const end = Math.min(start + FILE_CHUNK_SIZE, file.size)
      const slice = await file.slice(start, end).arrayBuffer()
      const encrypted = await encrypt(this.sharedKey, slice)
      this.conn.send({
        type: 'enc-file-chunk',
        id,
        index: i,
        data: encrypted,
      } satisfies Frame)
      sent = end
      onProgress?.(sent, file.size)
      // 流控：让出主线程，避免一次塞爆 dataChannel
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0))
    }
    this.conn.send({ type: 'enc-file-end', id } satisfies Frame)
    return { id, ts }
  }

  /** 关闭并清理（包括密钥） */
  destroy(): void {
    try {
      this.conn?.close()
    } catch {
      /* */
    }
    try {
      this.peer?.destroy()
    } catch {
      /* */
    }
    this.conn = null
    this.peer = null
    this.myKeys = null
    this.sharedKey = null
    this.setStatus('disconnected')
  }

  // ---------------------- 内部 ----------------------

  private async initPeer(myId: string): Promise<void> {
    this.myKeys = await generateKeyPair()
    return new Promise((resolve, reject) => {
      const peer = new Peer(myId, {
        // 默认使用 PeerJS 公共云服务器（免费，仅用于信令）
        debug: 1,
      })
      this.peer = peer
      peer.on('open', () => resolve())
      peer.on('connection', (conn) => this.bindConnection(conn))
      peer.on('error', (err) => {
        this.handlers.onError(translatePeerError(err))
        if (this.status === 'idle' || this.status === 'connecting') {
          reject(err)
        }
        this.setStatus('error', err.message)
      })
      peer.on('disconnected', () => {
        this.setStatus('disconnected', '与信令服务器断开')
      })
    })
  }

  private bindConnection(conn: DataConnection): void {
    this.conn = conn
    conn.on('open', () => {
      this.setStatus('handshaking', '正在交换密钥…')
      void this.sendHandshake()
    })
    conn.on('data', (data) => {
      void this.handleFrame(data as Frame).catch((err) => {
        console.error('frame error', err)
        this.handlers.onError('解密失败：' + (err as Error).message)
      })
    })
    conn.on('close', () => this.setStatus('disconnected', '对方已断开'))
    conn.on('error', (err) => this.handlers.onError(err.message))
  }

  private async sendHandshake(): Promise<void> {
    if (!this.conn || !this.myKeys) return
    const pub = await exportPublicKey(this.myKeys.publicKey)
    const frame: Frame = { type: 'handshake', publicKey: pub, nickname: this.nickname }
    this.conn.send(frame)
  }

  // 用于按 id 缓存 chunks 的解密临时区
  private chunkBuffers = new Map<string, Map<number, ArrayBuffer>>()
  private chunkExpect = new Map<string, number>()

  private async handleFrame(frame: Frame): Promise<void> {
    switch (frame.type) {
      case 'handshake': {
        if (!this.myKeys) return
        const peerPub = await importPublicKey(frame.publicKey)
        this.sharedKey = await deriveSharedKey(this.myKeys.privateKey, peerPub)
        const code = await fingerprint(this.sharedKey)
        this.handlers.onSecurityCode(code)
        this.handlers.onPeerNickname(frame.nickname || '匿名')
        this.setStatus('ready', '安全连接已建立')
        break
      }
      case 'enc-msg': {
        if (!this.sharedKey) return
        const text = await decryptText(this.sharedKey, frame.payload)
        this.handlers.onMessage({ id: frame.id, text, ts: frame.ts, fromMe: false })
        break
      }
      case 'enc-file-meta': {
        if (!this.sharedKey) return
        const json = await decryptText(this.sharedKey, frame.payload)
        const meta = JSON.parse(json) as Omit<IncomingFileMeta, 'id'>
        this.chunkBuffers.set(frame.id, new Map())
        this.chunkExpect.set(frame.id, meta.totalChunks)
        this.handlers.onFileMeta({ ...meta, id: frame.id })
        break
      }
      case 'enc-file-chunk': {
        if (!this.sharedKey) return
        const total = this.chunkExpect.get(frame.id) ?? 0
        const buf = this.chunkBuffers.get(frame.id)
        if (!buf) return
        const plain = await decrypt(this.sharedKey, frame.data)
        buf.set(frame.index, plain)
        this.handlers.onFileChunk(frame.id, frame.index, total, plain)
        break
      }
      case 'enc-file-end': {
        this.handlers.onFileComplete(frame.id)
        this.chunkBuffers.delete(frame.id)
        this.chunkExpect.delete(frame.id)
        break
      }
      case 'enc-file-ack':
        // 预留：发送方可基于 ack 实现更精细的进度
        break
      case 'typing':
        this.handlers.onTyping(frame.isTyping)
        break
    }
  }

  private setStatus(status: ConnectionStatus, info?: string): void {
    this.status = status
    this.handlers.onStatus(status, info)
  }
}

function translatePeerError(err: { type?: string; message: string }): string {
  switch (err.type) {
    case 'peer-unavailable':
      return '对方不在线或房间号不存在'
    case 'network':
      return '网络异常，请检查连接'
    case 'server-error':
      return '信令服务器暂不可用，稍后重试'
    case 'unavailable-id':
      return '房间号已被占用，请换一个'
    case 'browser-incompatible':
      return '浏览器不支持 WebRTC'
    default:
      return err.message || '未知错误'
  }
}
