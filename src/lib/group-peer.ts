import Peer, { type DataConnection } from 'peerjs'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  decrypt,
  decryptText,
  deriveSharedKey,
  encrypt,
  encryptText,
  exportPublicKey,
  fingerprint,
  generateKeyPair,
  importAes256RawKey,
  importPublicKey,
} from './crypto'
import {
  type ChatHandlers,
  type ConnectionStatus,
  type IncomingFileMeta,
} from './peer'

/**
 * 群聊（星型拓扑，零额外服务器）：
 * - 主持人 PeerID = 房间号，成员只与主持人建立 DataConnection
 * - 主持人生成 32 字节群密钥，用与每位成员的 ECDH 派生密钥分别加密后下发
 * - 聊天与文件：成员 → 主持人 → 原样转发密文给其他成员（主持人不解密内容）
 * - 主持人发言：直接向所有成员广播 relay 帧
 *
 * 限制：主持人离线则群不可用；成员上限见 MAX_GROUP_MEMBERS。
 */

const FILE_CHUNK_SIZE = 64 * 1024
export const MAX_GROUP_MEMBERS = 14

type MemberFrame =
  | { type: 'handshake'; publicKey: string; nickname: string }
  | { type: 'group-key'; payload: string }
  | { type: 'enc-msg'; payload: string; id: string; ts: number }
  | { type: 'enc-file-meta'; payload: string; id: string; ts: number }
  | { type: 'enc-file-chunk'; id: string; index: number; data: ArrayBuffer }
  | { type: 'enc-file-end'; id: string }
  | { type: 'typing'; isTyping: boolean }
  | { type: 'room-full'; message: string }

type RelayFrame =
  | {
      type: 'relay'
      kind: 'msg'
      fromPeer: string
      fromNick: string
      id: string
      ts: number
      payload: string
    }
  | {
      type: 'relay'
      kind: 'file-meta'
      fromPeer: string
      fromNick: string
      id: string
      ts: number
      payload: string
    }
  | {
      type: 'relay'
      kind: 'file-chunk'
      fromPeer: string
      fromNick: string
      id: string
      index: number
      data: ArrayBuffer
    }
  | { type: 'relay'; kind: 'file-end'; fromPeer: string; fromNick: string; id: string }
  | { type: 'relay-typing'; fromPeer: string; fromNick: string; isTyping: boolean }
  | { type: 'roster'; payload: string }

type HostInbound = MemberFrame
type AnyFrame = MemberFrame | RelayFrame

export interface GroupChatHandlers extends ChatHandlers {
  onRoster: (members: { id: string; nickname: string }[]) => void
}

export interface GroupChatOptions {
  nickname: string
  handlers: GroupChatHandlers
}

interface MemberSlot {
  conn: DataConnection
  pairwiseKey: CryptoKey | null
  nickname: string
  ready: boolean
}

export class GroupChatSession {
  private peer: Peer | null = null
  private role: 'host' | 'member' = 'member'
  private memberConn: DataConnection | null = null
  private myKeys: CryptoKeyPair | null = null
  private pairwiseKey: CryptoKey | null = null
  private groupKey: CryptoKey | null = null
  private groupKeyRaw: Uint8Array | null = null
  private nickname: string
  private handlers: GroupChatHandlers
  private status: ConnectionStatus = 'idle'
  private hostPeerId: string | null = null
  private members = new Map<string, MemberSlot>()
  /** 成员端：接收文件分块缓存 */
  private chunkBuffers = new Map<string, Map<number, ArrayBuffer>>()
  private chunkExpect = new Map<string, number>()
  /** 主持人端：接收成员发来的文件时本地解密组包 */
  private hostChunkBuffers = new Map<string, Map<number, ArrayBuffer>>()
  private hostChunkExpect = new Map<string, number>()

  constructor(opts: GroupChatOptions) {
    this.nickname = opts.nickname
    this.handlers = opts.handlers
  }

  async host(roomId: string): Promise<void> {
    this.role = 'host'
    this.hostPeerId = roomId
    await this.initHostPeer(roomId)
  }

