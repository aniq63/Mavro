import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Eraser, Maximize2, MessageSquareText, Minimize2, Sparkles, X } from 'lucide-react'
import WhiteboardToolbar from './WhiteboardToolbar.jsx'
import { loopLesson } from '../services/whiteboardModel.js'

const BOARD_WIDTH = 1000
const BOARD_HEIGHT = 650
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `element-${Date.now()}-${Math.random().toString(16).slice(2)}`

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y)
  const position = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy))
}

function isNearStudentElement(element, point, radius) {
  if (element.kind === 'stroke') {
    for (let index = 1; index < element.points.length; index += 1) {
      if (distanceToSegment(point, element.points[index - 1], element.points[index]) <= radius + element.width / 2) return true
    }
    return element.points.length === 1 && Math.hypot(point.x - element.points[0].x, point.y - element.points[0].y) <= radius + element.width / 2
  }
  if (element.kind === 'arrow') return distanceToSegment(point, { x: element.x, y: element.y }, { x: element.x + element.width, y: element.y + element.height }) <= radius + element.strokeWidth / 2
  if (element.kind === 'rectangle') {
    const left = Math.min(element.x, element.x + element.width)
    const right = Math.max(element.x, element.x + element.width)
    const top = Math.min(element.y, element.y + element.height)
    const bottom = Math.max(element.y, element.y + element.height)
    const withinExpandedBox = point.x >= left - radius && point.x <= right + radius && point.y >= top - radius && point.y <= bottom + radius
    const insideBox = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
    return withinExpandedBox && (insideBox || Math.min(Math.abs(point.x - left), Math.abs(point.x - right), Math.abs(point.y - top), Math.abs(point.y - bottom)) <= radius + element.strokeWidth / 2)
  }
  if (element.kind === 'ellipse') {
    const rx = Math.abs(element.width / 2)
    const ry = Math.abs(element.height / 2)
    if (!rx || !ry) return false
    const normalized = Math.hypot((point.x - (element.x + element.width / 2)) / rx, (point.y - (element.y + element.height / 2)) / ry)
    return Math.abs(normalized - 1) * Math.min(rx, ry) <= radius + element.strokeWidth / 2
  }
  if (element.kind === 'text') {
    const textWidth = Math.max(element.fontSize, element.text.length * element.fontSize * .62)
    return point.x >= element.x - radius && point.x <= element.x + textWidth + radius && point.y >= element.y - element.fontSize - radius && point.y <= element.y + radius
  }
  return false
}

function BoardElement({ element, selected, onPointerDown }) {
  const common = { 'data-element-id': element.id, onPointerDown, className: `student-element${selected ? ' is-selected' : ''}` }
  if (element.kind === 'stroke') {
    const points = element.points.map(({ x, y }) => `${x},${y}`).join(' ')
    return <polyline {...common} points={points} fill="none" stroke={element.color} strokeWidth={element.width} strokeLinecap="round" strokeLinejoin="round" />
  }
  if (element.kind === 'rectangle') return <rect {...common} x={element.x} y={element.y} width={element.width} height={element.height} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} rx="6" />
  if (element.kind === 'ellipse') return <ellipse {...common} cx={element.x + element.width / 2} cy={element.y + element.height / 2} rx={Math.abs(element.width / 2)} ry={Math.abs(element.height / 2)} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} />
  if (element.kind === 'arrow') return <line {...common} x1={element.x} y1={element.y} x2={element.x + element.width} y2={element.y + element.height} stroke={element.color} strokeWidth={element.strokeWidth} markerEnd="url(#student-arrow-head)" />
  return <text {...common} x={element.x} y={element.y} fill={element.color} fontSize={element.fontSize} fontFamily="Inter, sans-serif">{element.text}</text>
}

