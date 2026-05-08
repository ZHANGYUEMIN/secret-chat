import { useEffect, useState } from 'react'
import { HomePage } from './components/HomePage'
import { ChatRoom } from './components/ChatRoom'
import { useChat } from './hooks/useChat'
import { parseRoomFromHash } from './lib/utils'

type View =
  | { name: 'home'; initialRoomId: string | null }
  | { name: 'chat'; roomId: string; nickname: string; isHost: boolean }

export default function App() {
  const chat = useChat()
  const [view, setView] = useState<View>({
    name: 'home',
    initialRoomId: parseRoomFromHash(),
  })

  // 监听 hash 变化（用户手动改 URL 也能响应）
  useEffect(() => {
    const onHash = () => {
      const id = parseRoomFromHash()
      if (id && view.name === 'home') {
        setView({ name: 'home', initialRoomId: id })
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [view.name])

  // 离开页面前提醒（防止误关闭）
  useEffect(() => {
    if (view.name !== 'chat') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [view.name])

  const handleEnter = async ({
    mode,
    roomId,
    nickname,
  }: {
    mode: 'host' | 'join'
    roomId: string
    nickname: string
  }) => {
    setView({ name: 'chat', roomId, nickname, isHost: mode === 'host' })
    if (mode === 'host') {
      window.location.hash = `#/room/${roomId}`
      await chat.host(roomId, nickname)
    } else {
      await chat.join(roomId, nickname)
    }
  }

  const handleLeave = () => {
    window.location.hash = ''
    setView({ name: 'home', initialRoomId: null })
  }

  if (view.name === 'home') {
    return <HomePage initialRoomId={view.initialRoomId} onEnter={handleEnter} />
  }

  return (
    <ChatRoom
      state={chat}
      actions={chat}
      roomId={view.roomId}
      myNickname={view.nickname}
      isHost={view.isHost}
      onLeave={handleLeave}
    />
  )
}
