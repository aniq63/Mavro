import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, CircleHelp, MoreHorizontal, Paperclip, Plus, Sparkles } from 'lucide-react'
import ChatMessage from './ChatMessage.jsx'
import SuggestedQuestions from './SuggestedQuestions.jsx'
import TutorAvatar from './TutorAvatar.jsx'

export default function ChatPanel({ messages, isLoading, error, onSend, onReset, onAskAboutBoard, mobileVisible, lessonTitle }) {
  const [draft, setDraft] = useState('')
  const endRef = useRef(null)
  const inputRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, isLoading])

  const contextLabel = lessonTitle && lessonTitle.trim() ? lessonTitle.trim() : 'Your next concept'
  const submit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || isLoading) return
    setDraft('')
    onSend(text)
  }

  const askSuggestion = (question) => {
    if (isLoading) return
    onSend(question)
  }

  return (
    <aside className={`chat-panel${mobileVisible ? ' is-mobile-visible' : ''}`} aria-label="Ask Mavro">
      <header className="chat-header"><div className="chat-header-tutor"><div className="chat-header-avatar"><TutorAvatar compact /></div><div><h2>Ask Mavro</h2><span><i /> Here to help you learn</span></div></div><div className="chat-header-actions"><button type="button" aria-label="About this mock tutor" title="Mock tutor preview"><CircleHelp size={16} /></button><button type="button" aria-label="More options" title="New conversation" onClick={onReset}><MoreHorizontal size={18} /></button></div></header>
      <div className="chat-context-bar"><span className="context-sparkle"><Sparkles size={13} /></span><span>{lessonTitle ? <>Learning with <b>{contextLabel}</b></> : <>Ready for your <b>next concept</b></>}</span><button type="button" aria-label="Ask about the current lesson" title="Focus lesson on the board" onClick={onAskAboutBoard}><ChevronDown size={14} /></button></div>
      <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
        {isLoading && <div className="typing-message"><TutorAvatar compact /><div className="typing-bubble"><span /><span /><span /><small>Mavro is thinking</small></div></div>}
        {error && <div className="chat-error" role="alert">{error}</div>}
        <div ref={endRef} />
      </div>
      {messages.length > 0 && messages.length <= 1 && <div className="chat-suggestions-wrap"><span className="suggestions-label">TRY ASKING</span><SuggestedQuestions onSelect={askSuggestion} disabled={isLoading} /></div>}
      <div className="chat-compose-area">
        <form className="chat-composer" onSubmit={submit}><textarea ref={inputRef} aria-label="Message Mavro" placeholder={lessonTitle ? 'Ask a question about this lesson…' : 'Ask Mavro anything…'} rows="2" value={draft} disabled={isLoading} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /><div className="chat-composer-footer"><button type="button" className="compose-utility" title="Attachments are not available in this preview" aria-label="Add attachment" disabled><Paperclip size={14} /></button><span>Enter to send <span>·</span> Shift + Enter for a new line</span><button className={`send-button${draft.trim() ? ' has-text' : ''}`} type="submit" aria-label="Send message" disabled={!draft.trim() || isLoading}><ArrowUp size={16} /></button></div></form>
        <div className="chat-disclaimer"><span><Sparkles size={11} /></span> Live tutor mode · Real backend responses <button type="button" aria-label="Start a new conversation" title="New conversation" onClick={onReset}><Plus size={13} /></button></div>
      </div>
    </aside>
  )
}
