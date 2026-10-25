import { Lightbulb, MessageCircleQuestion, RefreshCw, Sparkles } from 'lucide-react'

const suggestions = [
  { label: 'Explain this step', Icon: Lightbulb },
  { label: 'Why does the loop stop?', Icon: MessageCircleQuestion },
  { label: 'Show me another example', Icon: RefreshCw },
  { label: 'Give me a practice question', Icon: Sparkles },
]

export default function SuggestedQuestions({ onSelect, disabled }) {
  return <div className="suggested-questions" aria-label="Suggested questions">{suggestions.map(({ label, Icon }) => <button key={label} type="button" disabled={disabled} onClick={() => onSelect(label)}><Icon size={13} /> {label}</button>)}</div>
}
