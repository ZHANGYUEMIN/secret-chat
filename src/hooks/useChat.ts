import { useCallback, useEffect, useRef, useState } from 'react'
import { GroupChatSession } from '../lib/group-peer'
import {
  ChatSession,
  type ConnectionStatus,
  type IncomingFileMeta,
} from '../lib/peer'

export type ChatMode = 'dm' | 'group'

export type ChatMessageItem =
  | {
      kind: 'text'
      id: string
      text: string
      ts: number
      fromMe: boolean
      /** 群聊展示用发送者昵称 */
      senderLabel?: string
    }
  | {
      kind: 'file'
      id: string
      name: string
      size: number
      mime: string
      ts: number
      fromMe: boolean
      progress: number
      done: boolean
      blobUrl?: string
      senderLabel?: string
    }
  | {
      kind: 'system'
      id: string
      text: string
      ts: number
    }

export interface UseChatState {
  mode: ChatMode
  status: ConnectionStatus
  statusInfo: string
  messages: ChatMessageItem[]
  /** 一对一：对方昵称；群聊：主持人昵称（或首个联系人） */
  peerNickname: string
  /** 群成员列表（含主持人） */
  members: { id: string; nickname: string }[]
  securityCode: string
  peerTyping: boolean
  /** 群聊：正在输入的昵称列表 */
  typingPeers: string[]
  error: string | null
}

export interface UseChatActions {
  host(roomId: string, nickname: string, mode: ChatMode): Promise<void>
  join(roomId: string, nickname: string, mode: ChatMode): Promise<void>
  sendMessage(text: string): Promise<void>
  sendFile(file: File): Promise<void>
  sendTyping(isTyping: boolean): void
  disconnect(): void
  burnAll(): void
}

