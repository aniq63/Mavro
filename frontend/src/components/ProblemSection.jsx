const ideas = [
  { number: '01', title: 'Ask', text: 'Ask in your own words.', icon: '↗' },
  { number: '02', title: 'Understand', text: 'Follow a guided explanation.', icon: '◉' },
  { number: '03', title: 'Visualize', text: 'See the concept unfold.', icon: '✳' },
]

export default function ProblemSection() {
  return (
    <section className="problem-section section-pad">
      <div className="container problem-layout">
        <div className="section-intro">
          <span className="eyebrow"><span className="eyebrow-dot" /> A BETTER WAY TO LEARN</span>
          <h2>Learning should<br /><span>make sense.</span></h2>
          <p>Reading an answer isn’t always the same as understanding it. Some concepts need to be broken down, demonstrated, and explored step by step.</p>
          <p>Mavro brings explanations to life through guided conversations and dynamic visual demonstrations, helping you understand not just what happens, but why.</p>
        </div>
        <div className="idea-list">
          {ideas.map((idea) => (
            <article className="idea-card" key={idea.number}>
              <span className="idea-number">{idea.number}</span>
              <span className="idea-icon" aria-hidden="true">{idea.icon}</span>
              <div><h3>{idea.title}</h3><p>{idea.text}</p></div>
              <span className="idea-arrow" aria-hidden="true">↗</span>
            </article>
          ))}
        </div>
      </div>
      <div className="section-index container"><span>01 / THE WHY</span><span>CLARITY BEGINS WITH CURIOSITY</span></div>
    </section>
  )
}
