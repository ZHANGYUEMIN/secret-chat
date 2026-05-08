import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChatSession,
  type ConnectionStatus,
  type IncomingFileMeta,
} from '../lib/peer'

export type ChatMessageItem =
  | {
      kind: 'text'
      id: string
      text: string
      ts: number
      fromMe: boolean
    }
  | {
      kind: 'file'
      id: string
      name: string
      size: number
      mime: string
      ts: number
      fromMe: boolean
      progress: number // 0..1
      done: boolean
      blobUrl?: string
    }
  | {
      kind: 'system'
      id: string
      text: string
      ts: number
    }

export interface UseChatState {
  status: ConnectionStatus
  statusInfo: string
  messages: ChatMessageItem[]
  peerNickname: string
  securityCode: string
  peerTyping: boolean
  error: string | null
}

export interface UseChatActions {
  host(roomId: string, nickname: string): Promise<void>
  join(roomId: string, nickname: string): Promise<void>
  sendMessage(text: string): Promise<void>
  sendFile(file: File): Promise<void>
  sendTyping(isTyping: boolean): void
  disconnect(): void
  burnAll(): void
}

export function useChat(): UseChatState & UseChatActions {
  const sessionRef = useRef<ChatSession | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [statusInfo, setStatusInfo] = useState('')
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [peerNickname, setPeerNickname] = useState('')
  const [securityCode, setSecurityCode] = useState('')
  const [peerTyping, setPeerTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 接收文件时缓存的 chunk
  const incomingFiles = useRef(
    new Map<
      string,
      {
        meta: IncomingFileMeta
        chunks: Map<number, ArrayBuffer>
      }
    >(),
  )

  const buildSession = useCallback((nickname: string) => {
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
            { kind: 'text', id: m.id, text: m.text, ts: m.ts, fromMe: false },
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
        onFileProgress: () => {
          /* 发送方进度由 sendFile 内回调直接更新 */
        },
        onPeerNickname: (n) => setPeerNickname(n),
        onSecurityCode: (c) => setSecurityCode(c),
        onTyping: (t) => setPeerTyping(t),
      },
    })
    sessionRef.current = session
    return session
  }, [])

  const host = useCallback(
    async (roomId: string, nickname: string) => {
      sessionRef.current?.destroy()
      const session = buildSession(nickname)
      try {
        await session.host(roomId)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [buildSession],
  )

  const join = useCallback(
    async (roomId: string, nickname: string) => {
      sessionRef.current?.destroy()
      const session = buildSession(nickname)
      try {
        await session.join(roomId)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [buildSession],
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
  }, [])

  const burnAll = useCallback(() => {
    setMessages((prev) => {
      // 释放 blob URL
      prev.forEach((m) => {
        if (m.kind === 'file' && m.blobUrl) URL.revokeObjectURL(m.blobUrl)
      })
      return []
    })
  }, [])

  // 卸载时清理
  useEffect(() => {
    return () => {
      sessionRef.current?.destroy()
    }
  }, [])

  return {
    status,
    statusInfo,
    messages,
    peerNickname,
    securityCode,
    peerTyping,
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