export function useChat(): UseChatState & UseChatActions {
  const sessionRef = useRef<ChatSession | GroupChatSession | null>(null)
  const [mode, setMode] = useState<ChatMode>('dm')
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [statusInfo, setStatusInfo] = useState('')
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [peerNickname, setPeerNickname] = useState('')
  const [members, setMembers] = useState<{ id: string; nickname: string }[]>([])
  const [securityCode, setSecurityCode] = useState('')
  const [peerTyping, setPeerTyping] = useState(false)
  const [typingPeers, setTypingPeers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const incomingFiles = useRef(
    new Map<
      string,
      {
        meta: IncomingFileMeta
        chunks: Map<number, ArrayBuffer>
      }
    >(),
  )

  const buildDmSession = useCallback((nickname: string) => {
    setMode('dm')
    const session = new ChatSession({
      nickname,
      handlers: {
        onStatus: (s, info) => {
          setStatus(s)
          if (info) setStatusInfo(info)
          if (s === 'ready') setError(null)
        },
        onError: (msg) => setError(msg),
        onMessage: (m) => {
          setMessages((prev) => [
            ...prev,
            {
              kind: 'text',
              id: m.id,
              text: m.text,
              ts: m.ts,
              fromMe: false,
              senderLabel: m.senderNickname,
            },
          ])
        },
        onFileMeta: (meta) => {
          incomingFiles.current.set(meta.id, { meta, chunks: new Map() })
          setMessages((prev) => [
            ...prev,
            {
              kind: 'file',
              id: meta.id,
              name: meta.name,
              size: meta.size,
              mime: meta.mime,
              ts: meta.ts,
              fromMe: false,
              progress: 0,
              done: false,
              senderLabel: meta.senderNickname,
            },
          ])
        },
        onFileChunk: (id, index, total, chunk) => {
          const entry = incomingFiles.current.get(id)
          if (!entry) return
          entry.chunks.set(index, chunk)
          const progress = entry.chunks.size / Math.max(1, total)
          setMessages((prev) =>
            prev.map((m) =>
              m.kind === 'file' && m.id === id ? { ...m, progress } : m,
            ),
          )
        },
        onFileComplete: (id) => {
          const entry = incomingFiles.current.get(id)
          if (!entry) return
          const ordered: ArrayBuffer[] = []
          const total = entry.meta.totalChunks
          for (let i = 0; i < total; i++) {
            const c = entry.chunks.get(i)
            if (c) ordered.push(c)
          }
          const blob = new Blob(ordered, { type: entry.meta.mime || 'application/octet-stream' })
          const blobUrl = URL.createObjectURL(blob)
          incomingFiles.current.delete(id)
          setMessages((prev) =>
            prev.map((m) =>
              m.kind === 'file' && m.id === id
                ? { ...m, progress: 1, done: true, blobUrl }
                : m,
            ),
          )
        },
        onFileProgress: () => {},
        onPeerNickname: (n) => setPeerNickname(n),
        onSecurityCode: (c) => setSecurityCode(c),
        onTyping: (t, _from) => setPeerTyping(t),
      },
    })
    sessionRef.current = session
    return session
  }, [])

  const buildGroupSession = useCallback((nickname: string) => {
    setMode('group')
    const session = new GroupChatSession({
      nickname,
      handlers: {
        onStatus: (s, info) => {
          setStatus(s)
          if (info) setStatusInfo(info)
          if (s === 'ready') setError(null)
        },
        onError: (msg) => setError(msg),
        onMessage: (m) => {
          setMessages((prev) => [
            ...prev,
            {
              kind: 'text',
              id: m.id,
              text: m.text,
              ts: m.ts,
              fromMe: false,
              senderLabel: m.senderNickname,
            },
          ])
        },
        onFileMeta: (meta) => {
          incomingFiles.current.set(meta.id, { meta, chunks: new Map() })
          setMessages((prev) => [
            ...prev,
            {
              kind: 'file',
              id: meta.id,
              name: meta.name,
              size: meta.size,
              mime: meta.mime,
              ts: meta.ts,
              fromMe: false,
              progress: 0,
              done: false,
              senderLabel: meta.senderNickname,
            },
          ])
        },
        onFileChunk: (id, index, total, chunk) => {
          const entry = incomingFiles.current.get(id)
          if (!entry) return
          entry.chunks.set(index, chunk)
          const progress = entry.chunks.size / Math.max(1, total)
          setMessages((prev) =>
            prev.map((m) =>
              m.kind === 'file' && m.id === id ? { ...m, progress } : m,
            ),
          )
        },
        onFileComplete: (id) => {
          const entry = incomingFiles.current.get(id)
          if (!entry) return
          const ordered: ArrayBuffer[] = []
          const total = entry.meta.totalChunks
          for (let i = 0; i < total; i++) {
            const c = entry.chunks.get(i)
            if (c) ordered.push(c)
          }
          const blob = new Blob(ordered, { type: entry.meta.mime || 'application/octet-stream' })
          const blobUrl = URL.createObjectURL(blob)
          incomingFiles.current.delete(id)
          setMessages((prev) =>
            prev.map((m) =>
              m.kind === 'file' && m.id === id
                ? { ...m, progress: 1, done: true, blobUrl }
                : m,
            ),
          )
        },
        onFileProgress: () => {},
        onPeerNickname: (n) => setPeerNickname(n),
        onSecurityCode: (c) => setSecurityCode(c),
        onTyping: (isTyping, fromNick) => {
          if (!fromNick) return
          setTypingPeers((prev) => {
            if (isTyping) return prev.includes(fromNick) ? prev : [...prev, fromNick]
            return prev.filter((x) => x !== fromNick)
          })
        },
        onRoster: (list) => setMembers(list),
      },
    })
    sessionRef.current = session
    return session
  }, [])

  const host = useCallback(
    async (roomId: string, nickname: string, chatMode: ChatMode) => {
      sessionRef.current?.destroy()
      setMembers([])
      setTypingPeers([])
      setPeerTyping(false)
      const session =
        chatMode === 'group' ? buildGroupSession(nickname) : buildDmSession(nickname)
      try {
        await session.host(roomId)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [buildDmSession, buildGroupSession],
  )

  const join = useCallback(
    async (roomId: string, nickname: string, chatMode: ChatMode) => {
      sessionRef.current?.destroy()
      setMembers([])
      setTypingPeers([])
      setPeerTyping(false)
      const session =
        chatMode === 'group' ? buildGroupSession(nickname) : buildDmSession(nickname)
      try {
        await session.join(roomId)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [buildDmSession, buildGroupSession],
  )

  const sendMessage = useCallback(async (text: string) => {
    const session = sessionRef.current
    if (!session) return
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      const { id, ts } = await session.sendMessage(trimmed)
      setMessages((prev) => [
        ...prev,
        { kind: 'text', id, text: trimmed, ts, fromMe: true },
      ])
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const sendFile = useCallback(async (file: File) => {
    const session = sessionRef.current
    if (!session) return
    const tempId = crypto.randomUUID()
    const ts = Date.now()
    setMessages((prev) => [
      ...prev,
      {
        kind: 'file',
        id: tempId,
        name: file.name,
        size: file.size,
        mime: file.type,
        ts,
        fromMe: true,
        progress: 0,
        done: false,
        blobUrl: URL.createObjectURL(file),
      },
    ])
    try {
      await session.sendFile(file, (sent, total) => {
        const p = sent / total
        setMessages((prev) =>
          prev.map((m) =>
            m.kind === 'file' && m.id === tempId ? { ...m, progress: p } : m,
          ),
        )
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === 'file' && m.id === tempId ? { ...m, progress: 1, done: true } : m,
        ),
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const sendTyping = useCallback((isTyping: boolean) => {
    sessionRef.current?.sendTyping(isTyping)
  }, [])

  const disconnect = useCallback(() => {
    sessionRef.current?.destroy()
    sessionRef.current = null
    setTypingPeers([])
    setMembers([])
  }, [])

  const burnAll = useCallback(() => {
    setMessages((prev) => {
      prev.forEach((m) => {
        if (m.kind === 'file' && m.blobUrl) URL.revokeObjectURL(m.blobUrl)
      })
      return []
    })
  }, [])

  useEffect(() => {
    return () => {
      sessionRef.current?.destroy()
    }
  }, [])

  return {
    mode,
    status,
    statusInfo,
    messages,
    peerNickname,
    members,
    securityCode,
    peerTyping,
    typingPeers,
    error,
    host,
    join,
    sendMessage,
    sendFile,
    sendTyping,
    disconnect,
    burnAll,
  }
}
