import { useEffect, useState } from 'react'
import { HomePage } from './components/HomePage'
import { ChatRoom } from './components/ChatRoom'
import { useChat, type ChatMode } from './hooks/useChat'
import { parseChatFromHash } from './lib/utils'

type View =
  | { name: 'home'; initialRoomId: string | null; initialChatKind: ChatMode }
  | {
      name: 'chat'
      roomId: string
      nickname: string
      isHost: boolean
      chatMode: ChatMode
    }

export default function App() {
  const chat = useChat()
  const parsed = parseChatFromHash()
  const [view, setView] = useState<View>({
    name: 'home',
    initialRoomId: parsed?.roomId ?? null,
    initialChatKind: parsed?.kind ?? 'dm',
  })

  useEffect(() => {
    const onHash = () => {
      const p = parseChatFromHash()
      if (p && view.name === 'home') {
        setView({
          name: 'home',
          initialRoomId: p.roomId,
          initialChatKind: p.kind,
        })
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [view.name])

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
    chatMode,
  }: {
    mode: 'host' | 'join'
    roomId: string
    nickname: string
    chatMode: ChatMode
  }) => {
    setView({ name: 'chat', roomId, nickname, isHost: mode === 'host', chatMode })
    if (mode === 'host') {
      window.location.hash = chatMode === 'group' ? `#/group/${roomId}` : `#/room/${roomId}`
      await chat.host(roomId, nickname, chatMode)
    } else {
      await chat.join(roomId, nickname, chatMode)
    }
  }

  const handleLeave = () => {
    window.location.hash = ''
    setView({ name: 'home', initialRoomId: null, initialChatKind: 'dm' })
  }

  if (view.name === 'home') {
    return (
      <HomePage
        initialRoomId={view.initialRoomId}
        initialChatKind={view.initialChatKind}
        onEnter={handleEnter}
      />
    )
  }

  return (
    <ChatRoom
      state={chat}
      actions={chat}
      roomId={view.roomId}
      myNickname={view.nickname}
      isHost={view.isHost}
      chatMode={view.chatMode}
      onLeave={handleLeave}
    />
  )
}
