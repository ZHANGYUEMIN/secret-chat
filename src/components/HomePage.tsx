import { useEffect, useRef, useState } from 'react'
import { Lock, ShieldCheck, Zap, Eye, ArrowRight, RefreshCw, Users, Github } from 'lucide-react'
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
    <div className="relative isolate flex min-h-full flex-col overflow-hidden bg-ink-950 bg-grid">
      {/* 装饰层：整块不接收指针，避免盖住可点击区域 */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <ParticleField className="opacity-90" />
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full opacity-[0.08] blur-3xl"
          style={{ background: 'radial-gradient(closest-side, #10b981, transparent)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-40 h-[500px] w-[500px] rounded-full opacity-[0.05] blur-3xl"
          style={{ background: 'radial-gradient(closest-side, #ffffff, transparent)' }}
        />
      </div>

      {/* 顶部 logo */}
      <header className="relative z-20 px-5 sm:px-8 py-5 flex items-center justify-between">
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
          href="https://github.com/ZHANGYUEMIN/secret-chat"
          target="_blank"
          rel="noopener noreferrer"
          className="sc-github-header"
          aria-label="在 GitHub 上查看源码"
          title="GitHub 源码仓库"
        >
          <Github className="w-[22px] h-[22px]" strokeWidth={2} />
        </a>
      </header>

      {/* 主体 */}
      <main className="relative z-20 flex flex-1 items-center justify-center px-4 py-8">
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
              className={`sc-home-seg sc-home-seg--sm ${chatMode === 'dm' ? 'sc-home-seg--on' : 'sc-home-seg--off'}`}
            >
              一对一
            </button>
            <button
              type="button"
              onClick={() => {
                setChatMode('group')
                setNicknameError(null)
              }}
              className={`sc-home-seg sc-home-seg--sm ${chatMode === 'group' ? 'sc-home-seg--on' : 'sc-home-seg--off'}`}
            >
              加密群聊
            </button>
          </div>
          {chatMode === 'group' && (
            <div
              role="note"
              className="mb-3 rounded-xl border-2 border-accent-500/55 bg-gradient-to-br from-accent-500/20 via-accent-500/10 to-transparent px-4 py-3.5 shadow-[0_0_32px_-10px_rgba(16,185,129,0.45)]"
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/25 ring-1 ring-accent-400/40">
                  <Users className="h-4 w-4 text-accent-300" strokeWidth={2.25} />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[13px] font-semibold text-accent-200 tracking-tight mb-1.5">
                    加密群聊 · 请先看这三点
                  </p>
                  <ul className="space-y-1.5 text-[12px] leading-snug text-ink-100">
                    <li>
                      <span className="font-semibold text-accent-300">主持人只转发密文</span>
                      <span className="text-ink-400"> — 信令/P2P 链路上是 AES 加密后的数据包</span>
                    </li>
                    <li>
                      <span className="font-semibold text-accent-300">最多 {MAX_GROUP_MEMBERS} 人</span>
                      <span className="text-ink-400"> — 星型连接，每人只连主持人</span>
                    </li>
                    <li>
                      <span className="font-semibold text-accent-300">全员同一套群密钥</span>
                      <span className="text-ink-400"> — 进群后每人本地持有同一把 AES-256 密钥</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tab 切换 */}
          <div className="surface rounded-xl p-1 mb-3 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                setTab('create')
                setNicknameError(null)
              }}
              className={`sc-home-seg sc-home-seg--md ${tab === 'create' ? 'sc-home-seg--on' : 'sc-home-seg--off'}`}
            >
              {chatMode === 'group' ? '创建群' : '创建房间'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('join')
                setNicknameError(null)
              }}
              className={`sc-home-seg sc-home-seg--md ${tab === 'join' ? 'sc-home-seg--on' : 'sc-home-seg--off'}`}
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
                    className="sc-home-subtle"
                    title="重新生成房间号"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> 重新生成
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
              className="sc-home-cta"
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
      <footer className="relative z-20 px-6 py-4 text-center text-[11px] text-ink-600">
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
