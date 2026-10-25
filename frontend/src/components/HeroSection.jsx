import ProductPreview from './ProductPreview.jsx'

export default function HeroSection() {
  return (
    <section className="hero-section" id="home">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container hero-layout">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> LEARNING, REIMAGINED</div>
          <h1>Don’t just get the answer.<br /><span>See how it works.</span></h1>
          <p className="hero-description">Meet Mavro, your interactive AI tutor. Ask questions, hear explanations, and watch complex concepts come to life through step-by-step visual demonstrations on a digital whiteboard.</p>
          <div className="hero-actions">
            <a className="button" href="/tutor">Start Learning <span aria-hidden="true">→</span></a>
            <a className="text-link" href="#how-it-works">See How It Works <span aria-hidden="true">↓</span></a>
          </div>
          <p className="hero-note"><span className="note-line" /> See the idea. Understand the why.</p>
        </div>
        <ProductPreview />
      </div>
      <div className="hero-bottom container" aria-hidden="true"><span>CURIOUS MINDS, WELCOME</span><span className="scroll-cue">SCROLL TO EXPLORE <span>↓</span></span></div>
    </section>
  )
}
