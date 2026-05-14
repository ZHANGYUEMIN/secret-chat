import { Download, FileIcon, ImageIcon, Loader2 } from 'lucide-react'
import type { ChatMessageItem } from '../hooks/useChat'
import { downloadBlob, formatBytes, formatTime } from '../lib/utils'

interface Props {
  msg: ChatMessageItem
  myNickname: string
  peerNickname: string
}

export function MessageBubble({ msg, myNickname, peerNickname }: Props) {
  if (msg.kind === 'system') {
    return (
      <li className="flex justify-center my-2">
        <span className="text-xs text-ink-500 bg-ink-900/60 px-3 py-1 rounded-full">
          {msg.text}
        </span>
      </li>
    )
  }

  const fromMe = msg.fromMe
  const align = fromMe ? 'items-end' : 'items-start'
  // 自己的气泡：accent-500（翡翠绿）+ 黑字；对方：深灰玻璃 + 浅字
  const bubbleColor = fromMe
    ? 'bg-accent-500 text-ink-950'
    : 'bg-ink-900/80 text-ink-50 border border-white/[0.06]'
  const name = fromMe ? myNickname || '我' : msg.senderLabel || peerNickname || '对方'

  return (
    <li className={`flex flex-col ${align} gap-1 animate-slide-up`}>
      <div className="flex items-center gap-1.5 px-1 text-[10px] text-ink-500">
        <span>{name}</span>
        <span className="text-ink-700">·</span>
        <span>{formatTime(msg.ts)}</span>
      </div>
      <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-soft ${bubbleColor}`}>
        {msg.kind === 'text' ? (
          <div className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
            {msg.text}
          </div>
        ) : (
          <FileMessage msg={msg} fromMe={fromMe} />
        )}
      </div>
    </li>
  )
}

function FileMessage({
  msg,
  fromMe,
}: {
  msg: Extract<ChatMessageItem, { kind: 'file' }>
  fromMe: boolean
}) {
  const isImage = msg.mime.startsWith('image/') && msg.done && msg.blobUrl
  const percent = Math.round(msg.progress * 100)

  const handleDownload = () => {
    if (!msg.blobUrl) return
    fetch(msg.blobUrl)
      .then((r) => r.blob())
      .then((b) => downloadBlob(b, msg.name))
  }

  // 图片预览
  if (isImage) {
    return (
      <div className="space-y-2 -mx-1 -my-1 min-w-[200px]">
        <img
          src={msg.blobUrl}
          alt={msg.name}
          className="rounded-lg max-w-full max-h-72 object-contain bg-black/30"
          loading="lazy"
        />
        <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
          <span className={`truncate ${fromMe ? 'text-ink-950/70' : 'text-ink-400'}`}>
            {msg.name}
          </span>
          <button
            type="button"
            onClick={handleDownload}
            className={`shrink-0 font-medium underline-offset-2 hover:underline ${
              fromMe ? 'text-ink-950' : 'text-accent-400'
            }`}
          >
            下载
          </button>
        </div>
      </div>
    )
  }

  // 普通文件
  const subTextColor = fromMe ? 'text-ink-950/70' : 'text-ink-400'
  const iconBg = fromMe ? 'bg-ink-950/15' : 'bg-ink-800/80'

  return (
    <div className="flex items-center gap-3 min-w-[220px]">
      <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
        {msg.mime.startsWith('image/') ? (
          <ImageIcon className="w-[18px] h-[18px]" />
        ) : (
          <FileIcon className="w-[18px] h-[18px]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{msg.name}</div>
        <div className={`text-[11px] flex items-center gap-2 ${subTextColor}`}>
          <span>{formatBytes(msg.size)}</span>
          {!msg.done && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> {percent}%
              </span>
            </>
          )}
        </div>
        {!msg.done && (
          <div
            className={`mt-1.5 h-1 rounded-full overflow-hidden ${
              fromMe ? 'bg-ink-950/20' : 'bg-ink-800'
            }`}
          >
            <div
              className={`h-full transition-all duration-150 ${
                fromMe ? 'bg-ink-950/80' : 'bg-accent-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      {msg.done && msg.blobUrl && (
        <button
          type="button"
          onClick={handleDownload}
          className={`shrink-0 rounded-lg p-2 transition-colors ${
            fromMe ? 'hover:bg-ink-950/15' : 'hover:bg-ink-800'
          }`}
          title="下载"
        >
          <Download className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
