import { useState } from 'react'
import Footer from '../components/Footer.jsx'

export default function TutorPage() {
  const [question, setQuestion] = useState('')

  return (
    <div className="tutor-page">
      <header className="tutor-header container">
        <a className="brand" href="/" aria-label="Back to Mavro home"><span className="brand-mark" aria-hidden="true">m</span><span>Mavro</span></a>
        <a className="tutor-back-link" href="/">← Back to home</a>
      </header>
      <main className="tutor-main container">
        <div className="tutor-welcome"><span className="eyebrow"><span className="eyebrow-dot" /> YOUR INTERACTIVE CLASSROOM</span><h1>What would you like<br /><span>to understand?</span></h1><p>Ask about anything you’re learning. We’ll work through it together, one step at a time.</p></div>
        <section className="tutor-workspace" aria-label="Tutor dashboard preview">
          <div className="workspace-sidebar"><span className="workspace-brand"><span className="brand-mark" aria-hidden="true">m</span> Mavro</span><div className="workspace-sidebar-label">YOUR SPACE</div><div className="sidebar-item active"><span>＋</span> New question</div><div className="sidebar-item muted"><span>◷</span> Recent lessons</div><div className="sidebar-bottom"><span className="sidebar-avatar">Y</span><span><b>Your workspace</b><small>Ready to learn</small></span><span className="sidebar-dots">···</span></div></div>
          <div className="workspace-content"><div className="workspace-topline"><span>NEW LESSON</span><span className="workspace-status"><i /> CLASSROOM READY</span></div><div className="workspace-center"><div className="welcome-orb"><span>✳</span></div><span className="workspace-kicker">A FRESH START</span><h2>Curiosity looks good on you.</h2><p>Type a question below and your tutor will help make sense of it.</p><div className="suggestion-chips"><button type="button" onClick={() => setQuestion('How does recursion work?')}>How does recursion work?</button><button type="button" onClick={() => setQuestion('Explain photosynthesis simply')}>Explain photosynthesis simply</button><button type="button" onClick={() => setQuestion('Why do we use fractions?')}>Why do we use fractions?</button></div></div><form className="question-composer" onSubmit={(event) => event.preventDefault()}><textarea aria-label="Your question" placeholder="Ask anything you’re curious about…" value={question} onChange={(event) => setQuestion(event.target.value)} rows="2" /><div className="composer-footer"><span><span>↵</span> Enter to ask · Shift + Enter for a new line</span><button type="submit" aria-label="Submit question" disabled={!question.trim()}>↑</button></div></form><p className="workspace-disclaimer">Mavro is a learning companion. Check important information with trusted sources.</p></div>
        </section>
        <p className="tutor-note">This is your learning space. More classroom tools are on their way.</p>
      </main>
      <Footer />
    </div>
  )
}
