const steps = [
  { number: '01', title: 'Ask your question', text: 'Start with a concept you’re struggling to understand. Ask naturally, in your own words.', icon: '↗' },
  { number: '02', title: 'Learn step by step', text: 'Your AI tutor breaks the concept into manageable steps and explains each one clearly.', icon: '≋' },
  { number: '03', title: 'Watch it come to life', text: 'Follow along as code, diagrams, equations, and labelled connections illustrate the explanation on a digital whiteboard.', icon: '▦' },
  { number: '04', title: 'Stay curious', text: 'Ask follow-up questions, interrupt the explanation, and explore your confusion without starting from scratch.', icon: '✳' },
]

export default function HowItWorks() {
  return (
    <section className="how-section section-pad" id="how-it-works">
      <div className="container">
        <div className="section-heading centered-heading">
          <span className="eyebrow"><span className="eyebrow-dot" /> YOUR CURIOSITY, IN MOTION</span>
          <h2>From questions<br className="mobile-break" /> to <span>understanding.</span></h2>
          <p>Every lesson follows the way real understanding happens: one clear step at a time.</p>
        </div>
        <div className="steps-grid">
          {steps.map((step) => (
            <article className="step-card" key={step.number}>
              <div className="step-card-top"><span className="step-num">{step.number}</span><span className="step-icon" aria-hidden="true">{step.icon}</span></div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <div className="step-bottom"><span>STEP {step.number}</span><span className="step-line" /></div>
            </article>
          ))}
        </div>
      </div>
      <div className="section-index container"><span>02 / THE PROCESS</span><span>QUESTION → CLARITY</span></div>
    </section>
  )
}
