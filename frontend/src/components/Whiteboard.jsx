import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Eraser, Maximize2, MessageSquareText, Minimize2, Pause, Play, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import WhiteboardToolbar from './WhiteboardToolbar.jsx'
import { BOARD_HEIGHT, BOARD_WIDTH, COLORS, applyObjectUpdates, wrapText } from '../services/lessonLayout.js'
import { PALETTE } from '../theme.js'

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `element-${Date.now()}-${Math.random().toString(16).slice(2)}`

function truncate(value, max) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

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

function SceneCode({ item, activeLine }) {
  const lines = Array.isArray(item.lines) ? item.lines : []
  const highlightedLine = activeLine ?? item.highlightedLine ?? 0
  const lineHeight = 21
  const top = item.y + 40
  const visibleLines = Math.max(1, Math.floor((item.height - 38) / lineHeight))
  const maxChars = Math.max(12, Math.floor((item.width - 66) / 7.1))
  return (
    <g className="scene-code">
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx="12" className="lesson-code-card" />
      <text x={item.x + 18} y={item.y + 22} className="code-caption">{truncate(item.label || 'CODE', 30)}</text>
      <line x1={item.x + 16} x2={item.x + item.width - 16} y1={item.y + 30} y2={item.y + 30} className="code-separator" />
      {lines.slice(0, visibleLines).map((line, index) => {
        const lineY = top + index * lineHeight
        const isActive = highlightedLine === index + 1
        return (
          <g key={`${item.id}-line-${index}`} className="wb-line-reveal" style={{ animationDelay: `${Math.min(index, 10) * 70}ms` }}>
            {isActive && <rect x={item.x + 8} y={lineY - 15} width={item.width - 16} height={lineHeight - 2} rx="5" className="code-highlight" />}
            <text x={item.x + 20} y={lineY} className="code-line-number">{String(index + 1).padStart(2, '0')}</text>
            <text x={item.x + 46} y={lineY} className="lesson-code">{truncate(line || ' ', maxChars)}</text>
          </g>
        )
      })}
    </g>
  )
}

function SceneVariable({ item, active }) {
  return (
    <g className={`scene-state${active ? ' is-active' : ''}`}>
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx="9" className="lesson-state-card" />
      <text x={item.x + 12} y={item.y + 16} className="state-label">{truncate(item.variableName || 'value', 20)}</text>
      <text x={item.x + 12} y={item.y + 35} className="state-value">{truncate(item.value || '—', 28)}</text>
    </g>
  )
}

function SceneOutput({ item, active }) {
  return (
    <g className={`scene-output${active ? ' is-active' : ''}`}>
      <rect x={item.x} y={item.y} width={item.width} height={item.height} rx="8" className="lesson-output-card" />
      <text x={item.x + 12} y={item.y + item.height / 2 + 4} className="lesson-output-text">→ {truncate(item.value || '—', 34)}</text>
    </g>
  )
}

function SceneText({ item }) {
  const role = item.role || 'note'
  const isEquation = role === 'equation'
  const isHeading = role === 'heading'
  const charsPerLine = isEquation ? 10 : isHeading ? 9.5 : 6.4
  const chars = Math.max(14, Math.floor(item.width / charsPerLine))
  const lines = wrapText(item.value, chars)
  const x = item.align === 'middle' ? item.x + item.width / 2 : item.x
  const startY = item.y + (isEquation ? 31 : isHeading ? 21 : 17)
  const lineHeight = isEquation ? 31 : isHeading ? 21 : 16
  const className = isEquation ? 'lesson-equation-text' : isHeading ? 'lesson-heading-text' : 'lesson-note-text'
  return (
    <text x={x} y={startY} textAnchor={item.align === 'middle' ? 'middle' : 'start'} className={className}>
      {lines.map((line, index) => (
        <tspan key={`${item.id}-text-${index}`} x={x} dy={index === 0 ? 0 : lineHeight}>{line}</tspan>
      ))}
    </text>
  )
}

