import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import TutorAvatar from './TutorAvatar.jsx'

export default function ChatMessage({ message }) {
  const [copied, setCopied] = useState(false)
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className={`chat-message message-${message.role}`}>
      {message.role === 'tutor' ? <TutorAvatar compact /> : <span className="student-message-avatar">Y</span>}
      <div className="chat-message-content"><div className="message-meta"><b>{message.role === 'tutor' ? 'Mavro' : 'You'}</b><time>{message.time}</time></div><p>{message.text}</p>{message.role === 'tutor' && <button className="copy-message" type="button" aria-label={copied ? 'Copied message' : 'Copy tutor message'} title={copied ? 'Copied' : 'Copy message'} onClick={copyMessage}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>}</div>
    </article>
  )
}
