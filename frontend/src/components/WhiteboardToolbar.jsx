import { useRef } from 'react'
import { ArrowUpRight, Circle, Eraser, Hand, Minus, MousePointer2, Pen, Redo2, RectangleHorizontal, RotateCcw, Type, Undo2 } from 'lucide-react'
import { DRAW_COLORS } from '../theme.js'

const tools = [
  { id: 'select', label: 'Select and move', Icon: MousePointer2 },
  { id: 'pen', label: 'Pen', Icon: Pen },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'text', label: 'Add text', Icon: Type },
  { id: 'rectangle', label: 'Rectangle', Icon: RectangleHorizontal },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
]
const swatches = DRAW_COLORS

export default function WhiteboardToolbar({ tool, setTool, color, setColor, width, setWidth, canUndo, canRedo, undo, redo, onClear, zoom, setZoom, onResetView }) {
  const colorInput = useRef(null)
  return (
    <div className="board-toolbar" aria-label="Whiteboard tools">
      <div className="toolbar-tool-group">
        {tools.map(({ id, label, Icon }) => <button className={`tool-button${tool === id ? ' is-active' : ''}`} key={id} type="button" aria-label={label} title={label} aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={16} strokeWidth={1.8} /></button>)}
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-history-group">
        <button className="tool-button" type="button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo}><Undo2 size={16} /></button>
        <button className="tool-button" type="button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></button>
      </div>
      <span className="toolbar-divider toolbar-divider-wide" />
      <div className="toolbar-style-group">
        <div className="color-picker-wrap">
          <button className="color-picker-button" type="button" aria-label="Choose stroke color" title="Choose color" onClick={() => colorInput.current?.click()}><span style={{ backgroundColor: color }} /><input ref={colorInput} aria-label="Custom stroke color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></button>
          <div className="color-swatches" aria-label="Color presets">{swatches.map((swatch) => <button key={swatch} type="button" title={`Use ${swatch}`} aria-label={`Use ${swatch}`} className={color === swatch ? 'is-selected' : ''} style={{ '--swatch': swatch }} onClick={() => setColor(swatch)} />)}</div>
        </div>
        <label className="stroke-size" title="Stroke width"><Minus size={13} /><select aria-label="Stroke width" value={width} onChange={(event) => setWidth(Number(event.target.value))}><option value="2">Thin</option><option value="4">Medium</option><option value="7">Thick</option></select></label>
      </div>
      <span className="toolbar-spacer" />
      <div className="toolbar-view-group">
        <button className="tool-button zoom-button" type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.75, +(value - .1).toFixed(2)))}><Minus size={15} /></button>
        <button className="zoom-value" type="button" title="Reset zoom" onClick={onResetView}>{Math.round(zoom * 100)}%</button>
        <button className="tool-button zoom-button" type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.35, +(value + .1).toFixed(2)))}><span className="zoom-plus">+</span></button>
        <button className="tool-button clear-button" type="button" aria-label="Clear student drawings" title="Clear student drawings" onClick={onClear}><RotateCcw size={15} /></button>
      </div>
      <span className="toolbar-mobile-grip" aria-hidden="true"><Hand size={13} /></span>
    </div>
  )
}
