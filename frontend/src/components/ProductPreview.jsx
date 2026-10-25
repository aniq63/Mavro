export default function ProductPreview() {
  return (
    <div className="preview-wrap" aria-label="Illustrative preview of Mavro’s interactive classroom">
      <div className="preview-orbit orbit-one" aria-hidden="true" />
      <div className="preview-orbit orbit-two" aria-hidden="true" />
      <div className="classroom-card">
        <div className="classroom-topbar">
          <div className="window-dots"><i /><i /><i /></div>
          <span className="classroom-title">MAVRO CLASSROOM</span>
          <span className="live-pill"><span /> LIVE DEMO</span>
        </div>
        <div className="classroom-body">
          <div className="tutor-panel">
            <div className="tutor-avatar"><span className="avatar-spark">✳</span><span className="avatar-face">☺</span></div>
            <span className="panel-label">AI TUTOR</span>
            <p>“Let’s trace this loop step by step.”</p>
            <div className="voice-wave" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
            <span className="voice-caption">EXPLAINING THE CONCEPT</span>
          </div>
          <div className="whiteboard-panel">
            <div className="whiteboard-heading"><span className="board-icon">✎</span><div><b>DIGITAL WHITEBOARD</b><small>Example · Python loop</small></div><span className="expand-icon">↗</span></div>
            <div className="code-window"><div className="code-gutter">1<br />2</div><pre><span className="code-purple">for</span> i <span className="code-purple">in</span> <span className="code-blue">range</span>(<span className="code-orange">3</span>):<br />    <span className="code-blue">print</span>(i)</pre></div>
            <div className="trace-label">LET’S FOLLOW <span>i</span></div>
            <div className="trace-row"><span className="trace-step active"><small>STEP 1</small><b>i = 0</b></span><span className="trace-arrow">→</span><span className="trace-step"><small>STEP 2</small><b>i = 1</b></span><span className="trace-arrow">→</span><span className="trace-step"><small>STEP 3</small><b>i = 2</b></span></div>
            <div className="board-progress"><span /></div>
          </div>
        </div>
        <div className="classroom-footer"><span><i /> Your lesson, in progress</span><span>01:24 <b>Ⅱ</b></span></div>
      </div>
      <div className="float-card float-understand"><span className="float-icon">✦</span><span><b>It clicks.</b><small>Concept understood</small></span><span className="checkmark">✓</span></div>
      <div className="float-card float-step"><span className="step-number">03</span><span><b>One step at a time</b><small>Follow the idea unfold</small></span></div>
    </div>
  )
}