function TeachingLayer({ activeStep }) {
  return (
    <g className="teaching-layer" aria-label="AI teaching example">
      <g transform="translate(15 -32) scale(1.35 1.1)">
      <text x="65" y="56" className="board-kicker">PYTHON · CONTROL FLOW</text>
      <text x="65" y="91" className="board-title">A for loop, step by step</text>
      <text x="65" y="119" className="board-subtitle">One instruction, three values. Let’s trace what happens.</text>
      <rect x="65" y="145" width="378" height="142" rx="12" className="lesson-code-card" />
      <text x="87" y="174" className="code-caption">YOUR CODE</text>
      <line x1="87" y1="188" x2="421" y2="188" className="code-separator" />
      <text x="91" y="220" className="code-line-number">1</text><text x="91" y="253" className="code-line-number">2</text>
      <rect x="119" y="200" width="302" height="28" rx="5" className={activeStep === 'step-1' ? 'code-highlight' : 'code-highlight code-highlight-muted'} />
      <rect x="119" y="233" width="302" height="28" rx="5" className="code-highlight-secondary" />
      <text x="133" y="220" className="lesson-code"><tspan className="token-purple">for</tspan><tspan> i </tspan><tspan className="token-purple">in</tspan><tspan> </tspan><tspan className="token-blue">range</tspan><tspan>(</tspan><tspan className="token-orange">3</tspan><tspan>):</tspan></text>
      <text x="133" y="253" className="lesson-code"><tspan>    </tspan><tspan className="token-blue">print</tspan><tspan>(i)</tspan></text>
      <rect x="65" y="307" width="378" height="140" rx="12" className="output-card" />
      <text x="87" y="337" className="code-caption">THE OUTPUT</text>
      <rect x="347" y="320" width="76" height="23" rx="11.5" className="output-pill" />
      <circle cx="360" cy="331.5" r="3" className="output-dot" /><text x="369" y="335" className="output-pill-text">3 lines</text>
      <rect x="87" y="353" width="334" height="73" rx="7" className="output-terminal" />
      <text x="104" y="378" className={`output-line${activeStep === 'step-1' ? ' output-line-active' : ''}`}>0</text>
      <text x="104" y="399" className={`output-line${activeStep === 'step-2' ? ' output-line-active' : ''}`}>1</text>
      <text x="104" y="420" className={`output-line${activeStep === 'step-3' ? ' output-line-active' : ''}`}>2</text>
      <text x="65" y="477" className="steps-title">FOLLOW THE VALUE OF <tspan className="token-blue">i</tspan></text>
      {loopLesson.steps.map((step, index) => {
        const x = 65 + index * 196
        const active = step.id === activeStep
        return <g key={step.id} className={`lesson-step${active ? ' is-current' : ''}`}>
          <rect x={x} y="494" width="174" height="91" rx="10" className="lesson-step-card" />
          <text x={x + 15} y="517" className="lesson-step-label">{step.label}</text>
          <text x={x + 15} y="550" className="lesson-step-value">{step.codeLine}</text>
          <text x={x + 15} y="570" className="lesson-step-output">prints “{step.output}”</text>
          {index < 2 && <path d={`M${x + 177} 539h14`} className="step-connector" markerEnd="url(#teaching-arrow-head)" />}
        </g>
      })}
      <text x="65" y="615" className="lesson-footnote">range(3) includes 0 and stops before 3.</text>
      </g>
      <text x="933" y="614" className="board-watermark">MAVRO · LESSON</text>
    </g>
  )
}

