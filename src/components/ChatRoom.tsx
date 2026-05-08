import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Copy,
  Check,
  Send,
  Paperclip,
  Flame,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { UseChatActions, UseChatState } from '../hooks/useChat'
import { buildShareLink, copyText } from '../lib/utils'
import { MessageBubble } from './MessageBubble'

interface Props {
  state: UseChatState
  actions: UseChatActions
  roomId: string
  myNickname: string
  isHost: boolean
  onLeave: () => void
}

export function ChatRoom({ state, actions, roomId, myNickname, isHost, onLeave }: Props) {
  const [draft, setDraft] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [showSecurity, setShowSecurity] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimerRef = useRef<number | null>(null)

  // 自动滚动到底
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [state.messages.length, state.peerTyping])

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!draft.trim() || state.status !== 'ready') return
    void actions.sendMessage(draft)
    setDraft('')
    actions.sendTyping(false)
  }

  const handleDraftChange = (v: string) => {
    setDraft(v)
    if (state.status !== 'ready') return
    actions.sendTyping(true)
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => actions.sendTyping(false), 1500)
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || state.status !== 'ready') return
    Array.from(files).forEach((f) => void actions.sendFile(f))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const copyLink = async () => {
    const link = buildShareLink(roomId)
    if (await copyText(link)) {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    }
  }

  const copyCode = async () => {
    if (await copyText(state.securityCode)) {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 1500)
    }
  }

  const isReady = state.status === 'ready'
  const isConnecting =
    state.status === 'connecting' ||
    state.status === 'awaiting-peer' ||
    state.status === 'handshaking'

  return (
    <div className="h-full flex flex-col bg-ink-950">
      {/* 顶部状态条 */}
      <header className="bg-ink-950/80 backdrop-blur-xl border-b border-white/[0.06] px-3 sm:px-5 py-3 flex items-center gap-3 z-10">
        <button
          onClick={() => {
            if (confirm('离开会自动销毁所有消息，确定？')) {
              actions.disconnect()
              onLeave()
            }
          }}
          className="p-2 rounded-lg hover:bg-ink-800/80 text-ink-300 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isReady ? 'bg-accent-400 animate-pulse-slow' : 'bg-amber-400'
              }`}
            />
            <span className="font-medium text-[15px] truncate">
              {isReady ? state.peerNickname || '对方' : isHost ? '等待对方加入' : '正在连接'}
            </span>
          </div>
          <div className="text-[11px] text-ink-500 truncate">
            {isReady ? '安全连接已建立 · 端到端加密' : state.statusInfo}
          </div>
        </div>

        <button
          onClick={copyLink}
          className="btn-ghost text-xs px-3 py-2"
          title="复制邀请链接"
        >
          {linkCopied ? (
            <>
              <Check className="w-3.5 h-3.5" /> 已复制
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> 邀请
            </>
          )}
        </button>
      </header>

      {/* 错误条 */}
      {state.error && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-sm text-rose-300 flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">{state.error}</span>
        </div>
      )}

      {/* 安全码提示 */}
      {isReady && state.securityCode && (
        <button
          type="button"
          onClick={() => setShowSecurity((s) => !s)}
          className="bg-accent-500/[0.06] border-b border-accent-500/15 px-4 py-2 text-xs text-accent-300 flex items-center gap-2 hover:bg-accent-500/10 transition-colors w-full text-left"
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">
            {showSecurity ? (
              <>
                安全码：
                <span className="font-mono font-semibold tracking-wider text-accent-200">
                  {state.securityCode}
                </span>
                <span className="text-ink-500 ml-2">（与对方核对一致即可）</span>
              </>
            ) : (
              <>已建立端到端加密连接 · 点此查看安全码</>
            )}
          </span>
          {showSecurity && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                void copyCode()
              }}
              className="text-accent-400 hover:text-accent-300 p-1"
            >
              {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </span>
          )}
        </button>
      )}

      {/* 消息区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4">
        {state.messages.length === 0 && !isConnecting && isReady && <EmptyHint />}
        {!isReady && isConnecting && (
          <ConnectingHint
            isHost={isHost}
            roomId={roomId}
            onCopyLink={copyLink}
            linkCopied={linkCopied}
          />
        )}

        <ul className="space-y-3 max-w-3xl mx-auto">
          {state.messages.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              myNickname={myNickname}
              peerNickname={state.peerNickname}
            />
          ))}
          {state.peerTyping && isReady && (
            <li className="flex justify-start">
              <div className="bg-ink-900/80 border border-white/[0.06] rounded-2xl px-4 py-2.5 text-sm text-ink-400">
                <TypingDots />
              </div>
            </li>
          )}
        </ul>
      </div>

      {/* 底部输入区 */}
      <form
        onSubmit={handleSend}
        className="bg-ink-950/80 backdrop-blur-xl border-t border-white/[0.06] p-3 sm:p-4"
      >
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isReady}
            className="btn-ghost shrink-0 p-3"
            title="发送文件"
          >
            <Paperclip className="w-[18px] h-[18px]" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div className="flex-1">
            <textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={isReady ? '说点什么…（Enter 发送，Shift+Enter 换行）' : '等待安全连接建立…'}
              disabled={!isReady}
              rows={1}
              className="input resize-none min-h-[48px] max-h-32 leading-6 py-3"
              style={{
                height: 'auto',
                minHeight: '48px',
              }}
              onInput={(e) => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 128) + 'px'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={!isReady || !draft.trim()}
            className="btn-primary shrink-0 p-3"
            aria-label="发送"
          >
            {isConnecting ? (
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
            ) : (
              <Send className="w-[18px] h-[18px]" strokeWidth={2.25} />
            )}
          </button>
        </div>

        <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between text-[11px] text-ink-600">
          <span className="flex items-center gap-1.5">
            <Flame className="w-3 h-3" />
            离开页面后所有内容自动销毁
          </span>
          <button
            type="button"
            onClick={() => {
              if (confirm('清空所有消息？此操作不可撤销。')) actions.burnAll()
            }}
            className="hover:text-rose-400 transition-colors"
          >
            立即销毁
          </button>
        </div>
      </form>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="text-center py-12 text-ink-500 text-sm animate-fade-in">
      <div className="w-12 h-12 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center mx-auto mb-3">
        <ShieldCheck className="w-6 h-6 text-accent-400" />
      </div>
      <p className="text-ink-300">开始你的加密对话吧</p>
      <p className="text-xs mt-1 text-ink-500">所有消息和文件仅在双方设备间直接传输</p>
    </div>
  )
}

function ConnectingHint({
  isHost,
  roomId,
  onCopyLink,
  linkCopied,
}: {
  isHost: boolean
  roomId: string
  onCopyLink: () => void
  linkCopied: boolean
}) {
  return (
    <div className="max-w-md mx-auto py-8 animate-fade-in">
      <div className="surface rounded-xl p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
        </div>
        <h3 className="font-semibold text-base mb-1">
          {isHost ? '等待对方加入' : '正在建立加密连接'}
        </h3>
        <p className="text-sm text-ink-400 mb-5">
          {isHost ? '把下面的房间号或链接发给对方' : '正在与对方协商密钥…'}
        </p>

        {isHost && (
          <>
            <div className="bg-ink-950/80 border border-white/[0.06] rounded-lg p-4 mb-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">
                房间号
              </div>
              <div className="font-mono text-xl font-semibold tracking-[0.15em] text-accent-300 break-all">
                {roomId}
              </div>
            </div>
            <button onClick={onCopyLink} className="btn-primary w-full">
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4" /> 链接已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> 复制邀请链接
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  )
}
