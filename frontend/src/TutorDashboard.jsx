import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, MessageSquare, PenLine, RotateCcw } from 'lucide-react'
import Whiteboard from './components/Whiteboard.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import useWhiteboard from './hooks/useWhiteboard.js'
import useLessonPlayback from './hooks/useLessonPlayback.js'
import { isTutorReply } from './services/whiteboardModel.js'
import { createConversationId, requestExplanation, sendMessage } from './services/tutorService.js'
import './TutorDashboard.css'

const makeMessage = (role, text) => ({ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, role, text, createdAt: new Date().toISOString(), time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()) })

export default function TutorDashboard() {
  const board = useWhiteboard()
  const playback = useLessonPlayback()
  const playbackRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  // lessonData holds the full latest API response so the header and follow-ups stay in sync.
  const [lessonData, setLessonData] = useState(null)
  const [boardTab, setBoardTab] = useState('notes')
  const [mobilePanel, setMobilePanel] = useState('board')
  const responseLock = useRef(false)
  const conversationIdRef = useRef(createConversationId())

  const applyReply = useCallback((reply) => {
    if (!isTutorReply(reply)) throw new Error('The tutor returned an unsupported response. Please try again.')

    setLessonData(reply)
    setMessages((current) => [...current, makeMessage('tutor', reply.message)])

    // Load the lesson into the progressive board sequencer. Returns true when the reply
    // contains a drawable scene, in which case we switch the board to the lesson tab.
    if (playback.loadLesson(reply)) {
      setBoardTab('lesson')
    }
  }, [playback])

  const handleSend = useCallback(async (text) => {
    if (responseLock.current) return
    const trimmedText = String(text ?? '').trim()
    if (!trimmedText) {
      setError('Write a question before sending it.')
      return
    }
    responseLock.current = true
    playback.stop()
    setError('')
    setMessages((current) => [...current, makeMessage('student', trimmedText)])
    setIsLoading(true)
    try {
      const boardSummary = lessonData?.board_summary || 'The whiteboard is empty.'
      const reply = await sendMessage(trimmedText, conversationIdRef.current, boardSummary)
      applyReply(reply)
    } catch (caught) {
      // Do NOT add the error to messages -- just show it in the error bar so history stays clean.
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
      responseLock.current = false
    }
  }, [applyReply, lessonData, playback])

  const handleAskAboutBoard = useCallback(async () => {
    if (responseLock.current) return
    responseLock.current = true
    playback.stop()
    setError('')
    setIsLoading(true)
    try {
      const boardSummary = lessonData?.board_summary || 'The whiteboard is empty.'
      const reply = await requestExplanation(playback.activeStepId, conversationIdRef.current, boardSummary)
      applyReply(reply)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not focus the lesson. Please try again.')
    } finally {
      setIsLoading(false)
      responseLock.current = false
    }
  }, [applyReply, lessonData, playback])

  const handleResetConversation = () => {
    if (responseLock.current) return
    playback.clearLesson()
    conversationIdRef.current = createConversationId()
    setMessages([])
    setError('')
    // Clear lesson data so the whiteboard shows the "ask a question" state.
    setLessonData(null)
    setBoardTab('notes')
  }

  const startBlank = () => {
    playback.stop()
    setBoardTab('notes')
    setMobilePanel('board')
  }

  useEffect(() => {
    playbackRef.current = playback
  })

  useEffect(() => {
    document.title = 'Tutor Dashboard · Mavro'
    return () => {
      playbackRef.current?.stop()
      document.title = 'Mavro — See the idea. Understand the why.'
    }
  }, [])

  const lessonLabel = lessonData?.lesson_title || 'Ready to learn'

  return (
    <main className="dashboard-app">
      <header className="dashboard-topbar">
        <a href="/" className="dashboard-brand" aria-label="Mavro home"><span className="brand-mark">m</span><span>Mavro</span><span className="brand-divider" /><span className="brand-product">TUTOR STUDIO</span></a>
        <nav className="dashboard-breadcrumb" aria-label="Lesson location"><a href="/">Home</a><ChevronRight size={13} /><span>Learning space</span></nav>
        <div className="topbar-right"><span className="preview-pill"><span /> INTERACTIVE PREVIEW</span><button type="button" className="exit-dashboard" onClick={() => { window.location.href = '/' }}><ArrowLeft size={14} /> Exit</button></div>
      </header>
      <div className="dashboard-mobile-tabs" role="tablist" aria-label="Learning panels"><button type="button" role="tab" aria-selected={mobilePanel === 'board'} className={mobilePanel === 'board' ? 'is-active' : ''} onClick={() => setMobilePanel('board')}><PenLine size={15} /> Whiteboard</button><button type="button" role="tab" aria-selected={mobilePanel === 'chat'} className={mobilePanel === 'chat' ? 'is-active' : ''} onClick={() => setMobilePanel('chat')}><MessageSquare size={15} /> Ask Mavro{isLoading && <i className="mobile-thinking-dot" />}</button></div>
      <div className={`dashboard-layout${mobilePanel === 'chat' ? ' mobile-show-chat' : ' mobile-show-board'}`}>
        <section className={`dashboard-board${mobilePanel !== 'board' ? ' is-mobile-hidden' : ''}`}>
          <Whiteboard elements={board.elements} addElement={board.addElement} updateElement={board.updateElement} removeElement={board.removeElement} canUndo={board.canUndo} canRedo={board.canRedo} undo={board.undo} redo={board.redo} clear={board.clear} boardTab={boardTab} setBoardTab={setBoardTab} onAskAboutBoard={handleAskAboutBoard} scene={playback.scene} revealedKeys={playback.revealedKeys} playback={playback} />
        </section>
        <ChatPanel messages={messages} isLoading={isLoading} error={error} onSend={handleSend} onReset={handleResetConversation} onAskAboutBoard={handleAskAboutBoard} mobileVisible={mobilePanel === 'chat'} lessonTitle={lessonLabel} />
      </div>
      <div className="dashboard-mobile-toolbar"><button type="button" onClick={startBlank}><RotateCcw size={15} /> Blank board</button><span>Notes are only saved in this session.</span><button type="button" aria-label="Open chat" onClick={() => setMobilePanel('chat')}><MessageSquare size={15} /></button></div>
    </main>
  )
}
