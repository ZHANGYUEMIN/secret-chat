export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

/** 在浏览器中触发文件下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 复制到剪贴板，兼容旧浏览器 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      ta.remove()
      return false
    }
  }
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type ChatRouteKind = 'dm' | 'group'

/** 生成分享链接（一对一 #/room/ ；群聊 #/group/） */
export function buildShareLink(roomId: string, kind: ChatRouteKind = 'dm'): string {
  const url = new URL(window.location.href)
  url.hash = kind === 'group' ? `#/group/${roomId}` : `#/room/${roomId}`
  url.search = ''
  return url.toString()
}

/** 从地址栏解析房间与模式 */
export function parseChatFromHash(): { kind: ChatRouteKind; roomId: string } | null {
  let m = window.location.hash.match(/#\/group\/([a-z0-9-]+)/i)
  if (m) return { kind: 'group', roomId: m[1] }
  m = window.location.hash.match(/#\/room\/([a-z0-9-]+)/i)
  if (m) return { kind: 'dm', roomId: m[1] }
  return null
}

/** @deprecated 使用 parseChatFromHash */
export function parseRoomFromHash(): string | null {
  const p = parseChatFromHash()
  return p?.kind === 'dm' ? p.roomId : null
}