  async join(roomId: string): Promise<void> {
    this.role = 'member'
    const myId = `${roomId}-${Math.random().toString(36).slice(2, 8)}`
    await this.initMemberPeer(myId)
    this.setStatus('connecting', '正在连接主持人…')
    const conn = this.peer!.connect(roomId, { reliable: true })
    this.bindMemberConnection(conn)
  }

  async sendMessage(text: string): Promise<{ id: string; ts: number }> {
    if (!this.groupKey) throw new Error('未加入群密钥')
    const id = crypto.randomUUID()
    const ts = Date.now()
    const payload = await encryptText(this.groupKey, text)
    if (this.role === 'host') {
      const relay: RelayFrame = {
        type: 'relay',
        kind: 'msg',
        fromPeer: this.hostPeerId!,
        fromNick: this.nickname,
        id,
        ts,
        payload,
      }
      this.broadcastToMembers(relay)
    } else {
      if (!this.memberConn) throw new Error('未连接')
      this.memberConn.send({ type: 'enc-msg', payload, id, ts } satisfies MemberFrame)
    }
    return { id, ts }
  }

  sendTyping(isTyping: boolean): void {
    if (this.role === 'host') {
      const rf: RelayFrame = {
        type: 'relay-typing',
        fromPeer: this.hostPeerId!,
        fromNick: this.nickname,
        isTyping,
      }
      this.broadcastToMembers(rf)
      return
    }
    if (!this.memberConn) return
    try {
      this.memberConn.send({ type: 'typing', isTyping } satisfies MemberFrame)
    } catch {
      /* */
    }
  }

