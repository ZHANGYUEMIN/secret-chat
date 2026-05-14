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
  Info,
} from 'lucide-react'
import type { ChatMode, UseChatActions, UseChatState } from '../hooks/useChat'
import { buildShareLink, copyText } from '../lib/utils'
import { MessageBubble } from './MessageBubble'

interface Props {
  state: UseChatState
  actions: UseChatActions
  roomId: string
  myNickname: string
  isHost: boolean
  chatMode: ChatMode
  onLeave: () => void
}

export function ChatRoom({ state, actions, roomId, myNickname, isHost, chatMode, onLeave }: Props) {
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
  }, [state.messages.length, state.peerTyping, state.typingPeers.join(',')])

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
    const link = buildShareLink(roomId, chatMode === 'group' ? 'group' : 'dm')
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
    <div className="flex h-full min-h-0 flex-col bg-ink-950">
      {/* 顶部状态条 */}
      <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink-950/80 px-3 py-3 backdrop-blur-xl sm:px-5">
        <button
          type="button"
          onClick={() => {
            if (confirm('离开会自动销毁所有消息，确定？')) {
              actions.disconnect()
              onLeave()
            }
          }}
          className="btn-icon-plain shrink-0"
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
              {isReady
                ? chatMode === 'group'
                  ? `群聊 · ${state.members.length} 人`
                  : state.peerNickname || '对方'
                : isHost
                  ? chatMode === 'group'
                    ? '等待成员加入…'
                    : '等待对方加入'
                  : '正在连接'}
            </span>
          </div>
          <div className="text-[11px] text-ink-500 truncate">
            {isReady
              ? chatMode === 'group'
                ? '同一安全码 · 主持人仅转发密文'
                : '安全连接已建立 · 端到端加密'
              : state.statusInfo}
          </div>
        </div>

        <button
          type="button"
          onClick={copyLink}
          className="btn-ghost-sm shrink-0"
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

      {chatMode === 'group' && isReady && state.members.length > 0 && (
        <div className="relative z-20 shrink-0 overflow-x-auto border-b border-white/[0.06] bg-ink-950/50 px-3 py-2 sm:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-ink-500 shrink-0 uppercase tracking-wider">成员</span>
            <div className="flex flex-wrap gap-1.5">
              {state.members.map((m) => (
                <span
                  key={m.id}
                  className="badge-accent text-[10px] py-1 px-2 max-w-[120px] truncate"
                  title={m.nickname}
                >
                  {m.nickname}
                  {m.nickname === myNickname ? '（我）' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 错误条 */}
      {state.error && (
        <div className="relative z-20 flex shrink-0 animate-fade-in items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">{state.error}</span>
        </div>
      )}

      {/* 安全码提示 */}
      {isReady && state.securityCode && (
        <button
          type="button"
          onClick={() => setShowSecurity((s) => !s)}
          className="relative z-20 flex w-full shrink-0 items-center gap-2 border-b border-accent-500/15 bg-accent-500/[0.06] px-4 py-2 text-left text-xs text-accent-300 transition-colors hover:bg-accent-500/10"
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">
            {showSecurity ? (
              <>
                安全码：
                <span className="font-mono font-semibold tracking-wider text-accent-200">
                  {state.securityCode}
                </span>
                <span className="text-ink-500 ml-2">
                  {chatMode === 'group' ? '（全员应显示相同安全码）' : '（与对方核对一致即可）'}
                </span>
              </>
            ) : (
              <>已建立端到端加密连接 · 点此查看安全码</>
            )}
          </span>
          {showSecurity && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void copyCode()
              }}
              className="shrink-0 rounded-lg p-1.5 text-accent-400 transition-colors hover:bg-white/10 hover:text-accent-300"
              aria-label="复制安全码"
            >
              {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </button>
      )}

      {/* 消息区 */}
      <div ref={scrollRef} className="relative z-0 min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {state.messages.length === 0 && !isConnecting && isReady && (
          <EmptyHint isGroup={chatMode === 'group'} />
        )}
        {!isReady && isConnecting && (
          <ConnectingHint
            isHost={isHost}
            isGroup={chatMode === 'group'}
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
          {chatMode === 'dm' && state.peerTyping && isReady && (
            <li className="flex justify-start">
              <div className="bg-ink-900/80 border border-white/[0.06] rounded-2xl px-4 py-2.5 text-sm text-ink-400">
                <TypingDots />
              </div>
            </li>
          )}
          {chatMode === 'group' && state.typingPeers.length > 0 && isReady && (
            <li className="flex justify-start">
              <div className="bg-ink-900/80 border border-white/[0.06] rounded-2xl px-4 py-2.5 text-sm text-ink-400">
                <span className="text-ink-500 mr-2">
                  {state.typingPeers.join('、')}
                  {state.typingPeers.length ? ' 正在输入' : ''}
                </span>
                <TypingDots />
              </div>
            </li>
          )}
        </ul>
      </div>

      {/* 底部输入区 */}
      <form
        onSubmit={handleSend}
        className="relative z-20 shrink-0 border-t border-white/[0.06] bg-ink-950/90 p-3 backdrop-blur-xl sm:p-4"
      >
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isReady}
            className="btn-ghost-icon shrink-0"
            title="发送文件（类型不限；建议单文件 ≤100MB）"
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
            className="btn-primary-icon shrink-0"
            aria-label="发送"
          >
            {isConnecting ? (
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
            ) : (
              <Send className="w-[18px] h-[18px]" strokeWidth={2.25} />
            )}
          </button>
        </div>

        {/* 文件与存储说明（固定标注） */}
        <div className="max-w-3xl mx-auto mt-3 rounded-lg border border-white/[0.08] bg-ink-900/50 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 text-accent-400 mt-0.5" strokeWidth={2.25} />
            <div className="min-w-0 space-y-1 text-[10px] sm:text-[11px] leading-relaxed text-ink-400">
              <p>
                <span className="font-semibold text-ink-300">类型</span>：不限制，任意格式均可选。
              </p>
              <p>
                <span className="font-semibold text-ink-300">大小</span>：程序未设硬上限；建议单文件
                <span className="text-accent-400/90 font-medium"> ≤100MB </span>
                ，过大易失败或卡顿（取决于设备内存与网络）。
              </p>
              <p>
                <span className="font-semibold text-ink-300">次数</span>：发送文件次数无硬上限；文件过多会占用大量内存、可能变慢。
              </p>
              <p>
                <span className="font-semibold text-ink-300">离开本页</span>：仅清除
                <span className="text-ink-200">浏览器内存里</span>
                的对话与附件预览；若已点「下载」保存到磁盘，本地文件
                <span className="text-ink-200">不会</span>
                被自动删除。
              </p>
            </div>
          </div>
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
            className="btn-danger-ghost !min-h-0 px-2 py-1 text-[11px]"
          >
            立即销毁
          </button>
        </div>
      </form>
    </div>
  )
}

function EmptyHint({ isGroup }: { isGroup: boolean }) {
  return (
    <div className="text-center py-12 text-ink-500 text-sm animate-fade-in">
      <div className="w-12 h-12 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center mx-auto mb-3">
        <ShieldCheck className="w-6 h-6 text-accent-400" />
      </div>
      <p className="text-ink-300">{isGroup ? '开始群聊吧' : '开始你的加密对话吧'}</p>
      <p className="text-xs mt-1 text-ink-500">
        {isGroup
          ? '消息与文件经 AES 加密，由主持人转发密文，内容对信令服务不可读'
          : '所有消息和文件仅在双方设备间直接传输'}
      </p>
      <p className="text-[10px] mt-3 text-ink-600 max-w-xs mx-auto leading-relaxed">
        附件说明见输入框下方「文件与存储说明」：类型不限、建议 ≤100MB、离开页面清除内存中的内容。
      </p>
    </div>
  )
}

function ConnectingHint({
  isHost,
  isGroup,
  roomId,
  onCopyLink,
  linkCopied,
}: {
  isHost: boolean
  isGroup: boolean
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
          {isHost
            ? isGroup
              ? '等待成员加入群聊'
              : '等待对方加入'
            : isGroup
              ? '正在加入加密群聊'
              : '正在建立加密连接'}
        </h3>
        <p className="text-sm text-ink-400 mb-5">
          {isHost
            ? isGroup
              ? '把房间号或链接发给所有成员（每人用「加入群」）'
              : '把下面的房间号或链接发给对方'
            : isGroup
              ? '正在与主持人协商密钥…'
              : '正在与对方协商密钥…'}
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
            <button type="button" onClick={onCopyLink} className="btn-primary w-full">
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
