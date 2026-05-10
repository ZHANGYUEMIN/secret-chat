import { useEffect, useRef, useState } from 'react'
import { Lock, ShieldCheck, Zap, Eye, ArrowRight, RefreshCw } from 'lucide-react'
import { generateRoomId } from '../lib/crypto'
import { MAX_GROUP_MEMBERS } from '../lib/group-peer'
import type { ChatMode } from '../hooks/useChat'
import { ParticleField } from './ParticleField'

interface Props {
  initialRoomId?: string | null
  initialChatKind?: ChatMode
  onEnter: (params: {
    mode: 'host' | 'join'
    roomId: string
    nickname: string
    chatMode: ChatMode
  }) => void
}

export function HomePage({ initialRoomId, initialChatKind = 'dm', onEnter }: Props) {
  const [tab, setTab] = useState<'create' | 'join'>(initialRoomId ? 'join' : 'create')
  const [chatMode, setChatMode] = useState<ChatMode>(initialChatKind)
  const [roomId, setRoomId] = useState(initialRoomId || generateRoomId())
  const [nickname, setNickname] = useState('')
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const nicknameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initialRoomId) {
      setTab('join')
      setRoomId(initialRoomId)
      setChatMode(initialChatKind)
    }
  }, [initialRoomId, initialChatKind])

  /**
   * 必须从 input 的 DOM 读 value：部分浏览器自动填充不会触发 onChange，
   * 仅用 React state 会误判为「空」或「有值」。
   * 主按钮使用 type="button"，避免仅靠原生 submit 绕过我们的校验。
   */
  const attemptEnter = () => {
    const el = nicknameInputRef.current
    const raw = String(el?.value ?? nickname)
    const n = raw.trim()
    if (!n) {
      setNickname(raw)
      setNicknameError('请先输入昵称')
      el?.focus()
      return
    }
    setNicknameError(null)
    setNickname(n)
    const r = roomId.trim().toLowerCase()
    if (!r) return
    onEnter({
      mode: tab === 'create' ? 'host' : 'join',
      roomId: r,
      nickname: n,
      chatMode,
    })
  }

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    attemptEnter()
  }

  return (
    <div className="relative min-h-full flex flex-col bg-ink-950 bg-grid overflow-hidden">
      {/* 粒子背景层 */}
      <ParticleField className="opacity-90" />

      {/* 柔光斑（绝对定位，烘托氛围，不抢眼） */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-3xl opacity-[0.08]"
        style={{ background: 'radial-gradient(closest-side, #10b981, transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-40 w-[500px] h-[500px] rounded-full blur-3xl opacity-[0.05]"
        style={{ background: 'radial-gradient(closest-side, #ffffff, transparent)' }}
      />

      {/* 顶部 logo */}
      <header className="relative z-10 px-5 sm:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-accent-500 flex items-center justify-center shadow-soft">
            <Lock className="w-[18px] h-[18px] text-ink-950" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-semibold text-[15px] leading-tight tracking-tight">SecretChat</h1>
            <p className="text-[11px] text-ink-500 leading-tight">端到端加密 · 阅后即焚</p>
          </div>
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-ink-500 hover:text-ink-200 transition-colors"
        >
          开源 ↗
        </a>
      </header>

      {/* 主体 */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* 标题区 */}
          <div className="text-center mb-10 animate-fade-in">
            <span className="badge-accent mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse-slow" />
              零服务器 · AES-256
            </span>
            <h2 className="text-[34px] sm:text-[40px] font-semibold leading-[1.1] tracking-tight mb-4">
              无痕加密
              <br />
              <span className="text-accent-400">即时对话</span>
            </h2>
            <p className="text-ink-400 text-[15px] leading-relaxed">
              浏览器端加密 · 无服务器存储
              <br className="sm:hidden" />
              <span className="hidden sm:inline"> · </span>
              关闭即销毁
            </p>
          </div>

          {/* 模式：一对一 / 群聊 */}
          <div className="surface rounded-xl p-1 mb-2 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                setChatMode('dm')
                setNicknameError(null)
              }}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                chatMode === 'dm'
                  ? 'bg-ink-50 text-ink-950 shadow-soft'
                  : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              一对一
            </button>
            <button
              type="button"
              onClick={() => {
                setChatMode('group')
                setNicknameError(null)
              }}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                chatMode === 'group'
                  ? 'bg-ink-50 text-ink-950 shadow-soft'
                  : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              加密群聊
            </button>
          </div>
          {chatMode === 'group' && (
            <p className="text-[11px] text-ink-500 mb-3 text-center">
              主持人转发密文 · 最多 {MAX_GROUP_MEMBERS} 人 · 全员同一套群密钥
            </p>
          )}

          {/* Tab 切换 */}
          <div className="surface rounded-xl p-1 mb-3 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                setTab('create')
                setNicknameError(null)
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === 'create'
                  ? 'bg-ink-50 text-ink-950 shadow-soft'
                  : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              {chatMode === 'group' ? '创建群' : '创建房间'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('join')
                setNicknameError(null)
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === 'join'
                  ? 'bg-ink-50 text-ink-950 shadow-soft'
                  : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              {chatMode === 'group' ? '加入群' : '加入房间'}
            </button>
          </div>

          {/* 表单 */}
          <form
            onSubmit={handleFormSubmit}
            className="surface rounded-xl p-5 sm:p-6 space-y-4 animate-slide-up"
          >
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-500 mb-2">
                昵称 <span className="text-rose-400/90">*</span>
              </label>
              <input
                ref={nicknameInputRef}
                type="text"
                name="secretchat_display_name"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value)
                  setNicknameError(null)
                }}
                placeholder={
                  tab === 'create'
                    ? chatMode === 'group'
                      ? '例如：主持人小王'
                      : '例如：小明'
                    : '例如：访客小李'
                }
                className={`input ${nicknameError ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20' : ''}`}
                maxLength={20}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                aria-invalid={nicknameError ? true : undefined}
                aria-describedby={nicknameError ? 'nickname-hint' : undefined}
              />
              {nicknameError && (
                <p id="nickname-hint" className="text-rose-400 text-xs mt-2" role="alert">
                  {nicknameError}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
                  房间号
                </label>
                {tab === 'create' && (
                  <button
                    type="button"
                    onClick={() => setRoomId(generateRoomId())}
                    className="text-[11px] text-ink-400 hover:text-accent-400 transition-colors flex items-center gap-1"
                    title="重新生成"
                  >
                    <RefreshCw className="w-3 h-3" /> 重新生成
                  </button>
                )}
              </div>
              <input
                type="text"
                value={roomId}
                onChange={(e) =>
                  setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
                placeholder="输入要加入的房间号"
                className="input font-mono tracking-wider"
                required
              />
            </div>

            <button
              type="button"
              className="btn-primary w-full text-[15px] py-3 mt-2"
              onClick={() => attemptEnter()}
            >
              {tab === 'create'
                ? chatMode === 'group'
                  ? '创建加密群'
                  : '创建房间'
                : chatMode === 'group'
                  ? '加入群聊'
                  : '加入聊天'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* 特性卡 */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Feature icon={<ShieldCheck className="w-[15px] h-[15px]" />} text="端到端加密" />
            <Feature icon={<Zap className="w-[15px] h-[15px]" />} text="P2P 直连" />
            <Feature icon={<Eye className="w-[15px] h-[15px]" />} text="阅后即焚" />
          </div>
        </div>
      </main>

      {/* 底部 */}
      <footer className="relative z-10 px-6 py-4 text-center text-[11px] text-ink-600">
        所有数据仅在你和对方的浏览器之间传输 · 我们看不到任何内容
      </footer>
    </div>
  )
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="surface rounded-lg py-3 px-2 flex flex-col items-center gap-1.5 surface-hover">
      <div className="text-accent-400">{icon}</div>
      <div className="text-[11px] text-ink-300 font-medium">{text}</div>
    </div>
  )
}