export default function Whiteboard({ elements, addElement, updateElement, removeElement, canUndo, canRedo, undo, redo, clear, activeStep, boardTab, setBoardTab, onAskAboutBoard }) {
  const svgRef = useRef(null)
  const whiteboardRef = useRef(null)
  const erasingRef = useRef(false)
  const erasedIdsRef = useRef(new Set())
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState('#6558e8')
  const [width, setWidth] = useState(4)
  const [zoom, setZoom] = useState(1)
  const [draft, setDraft] = useState(null)
  const [drag, setDrag] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [textPrompt, setTextPrompt] = useState(null)
  const [textValue, setTextValue] = useState('')
  const [clearDialog, setClearDialog] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === whiteboardRef.current)
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])

  const toggleFullscreen = async () => {
    const whiteboard = whiteboardRef.current
    if (!whiteboard) return
    try {
      if (document.fullscreenElement === whiteboard) await document.exitFullscreen()
      else if (whiteboard.requestFullscreen) await whiteboard.requestFullscreen()
    } catch {
      setIsFullscreen(false)
    }
  }

  const pointFromEvent = (event) => {
    const rect = svgRef.current.getBoundingClientRect()
    const scale = Math.min(rect.width / BOARD_WIDTH, rect.height / BOARD_HEIGHT)
    const offsetX = (rect.width - BOARD_WIDTH * scale) / 2
    const offsetY = (rect.height - BOARD_HEIGHT * scale) / 2
    const rawX = (event.clientX - rect.left - offsetX) / scale
    const rawY = (event.clientY - rect.top - offsetY) / scale
    const zoomOffsetX = BOARD_WIDTH * (1 - zoom) / 2
    const zoomOffsetY = BOARD_HEIGHT * (1 - zoom) / 2
    return { x: Math.max(0, Math.min(BOARD_WIDTH, (rawX - zoomOffsetX) / zoom)), y: Math.max(0, Math.min(BOARD_HEIGHT, (rawY - zoomOffsetY) / zoom)) }
  }

  const eraseAtPoint = (point) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const screenScale = Math.min(rect.width / BOARD_WIDTH, rect.height / BOARD_HEIGHT) * zoom
    const eraserRadius = 16 / Math.max(screenScale, .01)
    elements.forEach((element) => {
      if (!erasedIdsRef.current.has(element.id) && isNearStudentElement(element, point, eraserRadius)) {
        erasedIdsRef.current.add(element.id)
        removeElement(element.id)
      }
    })
  }

  const onPointerDown = (event) => {
    if (event.button !== 0) return
    const targetId = event.target.closest?.('[data-element-id]')?.getAttribute('data-element-id')
    const point = pointFromEvent(event)
    if (tool === 'eraser') {
      event.preventDefault()
      event.stopPropagation()
      erasedIdsRef.current = new Set()
      erasingRef.current = true
      svgRef.current?.setPointerCapture(event.pointerId)
      eraseAtPoint(point)
      return
    }
    if (targetId && tool === 'select') {
      event.stopPropagation()
      const item = elements.find((element) => element.id === targetId)
      setSelectedId(targetId)
      if (item) { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ id: targetId, start: point, item }) }
      return
    }
    setSelectedId(null)
    if (tool === 'text') {
      const rect = event.currentTarget.getBoundingClientRect()
      setTextPrompt({ ...point, left: (event.clientX - rect.left) / rect.width * 100, top: (event.clientY - rect.top) / rect.height * 100 })
      setTextValue('')
      return
    }
    if (tool === 'select' || tool === 'eraser') return
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'pen') setDraft({ kind: 'stroke', id: makeId(), points: [point], color, width })
    else setDraft({ kind: tool, id: makeId(), x: point.x, y: point.y, width: 0, height: 0, color, strokeWidth: width, start: point })
  }

  const onPointerMove = (event) => {
    const point = pointFromEvent(event)
    if (tool === 'eraser' && erasingRef.current) {
      eraseAtPoint(point)
      return
    }
    if (drag) {
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      if (drag.item.kind === 'stroke') setDraft({ ...drag.item, points: drag.item.points.map((item) => ({ x: item.x + dx, y: item.y + dy })) })
      else setDraft({ ...drag.item, x: drag.item.x + dx, y: drag.item.y + dy })
      return
    }
    if (!draft) return
    if (draft.kind === 'stroke') setDraft((current) => ({ ...current, points: [...current.points, point] }))
    else {
      const start = draft.start
      if (draft.kind === 'arrow') setDraft((current) => ({ ...current, width: point.x - start.x, height: point.y - start.y }))
      else setDraft((current) => ({ ...current, x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }))
    }
  }

  const onPointerUp = () => {
    erasingRef.current = false
    erasedIdsRef.current = new Set()
    if (drag && draft) updateElement(drag.id, draft.kind === 'stroke' ? { points: draft.points } : { x: draft.x, y: draft.y })
    else if (draft) {
      if (draft.kind === 'stroke' && draft.points.length > 1) addElement(draft)
      if (draft.kind !== 'stroke' && Math.abs(draft.width) + Math.abs(draft.height) > 8) {
        const shape = { ...draft }
        delete shape.start
        addElement(shape)
      }
    }
    setDraft(null)
    setDrag(null)
  }

  const saveText = (event) => {
    event.preventDefault()
    if (textValue.trim() && textPrompt) addElement({ id: makeId(), kind: 'text', x: textPrompt.x, y: textPrompt.y, text: textValue.trim().slice(0, 120), color, fontSize: 20 })
    setTextPrompt(null)
    setTextValue('')
  }

  const handleClear = () => {
    if (!elements.length) return
    setClearDialog(true)
  }

  const renderedElements = draft && drag ? elements.map((item) => item.id === drag.id ? draft : item) : elements
  const zoomTransform = `translate(${BOARD_WIDTH * (1 - zoom) / 2} ${BOARD_HEIGHT * (1 - zoom) / 2}) scale(${zoom})`
  const textPromptStyle = textPrompt ? { left: `${textPrompt.left}%`, top: `${textPrompt.top}%` } : undefined

  return (
    <section ref={whiteboardRef} className="whiteboard-panel-main" aria-label="Interactive teaching whiteboard">
      <div className="board-header">
        <div className="board-heading-left"><span className="board-heading-icon"><Sparkles size={15} /></span><div><h2>Learning board</h2><p>Python basics <span>·</span> {loopLesson.title}</p></div></div>
        <div className="board-header-actions"><span className="board-live-status"><i /> EXAMPLE LESSON</span><button type="button" className="board-icon-button" title="About this example" aria-label="About this example" onClick={onAskAboutBoard}><MessageSquareText size={16} /></button><button type="button" className="board-icon-button" title={isFullscreen ? 'Exit full screen' : 'Enter full screen'} aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></div>
      </div>
      <div className="board-tabs" role="tablist" aria-label="Whiteboard content">
        <button type="button" role="tab" aria-selected={boardTab === 'lesson'} className={boardTab === 'lesson' ? 'is-active' : ''} onClick={() => setBoardTab('lesson')}>Tutor lesson <span className="tab-dot" /></button>
        <button type="button" role="tab" aria-selected={boardTab === 'notes'} className={boardTab === 'notes' ? 'is-active' : ''} onClick={() => setBoardTab('notes')}>My notes {elements.length > 0 && <span className="notes-count">{elements.length}</span>}</button>
        <span className="board-tab-hint"><span className="hint-dot" /> {tool === 'pen' ? 'Draw anywhere on the board' : tool === 'text' ? 'Click to add a note' : tool === 'eraser' ? 'Drag over your marks to erase' : 'Click and drag to interact'}</span>
      </div>
      <WhiteboardToolbar tool={tool} setTool={setTool} color={color} setColor={setColor} width={width} setWidth={setWidth} canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} onClear={handleClear} zoom={zoom} setZoom={setZoom} onResetView={() => setZoom(1)} />
      <div className={`board-viewport${tool === 'pen' || ['rectangle', 'ellipse', 'arrow'].includes(tool) ? ' is-drawing' : ''}${tool === 'eraser' ? ' is-erasing' : ''}`}>
        {boardTab === 'lesson' ? <svg ref={svgRef} className="teaching-board" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} role="img" aria-label="Whiteboard lesson: Python for loop range 3 prints 0, 1, and 2" preserveAspectRatio="xMidYMid meet" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <defs><pattern id="board-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#e7e9f1" /></pattern><marker id="student-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker><marker id="teaching-arrow-head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 6 3 0 6" fill="none" stroke="#9d9bb7" strokeWidth="1.2" /></marker></defs>
          <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#fdfdff" /><rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="url(#board-grid)" />
          <g transform={zoomTransform}><TeachingLayer activeStep={activeStep} /><rect className="student-hit-area" x="0" y="0" width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="transparent" />{renderedElements.map((element) => <BoardElement key={element.id} element={element} selected={element.id === selectedId} onPointerDown={(event) => { event.stopPropagation(); onPointerDown(event) }} />)}{draft && !drag && <BoardElement element={draft} selected={false} />}</g>
        </svg> : <svg ref={svgRef} className="teaching-board notes-board" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} role="img" aria-label="Your notes whiteboard. Draw or write your own ideas here." preserveAspectRatio="xMidYMid meet" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <defs><pattern id="notes-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#e7e9f1" /></pattern><marker id="student-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker></defs><rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#fdfdff" /><rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="url(#notes-grid)" />
          {elements.length === 0 && !draft && <g className="board-empty-state"><rect x="245" y="227" width="510" height="190" rx="15" className="empty-state-card" /><circle cx="500" cy="278" r="24" className="empty-state-icon" /><path d="M490 278h20M500 268v20" className="empty-state-plus" /><text x="500" y="326" textAnchor="middle" className="empty-state-title">A space for your thinking</text><text x="500" y="352" textAnchor="middle" className="empty-state-copy">Choose a tool above and sketch, label, or work it out.</text><text x="500" y="379" textAnchor="middle" className="empty-state-shortcut">YOUR NOTES ARE SEPARATE FROM THE TUTOR LESSON</text></g>}
          <g transform={zoomTransform}>{renderedElements.map((element) => <BoardElement key={element.id} element={element} selected={element.id === selectedId} onPointerDown={onPointerDown} />)}{draft && <BoardElement element={draft} selected={false} />}</g>
        </svg>}
        {textPrompt && <form className="board-text-prompt" style={textPromptStyle} onSubmit={saveText}><input autoFocus aria-label="Text to add to whiteboard" value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Write a note…" maxLength={120} /><button type="submit" aria-label="Add text" disabled={!textValue.trim()}><Check size={14} /></button><button type="button" aria-label="Cancel text" onClick={() => setTextPrompt(null)}><X size={14} /></button></form>}
        {selectedId && tool === 'select' && <button className="deselect-hint" type="button" onClick={() => setSelectedId(null)}><X size={12} /> Deselect</button>}
      </div>
      <div className="board-footer"><div><span className="board-cursor-icon">⌖</span><span>Student notes and tutor visuals are kept separate</span></div><button type="button" onClick={onAskAboutBoard}>Ask about this lesson <ChevronDown size={13} /></button></div>
      {clearDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClearDialog(false) }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title"><div className="confirm-icon"><Eraser size={18} /></div><h3 id="clear-title">Clear your notes?</h3><p>This removes your drawings and notes from the board. The tutor’s example lesson will stay untouched.</p><div className="confirm-actions"><button type="button" className="cancel-clear" onClick={() => setClearDialog(false)}>Keep notes</button><button type="button" className="confirm-clear" onClick={() => { clear(); setSelectedId(null); setClearDialog(false) }}>Clear notes</button></div></section></div>}
    </section>
  )
}