  async sendFile(
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ): Promise<{ id: string; ts: number }> {
    if (!this.groupKey) throw new Error('未加入群密钥')
    const id = crypto.randomUUID()
    const ts = Date.now()
    const totalChunks = Math.max(1, Math.ceil(file.size / FILE_CHUNK_SIZE))
    const meta = { name: file.name, size: file.size, mime: file.type, totalChunks, ts }
    const metaPayload = await encryptText(this.groupKey, JSON.stringify(meta))

    const sendMetaAndChunks = async (post: (f: AnyFrame) => void) => {
      post({ type: 'enc-file-meta', payload: metaPayload, id, ts } satisfies MemberFrame)
      let sent = 0
      for (let i = 0; i < totalChunks; i++) {
        const start = i * FILE_CHUNK_SIZE
        const end = Math.min(start + FILE_CHUNK_SIZE, file.size)
        const slice = await file.slice(start, end).arrayBuffer()
        const encrypted = await encrypt(this.groupKey!, slice)
        post({
          type: 'enc-file-chunk',
          id,
          index: i,
          data: encrypted,
        } satisfies MemberFrame)
        sent = end
        onProgress?.(sent, file.size)
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0))
      }
      post({ type: 'enc-file-end', id } satisfies MemberFrame)
    }

    if (this.role === 'host') {
      await sendMetaAndChunks((f) => this.broadcastRelayFileFromHost(f as MemberFrame, id, ts, metaPayload))
    } else {
      if (!this.memberConn) throw new Error('未连接')
      await sendMetaAndChunks((f) => this.memberConn!.send(f))
    }
    return { id, ts }
  }

  /** 主持人：把本地文件帧转成 relay 广播（不解密） */
  private broadcastRelayFileFromHost(
    frame: MemberFrame,
    fileId: string,
    ts: number,
    metaPayload: string,
  ): void {
    const fromPeer = this.hostPeerId!
    const fromNick = this.nickname
    if (frame.type === 'enc-file-meta') {
      const r: RelayFrame = {
        type: 'relay',
        kind: 'file-meta',
        fromPeer,
        fromNick,
        id: fileId,
        ts,
        payload: metaPayload,
      }
      this.broadcastToMembers(r)
    } else if (frame.type === 'enc-file-chunk') {
      const r: RelayFrame = {
        type: 'relay',
        kind: 'file-chunk',
        fromPeer,
        fromNick,
        id: frame.id,
        index: frame.index,
        data: frame.data,
      }
      this.broadcastToMembers(r)
    } else if (frame.type === 'enc-file-end') {
      const r: RelayFrame = {
        type: 'relay',
        kind: 'file-end',
        fromPeer,
        fromNick,
        id: frame.id,
      }
      this.broadcastToMembers(r)
    }
  }

  destroy(): void {
    for (const { conn } of this.members.values()) {
      try {
        conn.close()
      } catch {
        /* */
      }
    }
    this.members.clear()
    try {
      this.memberConn?.close()
    } catch {
      /* */
    }
    try {
      this.peer?.destroy()
    } catch {
      /* */
    }
    this.memberConn = null
    this.peer = null
    this.myKeys = null
    this.pairwiseKey = null
    this.groupKey = null
    this.groupKeyRaw = null
    this.hostChunkBuffers.clear()
    this.hostChunkExpect.clear()
    this.setStatus('disconnected')
  }

  // ---------- host ----------

  private async initHostPeer(roomId: string): Promise<void> {
    this.myKeys = await generateKeyPair()
    this.groupKeyRaw = crypto.getRandomValues(new Uint8Array(32))
    this.groupKey = await importAes256RawKey(this.groupKeyRaw, false)
    const code = await fingerprint(this.groupKey)
    this.handlers.onSecurityCode(code)

    return new Promise((resolve, reject) => {
      const peer = new Peer(roomId, { debug: 1 })
      this.peer = peer
      peer.on('open', () => {
        this.hostPeerId = peer.id
        this.setStatus('ready', '群聊已就绪，可邀请成员加入')
        void this.broadcastRoster()
        resolve()
      })
      peer.on('connection', (conn) => this.onIncomingMember(conn))
      peer.on('error', (err) => {
        this.handlers.onError(translatePeerError(err))
        if (this.status === 'idle') reject(err)
        this.setStatus('error', err.message)
      })
      peer.on('disconnected', () => {
        this.setStatus('disconnected', '与信令服务器断开')
      })
    })
  }

  private onIncomingMember(conn: DataConnection): void {
    if (this.members.size >= MAX_GROUP_MEMBERS) {
      try {
        conn.send({ type: 'room-full', message: `群人数已达上限（${MAX_GROUP_MEMBERS}）` } satisfies MemberFrame)
      } catch {
        /* */
      }
      setTimeout(() => conn.close(), 300)
      return
    }

    this.members.set(conn.peer, {
      conn,
      pairwiseKey: null,
      nickname: '',
      ready: false,
    })

    conn.on('open', () => {
      void this.sendHandshakeOnConn(conn)
    })
    conn.on('data', (data) => {
      void this.handleHostInbound(conn, data as HostInbound | RelayFrame).catch((err) => {
        console.error(err)
        this.handlers.onError('处理消息失败：' + (err as Error).message)
      })
    })
    conn.on('close', () => {
      this.members.delete(conn.peer)
      void this.broadcastRoster()
    })
    conn.on('error', (err) => this.handlers.onError(err.message))
  }

  private async sendHandshakeOnConn(conn: DataConnection): Promise<void> {
    if (!this.myKeys) return
    const pub = await exportPublicKey(this.myKeys.publicKey)
    conn.send({ type: 'handshake', publicKey: pub, nickname: this.nickname } satisfies MemberFrame)
  }

  private async handleHostInbound(conn: DataConnection, data: HostInbound | RelayFrame): Promise<void> {
    const slot = this.members.get(conn.peer)
    if (!slot) return

    if (data.type === 'handshake') {
      if (!this.myKeys || !this.groupKeyRaw || slot.ready) return
      const peerPub = await importPublicKey(data.publicKey)
      const pk = await deriveSharedKey(this.myKeys.privateKey, peerPub)
      slot.pairwiseKey = pk
      slot.nickname = data.nickname || '成员'
      const wrapped = await encrypt(pk, this.groupKeyRaw)
      const payload = arrayBufferToBase64(wrapped)
      conn.send({ type: 'group-key', payload } satisfies MemberFrame)
      slot.ready = true
      await this.broadcastRoster()
      return
    }

    if (data.type === 'room-full') return

    if (data.type === 'group-key') return

    if (!slot.ready) return

    const fromPeer = conn.peer
    const fromNick = slot.nickname

    if (!this.groupKey) return

    switch (data.type) {
      case 'enc-msg': {
        const text = await decryptText(this.groupKey, data.payload)
        this.handlers.onMessage({
          id: data.id,
          text,
          ts: data.ts,
          fromMe: false,
          senderNickname: fromNick,
        })
        this.broadcastToMembersExcept(fromPeer, {
          type: 'relay',
          kind: 'msg',
          fromPeer,
          fromNick,
          id: data.id,
          ts: data.ts,
          payload: data.payload,
        })
        break
      }
      case 'enc-file-meta': {
        const json = await decryptText(this.groupKey, data.payload)
        const meta = JSON.parse(json) as Omit<IncomingFileMeta, 'id' | 'senderNickname'>
        this.hostChunkBuffers.set(data.id, new Map())
        this.hostChunkExpect.set(data.id, meta.totalChunks)
        this.handlers.onFileMeta({
          ...meta,
          id: data.id,
          senderNickname: fromNick,
        })
        this.broadcastToMembersExcept(fromPeer, {
          type: 'relay',
          kind: 'file-meta',
          fromPeer,
          fromNick,
          id: data.id,
          ts: data.ts,
          payload: data.payload,
        })
        break
      }
      case 'enc-file-chunk': {
        const total = this.hostChunkExpect.get(data.id) ?? 0
        const buf = this.hostChunkBuffers.get(data.id)
        if (buf) {
          const plain = await decrypt(this.groupKey, data.data)
          buf.set(data.index, plain)
          this.handlers.onFileChunk(data.id, data.index, total, plain)
        }
        this.broadcastToMembersExcept(fromPeer, {
          type: 'relay',
          kind: 'file-chunk',
          fromPeer,
          fromNick,
          id: data.id,
          index: data.index,
          data: data.data,
        })
        break
      }
      case 'enc-file-end': {
        this.handlers.onFileComplete(data.id)
        this.hostChunkBuffers.delete(data.id)
        this.hostChunkExpect.delete(data.id)
        this.broadcastToMembersExcept(fromPeer, {
          type: 'relay',
          kind: 'file-end',
          fromPeer,
          fromNick,
          id: data.id,
        })
        break
      }
      case 'typing':
        this.handlers.onTyping(data.isTyping, fromNick)
        this.broadcastToMembersExcept(fromPeer, {
          type: 'relay-typing',
          fromPeer,
          fromNick,
          isTyping: data.isTyping,
        })
        break
      default:
        break
    }
  }

  private broadcastToMembers(frame: RelayFrame): void {
    for (const { conn, ready } of this.members.values()) {
      if (!ready) continue
      try {
        conn.send(frame)
      } catch {
        /* */
      }
    }
  }

  private broadcastToMembersExcept(exceptPeer: string, frame: RelayFrame): void {
    for (const [pid, { conn, ready }] of this.members) {
      if (pid === exceptPeer || !ready) continue
      try {
        conn.send(frame)
      } catch {
        /* */
      }
    }
  }

  private async broadcastRoster(): Promise<void> {
    if (!this.groupKey || !this.hostPeerId) return
    const list: { id: string; nickname: string }[] = [
      { id: this.hostPeerId, nickname: this.nickname },
    ]
    for (const [id, slot] of this.members) {
      if (slot.ready) list.push({ id, nickname: slot.nickname })
    }
    const payload = await encryptText(this.groupKey, JSON.stringify(list))
    const frame: RelayFrame = { type: 'roster', payload }
    this.handlers.onRoster(list)
    this.broadcastToMembers(frame)
  }

  // ---------- member ----------

  private async initMemberPeer(myId: string): Promise<void> {
    this.myKeys = await generateKeyPair()
    return new Promise((resolve, reject) => {
      const peer = new Peer(myId, { debug: 1 })
      this.peer = peer
      peer.on('open', () => resolve())
      peer.on('error', (err) => {
        this.handlers.onError(translatePeerError(err))
        if (this.status === 'idle' || this.status === 'connecting') reject(err)
        this.setStatus('error', err.message)
      })
      peer.on('disconnected', () => {
        this.setStatus('disconnected', '与信令服务器断开')
      })
    })
  }

  private bindMemberConnection(conn: DataConnection): void {
    this.memberConn = conn
    conn.on('open', () => {
      this.setStatus('handshaking', '正在加入群聊…')
      void this.sendMemberHandshake()
    })
    conn.on('data', (data) => {
      void this.handleMemberFrame(data as AnyFrame).catch((err) => {
        console.error(err)
        this.handlers.onError('解密失败：' + (err as Error).message)
      })
    })
    conn.on('close', () => this.setStatus('disconnected', '已与群聊断开'))
    conn.on('error', (err) => this.handlers.onError(err.message))
  }

  private async sendMemberHandshake(): Promise<void> {
    if (!this.memberConn || !this.myKeys) return
    const pub = await exportPublicKey(this.myKeys.publicKey)
    this.memberConn.send({
      type: 'handshake',
      publicKey: pub,
      nickname: this.nickname,
    } satisfies MemberFrame)
  }

  private async handleMemberFrame(frame: AnyFrame): Promise<void> {
    if (frame.type === 'room-full') {
      this.handlers.onError(frame.message)
      this.setStatus('error', frame.message)
      return
    }

    if (frame.type === 'handshake') {
      if (!this.myKeys) return
      const peerPub = await importPublicKey(frame.publicKey)
      this.pairwiseKey = await deriveSharedKey(this.myKeys.privateKey, peerPub)
      this.handlers.onPeerNickname(frame.nickname || '主持人')
      return
    }

    if (frame.type === 'group-key') {
      if (!this.pairwiseKey) return
      const plain = await decrypt(this.pairwiseKey, base64ToArrayBuffer(frame.payload))
      this.groupKey = await importAes256RawKey(plain, false)
      const code = await fingerprint(this.groupKey)
      this.handlers.onSecurityCode(code)
      this.setStatus('ready', '已加入加密群聊')
      return
    }

    if (frame.type === 'roster') {
      if (!this.groupKey) return
      const json = await decryptText(this.groupKey, frame.payload)
      const list = JSON.parse(json) as { id: string; nickname: string }[]
      this.handlers.onRoster(list)
      return
    }

    if (!this.groupKey) return

    if (frame.type === 'relay-typing') {
      this.handlers.onTyping(frame.isTyping, frame.fromNick)
      return
    }

    if (frame.type === 'relay') {
      await this.handleMemberRelay(frame)
    }
  }

  private async handleMemberRelay(r: RelayFrame): Promise<void> {
    if (r.type !== 'relay' || !this.groupKey) return
    const sender = r.fromNick

    switch (r.kind) {
      case 'msg': {
        const text = await decryptText(this.groupKey, r.payload)
        this.handlers.onMessage({
          id: r.id,
          text,
          ts: r.ts,
          fromMe: false,
          senderNickname: sender,
        })
        break
      }
      case 'file-meta': {
        const json = await decryptText(this.groupKey, r.payload)
        const meta = JSON.parse(json) as Omit<IncomingFileMeta, 'id' | 'senderNickname'>
        this.chunkBuffers.set(r.id, new Map())
        this.chunkExpect.set(r.id, meta.totalChunks)
        this.handlers.onFileMeta({
          ...meta,
          id: r.id,
          senderNickname: sender,
        })
        break
      }
      case 'file-chunk': {
        const total = this.chunkExpect.get(r.id) ?? 0
        const buf = this.chunkBuffers.get(r.id)
        if (!buf) return
        const plain = await decrypt(this.groupKey, r.data)
        buf.set(r.index, plain)
        this.handlers.onFileChunk(r.id, r.index, total, plain)
        break
      }
      case 'file-end': {
        this.handlers.onFileComplete(r.id)
        this.chunkBuffers.delete(r.id)
        this.chunkExpect.delete(r.id)
        break
      }
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
      return '主持人不在线或房间号不存在'
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