function SceneShape({ item, active, isTop, isBottom, isFront, isBack }) {
  const labelLines = wrapText(item.label, Math.max(8, Math.floor(item.width / 8)))
  const labelStart = item.cy - (labelLines.length - 1) * 7 - (item.value ? 5 : 0)
  return (
    <g className={`scene-node${active ? ' is-active' : ''}`}>
      {item.shapeType === 'ellipse' || item.shapeType === 'circle' ? (
        <ellipse cx={item.cx} cy={item.cy} rx={item.width / 2} ry={item.height / 2} className="lesson-node" fill={active ? COLORS.accentSoft : PALETTE.white} stroke={item.color || COLORS.accent} />
      ) : (
        <rect x={item.x} y={item.y} width={item.width} height={item.height} rx="11" className="lesson-node" fill={active ? COLORS.accentSoft : PALETTE.white} stroke={item.color || COLORS.accent} />
      )}
      {labelLines.slice(0, 2).map((line, index) => (
        <text key={`${item.id}-label-${index}`} x={item.cx} y={labelStart + index * 14} textAnchor="middle" className="lesson-node-label">{line}</text>
      ))}
      {item.value && <text x={item.cx} y={item.cy + 17} textAnchor="middle" className="lesson-node-value">{truncate(item.value, 24)}</text>}
      {isTop && <text x={item.cx} y={item.y - 12} textAnchor="middle" className="structure-label">TOP</text>}
      {isBottom && <text x={item.cx} y={item.y + item.height + 17} textAnchor="middle" className="structure-label">BOTTOM</text>}
      {isFront && <text x={item.x - 8} y={item.y - 10} textAnchor="start" className="structure-label">FRONT</text>}
      {isBack && <text x={item.x + item.width} y={item.y - 10} textAnchor="end" className="structure-label">BACK</text>}
    </g>
  )
}

function SceneArrow({ item }) {
  const geometry = item.geometry
  if (!geometry) return null
  const label = truncate(item.label, 30)
  const labelWidth = Math.max(20, label.length * 5.4 + 12)
  return (
    <g className="scene-arrow">
      <line x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2} stroke={COLORS.boardArrow} strokeWidth="1.8" markerEnd="url(#teaching-arrow-head)" />
      {label && (
        <>
          <rect x={geometry.labelX - labelWidth / 2} y={geometry.labelY - 10} width={labelWidth} height="18" rx="9" className="arrow-label-bg" />
          <text x={geometry.labelX} y={geometry.labelY + 4} textAnchor="middle" className="arrow-label">{label}</text>
        </>
      )}
    </g>
  )
}

function EmptyLessonLayer() {
  return (
    <g className="teaching-layer" aria-label="Waiting for AI lesson">
      <text x="500" y="290" textAnchor="middle" className="board-subtitle">Ask a question to start your lesson.</text>
      <text x="500" y="318" textAnchor="middle" className="lesson-footnote">Mavro will draw the explanation here, one step at a time.</text>
    </g>
  )
}

function LessonScene({ scene, revealedKeys, currentStepIndex }) {
  if (!scene) return <EmptyLessonLayer />
  const revealed = revealedKeys || new Set()
  const visible = scene.objects
    .filter((object) => revealed.has(object.key))
    .map((object) => applyObjectUpdates(object, revealed))
  const shapes = visible.filter((object) => object.kind === 'shape')
  const arrows = visible.filter((object) => object.kind === 'arrow')
  const codeBlocks = visible.filter((object) => object.kind === 'code')
  const texts = visible.filter((object) => object.kind === 'text')
  const variables = visible.filter((object) => object.kind === 'variable')
  const outputs = visible.filter((object) => object.kind === 'output')
  const allShapes = scene.objects.filter((object) => object.kind === 'shape')
  const shapeRank = new Map(allShapes.map((object, index) => [object.id, index]))
  const currentStep = scene.steps[currentStepIndex]
  const activeTargets = new Set()
  let activeCodeLine = 0

  for (const action of currentStep?.actions || []) {
    const raw = action.raw || {}
    const target = String(raw.target_id ?? raw.id ?? '').trim()
    if (target && ['show_variable', 'show_output', 'add_shape', 'update_element', 'highlight_element'].includes(action.type)) {
      activeTargets.add(target)
    }
    if (action.type === 'highlight_code') activeCodeLine = Math.max(activeCodeLine, Number(raw.line) || 0)
  }

  return (
    <g className="teaching-layer" aria-label={`Teaching lesson: ${scene.title}`}>
      <text x="56" y="29" className="scene-kicker">{scene.layout.toUpperCase()} · LESSON</text>
      <text x="56" y="52" className="scene-title">{truncate(scene.title, 54)}</text>
      {currentStep && <text x="944" y="29" textAnchor="end" className="scene-step-label">{`STEP ${currentStepIndex + 1} / ${scene.steps.length}`}</text>}
      {currentStep && <text x="944" y="52" textAnchor="end" className="scene-step-title">{truncate(currentStep.title, 34)}</text>}

      {!visible.length && <text x="500" y="320" textAnchor="middle" className="lesson-footnote">Preparing the board…</text>}

      {arrows.map((item) => <SceneArrow key={item.key} item={item} />)}
      {shapes.map((item) => {
        const rank = shapeRank.get(item.id)
        return (
          <SceneShape
            key={item.key}
            item={item}
            active={activeTargets.has(item.id)}
            isTop={scene.structure === 'stack' && rank === allShapes.length - 1}
            isBottom={scene.structure === 'stack' && rank === 0}
            isFront={scene.structure === 'queue' && rank === 0}
            isBack={scene.structure === 'queue' && rank === allShapes.length - 1}
          />
        )
      })}
      {codeBlocks.map((item) => <SceneCode key={item.key} item={item} activeLine={activeCodeLine} />)}
      {texts.map((item) => <SceneText key={item.key} item={item} />)}
      {variables.map((item) => <SceneVariable key={item.key} item={item} active={activeTargets.has(item.id)} />)}
      {outputs.map((item) => <SceneOutput key={item.key} item={item} active={activeTargets.has(item.id)} />)}

      {scene.layout === 'code' && (variables.length > 0 || outputs.length > 0) && <text x={scene.hasCode && scene.structure ? 56 : 648} y={scene.hasCode && scene.structure ? 510 : 73} className="steps-title">STATE</text>}
      <text x="933" y="614" className="board-watermark">MAVRO · LESSON</text>
    </g>
  )
}

