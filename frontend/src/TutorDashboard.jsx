import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, PenLine, RotateCcw, Sparkles } from 'lucide-react'
import TutorAvatar from './components/TutorAvatar.jsx'
import Whiteboard from './components/Whiteboard.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import useWhiteboard from './hooks/useWhiteboard.js'
import { isTutorReply } from './services/whiteboardModel.js'
import { requestExplanation, sendMessage } from './services/tutorService.js'
import './TutorDashboard.css'

const makeMessage = (role, text) => ({ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, role, text, createdAt: new Date().toISOString(), time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date()) })
const initialMessages = [makeMessage('tutor', 'Hi, I’m Mavro. We’re exploring a tiny Python loop together. Ask me about any step, or use the board to sketch your own way of thinking.')]

export default function TutorDashboard() {
  const board = useWhiteboard()
  const [messages, setMessages] = useState(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeStep, setActiveStep] = useState('step-1')
  const [boardTab, setBoardTab] = useState('lesson')
  const [mobilePanel, setMobilePanel] = useState('board')
  const [showTutor, setShowTutor] = useState(true)
  const responseLock = useRef(false)

  const applyReply = useCallback((reply) => {
    if (!isTutorReply(reply)) throw new Error('The tutor returned an unsupported response. Please try again.')
    reply.whiteboardActions.forEach((action) => {
      if (action.kind === 'highlight-step' && ['step-1', 'step-2', 'step-3'].includes(action.stepId)) {
        setActiveStep(action.stepId)
        setBoardTab('lesson')
      }
      if (action.kind === 'clear-highlight') setActiveStep(null)
    })
    setMessages((current) => [...current, makeMessage('tutor', reply.message)])
  }, [])

  const handleSend = useCallback(async (text) => {
    if (responseLock.current) return
    responseLock.current = true
    setError('')
    setMessages((current) => [...current, makeMessage('student', text)])
    setIsLoading(true)
    try {
      const reply = await sendMessage(text)
      applyReply(reply)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
      responseLock.current = false
    }
  }, [applyReply])

  const handleAskAboutBoard = useCallback(async () => {
    if (responseLock.current) return
    responseLock.current = true
    setError('')
    setIsLoading(true)
    try {
      const reply = await requestExplanation(activeStep)
      applyReply(reply)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not focus the lesson. Please try again.')
    } finally {
      setIsLoading(false)
      responseLock.current = false
    }
  }, [activeStep, applyReply])

  const handleResetConversation = () => {
    if (responseLock.current) return
    setMessages([makeMessage('tutor', 'New conversation, same lesson. What would you like to explore?')])
    setError('')
  }

  const startBlank = () => {
    setBoardTab('notes')
    setMobilePanel('board')
    setShowTutor(false)
  }

  useEffect(() => {
    document.title = 'Tutor Dashboard · Mavro'
    return () => { document.title = 'Mavro — See the idea. Understand the why.' }
  }, [])

  return (
    <main className="dashboard-app">
      <header className="dashboard-topbar">
        <a href="/" className="dashboard-brand" aria-label="Mavro home"><span className="brand-mark">m</span><span>Mavro</span><span className="brand-divider" /><span className="brand-product">TUTOR STUDIO</span></a>
        <nav className="dashboard-breadcrumb" aria-label="Lesson location"><a href="/">Home</a><ChevronRight size={13} /><span>Learning space</span></nav>
        <div className="topbar-right"><span className="preview-pill"><span /> INTERACTIVE PREVIEW</span><button type="button" className="topbar-avatar-button" aria-label="Tutor Mavro, ready"><TutorAvatar compact /></button><button type="button" className="exit-dashboard" onClick={() => { window.location.href = '/' }}><ArrowLeft size={14} /> Exit</button></div>
      </header>
      <div className="dashboard-mobile-tabs" role="tablist" aria-label="Learning panels"><button type="button" role="tab" aria-selected={mobilePanel === 'board'} className={mobilePanel === 'board' ? 'is-active' : ''} onClick={() => setMobilePanel('board')}><PenLine size={15} /> Whiteboard</button><button type="button" role="tab" aria-selected={mobilePanel === 'chat'} className={mobilePanel === 'chat' ? 'is-active' : ''} onClick={() => setMobilePanel('chat')}><MessageSquare size={15} /> Ask Mavro{isLoading && <i className="mobile-thinking-dot" />}</button></div>
      <div className={`dashboard-layout${mobilePanel === 'chat' ? ' mobile-show-chat' : ' mobile-show-board'}${showTutor ? '' : ' tutor-collapsed'}`}>
        <aside className={`profile-rail${showTutor ? '' : ' is-collapsed'}`}>
          <button className="profile-collapse" type="button" title={showTutor ? 'Hide tutor profile' : 'Show tutor profile'} aria-label={showTutor ? 'Hide tutor profile' : 'Show tutor profile'} onClick={() => setShowTutor(!showTutor)}>{showTutor ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}</button>
          {showTutor ? <><TutorAvatar /><div className="profile-lesson"><span className="profile-eyebrow">NOW LEARNING</span><b>Python basics</b><span>Control flow <span>·</span> 4 min</span></div><div className="profile-lesson-line"><span /></div><div className="profile-lesson-note"><Sparkles size={13} /><span>Lessons shaped around how you think.</span></div><button className="blank-board-button" type="button" onClick={startBlank}><span><RotateCcw size={14} /></span><span><b>Start with a blank board</b><small>Your notes stay separate</small></span></button><div className="profile-rail-bottom"><span className="privacy-mark">◇</span><span>Just you and your tutor</span><button type="button" aria-label="Toggle panel menu" title="Panel options"><Menu size={14} /></button></div></> : <button className="collapsed-avatar" type="button" aria-label="Show Mavro tutor profile" onClick={() => setShowTutor(true)}><TutorAvatar compact /></button>}
        </aside>
        <section className={`dashboard-board${mobilePanel !== 'board' ? ' is-mobile-hidden' : ''}`}>
          <Whiteboard elements={board.elements} addElement={board.addElement} updateElement={board.updateElement} removeElement={board.removeElement} canUndo={board.canUndo} canRedo={board.canRedo} undo={board.undo} redo={board.redo} clear={board.clear} activeStep={activeStep} boardTab={boardTab} setBoardTab={setBoardTab} onAskAboutBoard={handleAskAboutBoard} />
        </section>
        <ChatPanel messages={messages} isLoading={isLoading} error={error} onSend={handleSend} onReset={handleResetConversation} onAskAboutBoard={handleAskAboutBoard} mobileVisible={mobilePanel === 'chat'} />
      </div>
      <div className="dashboard-mobile-toolbar"><button type="button" onClick={startBlank}><RotateCcw size={15} /> Blank board</button><span>Notes are only saved in this session.</span><button type="button" aria-label="Open chat" onClick={() => setMobilePanel('chat')}><MessageSquare size={15} /></button></div>
    </main>
  )
}
