const features = [
  { number: '01', title: 'Visual explanations that evolve', text: 'See concepts illustrated through step-by-step diagrams, highlighted code, variable traces, and worked examples.', icon: '▧', tag: 'SEE IT CLEARLY' },
  { number: '02', title: 'Learn through conversation', text: 'Interact with your tutor naturally. Ask questions, request clarification, and explore ideas at your own pace.', icon: '◌', tag: 'MAKE IT YOURS' },
  { number: '03', title: 'Explanations that follow your thinking', text: 'Ask a follow-up and continue from the current lesson, with relevant whiteboard updates instead of starting over.', icon: '⤴', tag: 'KEEP GOING' },
]

export default function FeaturesSection() {
  return (
    <section className="features-section section-pad" id="features">
      <div className="container">
        <div className="features-heading">
          <div><span className="eyebrow"><span className="eyebrow-dot" /> BUILT FOR THE “AHA” MOMENT</span><h2>A different way to understand <span>complex ideas.</span></h2></div>
          <p>Not another answer box. A learning experience built around how understanding really happens.</p>
        </div>
        <div className="features-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-top"><span className="feature-number">{feature.number} — MAVRO METHOD</span><span className="feature-icon" aria-hidden="true">{feature.icon}</span></div>
              <div className="feature-art" aria-hidden="true"><div className={`art-shape art-shape-${feature.number}`}><span>{feature.icon}</span><i /><i /><i /></div><span className="art-label">{feature.tag}</span></div>
              <h3>{feature.title}</h3><p>{feature.text}</p>
              <span className="feature-link">MADE FOR YOUR “OH, I GET IT” <span>↗</span></span>
            </article>
          ))}
        </div>
      </div>
      <div className="section-index container"><span>03 / THE DIFFERENCE</span><span>UNDERSTANDING, NOT JUST ANSWERS</span></div>
    </section>
  )
}