export default function Whiteboard({ elements, addElement, updateElement, removeElement, canUndo, canRedo, undo, redo, clear, boardTab, setBoardTab, onAskAboutBoard, scene, revealedKeys, playback }) {
  const svgRef = useRef(null)
  const whiteboardRef = useRef(null)
  const erasingRef = useRef(false)
  const erasedIdsRef = useRef(new Set())
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState(PALETTE.violet)
  const [width, setWidth] = useState(4)
  const [zoom, setZoom] = useState(1)
  const [draft, setDraft] = useState(null)
  const [drag, setDrag] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [textPrompt, setTextPrompt] = useState(null)
  const [textValue, setTextValue] = useState('')
  const [clearDialog, setClearDialog] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const play = playback || {}
  const lessonTitle = scene?.title || 'Ask a question to start'
  const totalSteps = scene?.steps?.length || 0
  const stepNumber = totalSteps ? Math.min((play.currentStepIndex || 0) + 1, totalSteps) : 0
  const canControl = Boolean(scene && play.hasLesson)
  const statusLabel = play.isPaused
    ? 'PAUSED'
    : play.status === 'loading'
      ? 'PREPARING VOICE'
      : play.isPlaying
        ? 'NARRATING'
        : play.isFinished
          ? 'LESSON COMPLETE'
          : scene
            ? 'READY TO REPLAY'
            : 'READY'
  const progress = totalSteps ? Math.round((stepNumber / totalSteps) * 100) : 0
  const toolHint = tool === 'pen' ? 'Draw anywhere on the board' : tool === 'text' ? 'Click to add a note' : tool === 'eraser' ? 'Drag over your marks to erase' : 'Click and drag to interact'

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

  const togglePlayback = () => {
    if (!canControl) return
    if (play.isPlaying) play.pause()
    else if (play.isPaused) play.resume()
    else play.restart()
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
        <div className="board-heading-left"><span className="board-heading-icon"><Sparkles size={15} /></span><div><h2>Learning board</h2><p>{lessonTitle}</p></div></div>
        <div className="board-header-actions">
          <span className="board-live-status"><i /> {statusLabel}</span>
          <div className="board-playback-controls" role="group" aria-label="Lesson narration controls">
            <button type="button" className="board-icon-button" title={play.isPlaying ? 'Pause narration' : play.isPaused ? 'Resume narration' : 'Play lesson'} aria-label={play.isPlaying ? 'Pause narration' : play.isPaused ? 'Resume narration' : 'Play lesson'} onClick={togglePlayback} disabled={!canControl}>{play.isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
            <button type="button" className="board-icon-button" title="Replay this step" aria-label="Replay this step" onClick={() => play.replay?.()} disabled={!canControl}><RotateCcw size={14} /></button>
            <button type="button" className="board-icon-button" title="Stop narration" aria-label="Stop narration" onClick={() => play.stop?.()} disabled={!canControl}><Square size={12} /></button>
          </div>
          <button type="button" className="board-icon-button" title="Ask about this lesson" aria-label="Ask about this lesson" onClick={onAskAboutBoard}><MessageSquareText size={16} /></button>
          <button type="button" className="board-icon-button" title={isFullscreen ? 'Exit full screen' : 'Enter full screen'} aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        </div>
      </div>
      <div className="board-tabs" role="tablist" aria-label="Whiteboard content">
        <button type="button" role="tab" aria-selected={boardTab === 'lesson'} className={boardTab === 'lesson' ? 'is-active' : ''} onClick={() => setBoardTab('lesson')}>Tutor lesson <span className="tab-dot" /></button>
        <button type="button" role="tab" aria-selected={boardTab === 'notes'} className={boardTab === 'notes' ? 'is-active' : ''} onClick={() => setBoardTab('notes')}>My notes {elements.length > 0 && <span className="notes-count">{elements.length}</span>}</button>
        <span className="board-tab-hint"><span className="hint-dot" /> {scene ? `Step ${stepNumber} of ${totalSteps} · narration leads each reveal` : toolHint}</span>
      </div>
      <WhiteboardToolbar tool={tool} setTool={setTool} color={color} setColor={setColor} width={width} setWidth={setWidth} canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo} onClear={handleClear} zoom={zoom} setZoom={setZoom} onResetView={() => setZoom(1)} />
      <div className={`board-viewport${tool === 'pen' || ['rectangle', 'ellipse', 'arrow'].includes(tool) ? ' is-drawing' : ''}${tool === 'eraser' ? ' is-erasing' : ''}`}>
        {boardTab === 'lesson' ? <svg ref={svgRef} className="teaching-board" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} role="img" aria-label={`Whiteboard lesson: ${lessonTitle}`} preserveAspectRatio="xMidYMid meet" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <defs><pattern id="board-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill={PALETTE.line} /></pattern><marker id="student-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker><marker id="teaching-arrow-head" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 7 3.5 0 7" fill="none" stroke={COLORS.boardArrow} strokeWidth="1.4" /></marker></defs>
          <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill={PALETTE.white} /><rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="url(#board-grid)" />
          <g transform={zoomTransform}><LessonScene scene={scene} revealedKeys={revealedKeys} currentStepIndex={play.currentStepIndex || 0} /><rect className="student-hit-area" x="0" y="0" width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="transparent" />{renderedElements.map((element) => <BoardElement key={element.id} element={element} selected={element.id === selectedId} onPointerDown={(event) => { event.stopPropagation(); onPointerDown(event) }} />)}{draft && !drag && <BoardElement element={draft} selected={false} />}</g>
        </svg> : <svg ref={svgRef} className="teaching-board notes-board" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} role="img" aria-label="Your notes whiteboard. Draw or write your own ideas here." preserveAspectRatio="xMidYMid meet" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <defs><pattern id="notes-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill={PALETTE.line} /></pattern><marker id="student-arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker></defs><rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill={PALETTE.white} /><rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="url(#notes-grid)" />
          {elements.length === 0 && !draft && <g className="board-empty-state"><rect x="245" y="227" width="510" height="190" rx="15" className="empty-state-card" /><circle cx="500" cy="278" r="24" className="empty-state-icon" /><path d="M490 278h20M500 268v20" className="empty-state-plus" /><text x="500" y="326" textAnchor="middle" className="empty-state-title">A space for your thinking</text><text x="500" y="352" textAnchor="middle" className="empty-state-copy">Choose a tool above and sketch, label, or work it out.</text><text x="500" y="379" textAnchor="middle" className="empty-state-shortcut">YOUR NOTES ARE SEPARATE FROM THE TUTOR LESSON</text></g>}
          <g transform={zoomTransform}>{renderedElements.map((element) => <BoardElement key={element.id} element={element} selected={element.id === selectedId} onPointerDown={onPointerDown} />)}{draft && <BoardElement element={draft} selected={false} />}</g>
        </svg>}
        {textPrompt && <form className="board-text-prompt" style={textPromptStyle} onSubmit={saveText}><input autoFocus aria-label="Text to add to whiteboard" value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Write a note…" maxLength={120} /><button type="submit" aria-label="Add text" disabled={!textValue.trim()}><Check size={14} /></button><button type="button" aria-label="Cancel text" onClick={() => setTextPrompt(null)}><X size={14} /></button></form>}
        {selectedId && tool === 'select' && <button className="deselect-hint" type="button" onClick={() => setSelectedId(null)}><X size={12} /> Deselect</button>}
        {boardTab === 'lesson' && scene && <div className="lesson-step-meter" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>}
      </div>
      <div className="board-footer"><div><span className="board-cursor-icon">⌖</span><span>{scene ? 'Narration advances each step · notes stay separate' : 'Student notes and tutor visuals are kept separate'}</span></div><button type="button" onClick={onAskAboutBoard}>Ask about this lesson <ChevronDown size={13} /></button></div>
      {clearDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClearDialog(false) }}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title"><div className="confirm-icon"><Eraser size={18} /></div><h3 id="clear-title">Clear your notes?</h3><p>This removes your drawings and notes from the board. The tutor's lesson will stay untouched.</p><div className="confirm-actions"><button type="button" className="cancel-clear" onClick={() => setClearDialog(false)}>Keep notes</button><button type="button" className="confirm-clear" onClick={() => { clear(); setSelectedId(null); setClearDialog(false) }}>Clear notes</button></div></section></div>}
    </section>
  )
}
