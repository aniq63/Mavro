/**
 * Deterministic teaching-board layout engine.
 *
 * The model supplies teaching intent and ordered actions. This module owns all
 * geometry, validates every value it receives, and packs the result into safe
 * regions so diagrams, text, code, state, and output panels can never overlap
 * or clip — regardless of how much content the model returns.
 */

import { PALETTE } from '../theme.js'

export const BOARD_WIDTH = 1000
export const BOARD_HEIGHT = 650

/** Safe body region below the fixed lesson header and above the watermark. */
const SAFE = Object.freeze({ x: 30, y: 76, width: 940, height: 552 })
const SAFE_RIGHT = SAFE.x + SAFE.width
const SAFE_BOTTOM = SAFE.y + SAFE.height

const CODE_SLOT_ID = 'code-main'

export const COLORS = Object.freeze({
  ink: PALETTE.ink,
  muted: PALETTE.muted,
  accent: PALETTE.violet,
  accentSoft: PALETTE.violetWash,
  amber: PALETTE.syntaxOrange,
  green: PALETTE.tealInk,
  boardArrow: PALETTE.boardArrow,
})

const SERIES_COLORS = [PALETTE.violet, PALETTE.teal, PALETTE.syntaxOrange, PALETTE.syntaxBlue, PALETTE.coral]

const VALID_LAYOUTS = ['code', 'flow', 'stack', 'queue', 'tree', 'equation', 'concept']
const BOX_KINDS = new Set(['code', 'shape', 'text', 'variable', 'output', 'table', 'graph'])

const ROLE_STYLES = {
  equation: { fontSize: 20, lineHeight: 28, align: 'middle' },
  heading: { fontSize: 16, lineHeight: 22, align: 'start' },
  note: { fontSize: 11, lineHeight: 17, align: 'start' },
  caption: { fontSize: 9.5, lineHeight: 14, align: 'start' },
}

const text = (value) => String(value ?? '').trim()

const singleLineValue = (value) => String(value ?? '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .join(' · ')

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)

const colorOr = (value, fallback) => (isHexColor(value) ? value : fallback)

export function actionKey(stepId, action, actionIndex) {
  const explicit = text(action?.id)
  if (explicit) return `${stepId}:${explicit}`
  return `${stepId}:${text(action?.type) || 'action'}:${actionIndex}`
}

export function elementId(action, fallbackPrefix, index) {
  return text(action?.id) || text(action?.target_id) || `${fallbackPrefix}-${index + 1}`
}

/**
 * Wrap text to a maximum character count. Long unbroken words are chopped so
 * they cannot overflow their container.
 */
export function wrapText(value, maxChars = 42) {
  const limit = Math.max(4, Math.floor(maxChars))
  const words = text(value).split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const pieces = []
  for (const word of words) {
    if (word.length <= limit) {
      pieces.push(word)
      continue
    }
    for (let index = 0; index < word.length; index += limit) {
      pieces.push(word.slice(index, index + limit))
    }
  }

  const lines = []
  let line = ''
  for (const piece of pieces) {
    if (!line) {
      line = piece
    } else if (`${line} ${piece}`.length <= limit) {
      line = `${line} ${piece}`
    } else {
      lines.push(line)
      line = piece
    }
  }
  if (line) lines.push(line)
  return lines
}

function wrapToWidth(value, width, fontSize) {
  const safeWidth = Math.max(24, width)
  const charWidth = Math.max(3.2, fontSize * 0.56)
  return wrapText(value, Math.max(6, Math.floor(safeWidth / charWidth)))
}

const hasCodeTypes = (types) => types.has('show_code') || types.has('highlight_code')

const hasGraphTypes = (types) => types.has('show_graph')

function inferLayout(steps) {
  const actions = []
  let title = ''
  for (const step of steps) {
    title += ` ${step?.title || ''}`
    for (const action of step?.whiteboard_actions || []) actions.push(action)
  }
  const lowerTitle = title.toLowerCase()
  const types = new Set(actions.map((action) => text(action?.type)))
  if (hasCodeTypes(types)) return 'code'
  if (lowerTitle.includes('stack') || lowerTitle.includes('recursion') || lowerTitle.includes('call stack')) return 'stack'
  if (lowerTitle.includes('queue')) return 'queue'
  if (lowerTitle.includes('tree') || lowerTitle.includes('binary')) return 'tree'
  if (types.has('add_shape') && types.has('add_arrow')) return 'flow'
  if (hasGraphTypes(types)) return 'equation'
  if (lowerTitle.includes('equation') || lowerTitle.includes('formula') || actions.some((action) => /=/.test(text(action?.text)))) return 'equation'
  if (types.has('add_shape')) return 'concept'
  return 'concept'
}

function chooseLayout(steps) {
  const explicit = []
  const structural = new Set()
  const actionTypes = new Set()

  for (const step of steps) {
    const candidate = text(step?.layout).toLowerCase()
    if (candidate && candidate !== 'auto' && VALID_LAYOUTS.includes(candidate)) {
      explicit.push(candidate)
      if (['stack', 'queue', 'tree'].includes(candidate)) structural.add(candidate)
    }
    for (const action of step?.whiteboard_actions || []) {
      if (action?.type) actionTypes.add(text(action.type))
    }
  }

  // A lesson that draws code always needs the code template, even when the model
  // labels an early text-only step "concept" or a later call-stack step "stack".
  if (hasCodeTypes(actionTypes)) return 'code'

  if (structural.has('stack')) return 'stack'
  if (structural.has('queue')) return 'queue'
  if (structural.has('tree')) return 'tree'

  if (explicit.length && explicit.every((layout) => layout === explicit[0])) return explicit[0]
  return inferLayout(steps)
}

function shapeLabel(shape) {
  let label = text(shape.label) || text(shape.raw?.label) || text(shape.raw?.text) || text(shape.raw?.value) || shape.id
  for (const update of shape.updates || []) {
    if (typeof update.patch?.label === 'string' && update.patch.label) label = update.patch.label
  }
  return label
}

function placeBox(item, x, y, width, height) {
  item.x = x
  item.y = y
  item.width = width
  item.height = height
  if (item.kind === 'shape') {
    item.cx = x + width / 2
    item.cy = y + height / 2
  }
}

function measureTextItem(item, width, maxHeight = Infinity, fontSizeOverride) {
  const style = ROLE_STYLES[item.role] || ROLE_STYLES.note
  const ratio = style.lineHeight / style.fontSize
  let fontSize = Math.max(8, fontSizeOverride ?? style.fontSize)
  let lines = []
  let lineHeight = Math.round(fontSize * ratio * 10) / 10

  for (; fontSize >= 8; fontSize -= 0.5) {
    lineHeight = Math.round(fontSize * ratio * 10) / 10
    lines = wrapToWidth(item.value, width, fontSize)
    if (!lines.length) lines = ['']
    if (lines.length * lineHeight <= maxHeight || fontSize <= 8) break
  }

  item.fontSize = fontSize
  item.lineHeight = lineHeight
  item.lines = lines.length ? lines : ['']
  item.height = Math.max(fontSize + 4, item.lines.length * lineHeight)
  item.align = item.align || style.align
}

function layoutTextColumn(items, region, { gap = 10 } = {}) {
  if (!items.length) return region.y
  const available = Math.max(40, region.height)
  let placements = []

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const scale = Math.max(0.58, 1 - attempt * 0.07)
    placements = items.map((item) => {
      const style = ROLE_STYLES[item.role] || ROLE_STYLES.note
      const measured = { value: item.value, role: item.role, align: item.align }
      measureTextItem(measured, region.width, region.height, style.fontSize * scale)
      return measured
    })
    const total = placements.reduce((sum, placement) => sum + placement.height, 0) + gap * (placements.length - 1)
    if (total <= available || attempt === 8) break
  }

  let y = region.y
  items.forEach((item, index) => {
    const placement = placements[index]
    item.x = region.x
    item.y = y
    item.width = region.width
    item.height = placement.height
    item.fontSize = placement.fontSize
    item.lineHeight = placement.lineHeight
    item.lines = placement.lines
    item.align = placement.align || 'start'
    y += placement.height + gap
  })
  return Math.min(y - gap, region.y + region.height)
}

function measureStateItem(item, width, maxHeight = Infinity) {
  const isOutput = item.kind === 'output'
  const pad = 9
  let valueFontSize = isOutput ? 10.5 : 11
  const buildLines = () => {
    if (!isOutput) return wrapToWidth(item.value || '—', width - pad * 2, valueFontSize)
    const source = String(item.value || '—').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    return (source.length ? source : ['—']).flatMap((line) => wrapToWidth(line, width - pad * 2, valueFontSize))
  }
  let valueLines = buildLines()
  if (!valueLines.length) valueLines = ['—']

  while (valueLines.length > 4 && valueFontSize > 8) {
    valueFontSize -= 0.5
    valueLines = buildLines()
  }
  const truncated = valueLines.length > 4
  if (truncated) valueLines = valueLines.slice(0, 4)

  const labelFontSize = 7.5
  const lineHeight = Math.round(valueFontSize * 1.45 * 10) / 10
  let height = pad + labelFontSize + 5 + valueLines.length * lineHeight + pad
  if (height > maxHeight) {
    valueFontSize = 8
    valueLines = valueLines.slice(0, Math.max(1, Math.floor((maxHeight - pad * 2 - labelFontSize - 5) / 11.6)))
    height = Math.min(maxHeight, pad + labelFontSize + 5 + valueLines.length * 11.6 + pad)
  }

  const finalLineHeight = valueFontSize === 8 ? 11.6 : lineHeight
  item.valueLines = valueLines
  item.valueFontSize = valueFontSize
  item.valueLineHeight = finalLineHeight
  item.labelFontSize = labelFontSize
  item.valueTruncated = truncated
  item.height = Math.max(34, height)
  return item.height
}

function layoutStateGrid(items, region, { gap = 8 } = {}) {
  if (!items.length) return null
  const cols = clamp(Math.floor((region.width + gap) / (150 + gap)), 1, Math.min(6, items.length))
  const itemWidth = (region.width - gap * (cols - 1)) / cols
  const rows = Math.ceil(items.length / cols)
  const maxItemHeight = Math.max(34, (region.height - gap * (rows - 1)) / rows)
  const heights = items.map((item) => measureStateItem(item, itemWidth, maxItemHeight))

  let y = region.y
  for (let row = 0; row < rows; row += 1) {
    const rowStart = row * cols
    const rowItems = items.slice(rowStart, rowStart + cols)
    const rowHeight = Math.max(...rowItems.map((item, index) => heights[rowStart + index]))
    rowItems.forEach((item, index) => {
      item.width = itemWidth
      item.height = rowHeight
      item.x = region.x + index * (itemWidth + gap)
      item.y = y
    })
    y += rowHeight + gap
  }
  return y - gap
}

function layoutStateStack(items, region, { gap = 8 } = {}) {
  if (!items.length) return null
  let y = region.y
  for (const item of items) {
    const height = measureStateItem(item, region.width, Math.max(34, region.height - (y - region.y)))
    item.x = region.x
    item.y = y
    item.width = region.width
    item.height = height
    y += height + gap
  }
  return y - gap
}

function layoutShapeGrid(shapes, region, { columns, gapX = 18, gapY = 18, maxHeight = 96 } = {}) {
  const count = shapes.length
  if (!count) return region.y
  const cols = clamp(columns || (count <= 3 ? count : count <= 6 ? 3 : Math.ceil(Math.sqrt(count * 1.2))), 1, count)
  const rows = Math.ceil(count / cols)
  const width = Math.max(80, (region.width - gapX * (cols - 1)) / cols)
  const height = Math.max(42, Math.min(maxHeight, (region.height - gapY * (rows - 1)) / rows))

  shapes.forEach((shape, index) => {
    const column = index % cols
    const row = Math.floor(index / cols)
    placeBox(shape, region.x + column * (width + gapX), region.y + row * (height + gapY), width, height)
  })
  return Math.min(region.y + rows * height + (rows - 1) * gapY, region.y + region.height)
}

function layoutShapeRow(shapes, region, { gap = 16, maxHeight = 74, maxWidth = 150 } = {}) {
  const count = shapes.length
  if (!count) return region.y
  const width = Math.max(74, Math.min(maxWidth, (region.width - gap * (count - 1)) / count))
  const total = count * width + (count - 1) * gap
  const startX = region.x + Math.max(0, (region.width - total) / 2)
  const height = Math.min(maxHeight, region.height)
  shapes.forEach((shape, index) => {
    placeBox(shape, startX + index * (width + gap), region.y + (region.height - height) / 2, width, height)
  })
  return region.y + region.height
}

function layoutShapeColumn(shapes, region, { gap = 10, maxHeight = 60, maxWidth = 280, reverse = false } = {}) {
  const count = shapes.length
  if (!count) return region.y
  const height = Math.max(34, Math.min(maxHeight, (region.height - gap * (count - 1)) / count))
  const width = Math.min(maxWidth, region.width)
  const x = region.x + (region.width - width) / 2
  shapes.forEach((shape, index) => {
    const slot = reverse ? count - 1 - index : index
    placeBox(shape, x, region.y + slot * (height + gap), width, height)
  })
  return region.y + count * height + (count - 1) * gap
}

function measureShape(shape) {
  const isEllipse = shape.shapeType === 'ellipse' || shape.shapeType === 'circle'
  const usableWidth = Math.max(28, shape.width - (isEllipse ? shape.width * 0.22 : 18))
  const hasValue = Boolean(text(shape.value))
  const reservedValue = hasValue ? 20 : 8
  const maxLabelHeight = Math.max(18, shape.height - reservedValue - 10)
  let fontSize = shape.height >= 72 ? 13 : shape.height >= 54 ? 11.5 : 10
  let lineHeight = Math.round(fontSize * 1.2 * 10) / 10
  let lines = wrapToWidth(shapeLabel(shape), usableWidth, fontSize)

  while (lines.length * lineHeight > maxLabelHeight && fontSize > 8) {
    fontSize -= 0.5
    lineHeight = Math.round(fontSize * 1.2 * 10) / 10
    lines = wrapToWidth(shapeLabel(shape), usableWidth, fontSize)
  }
  if (!lines.length) lines = [shape.id]

  const maxLines = Math.max(1, Math.floor(maxLabelHeight / lineHeight))
  const clipped = lines.length > maxLines
  if (clipped) lines = lines.slice(0, maxLines)

  shape.labelLines = lines
  shape.labelFontSize = fontSize
  shape.labelLineHeight = lineHeight
  shape.labelTruncated = clipped
  shape.valueText = hasValue ? text(shape.value) : ''

  const blockHeight = lines.length * lineHeight + (hasValue ? 15 : 0)
  const top = shape.cy - blockHeight / 2 + lineHeight * 0.72
  shape.labelStartY = top
  if (hasValue) shape.valueY = top + lines.length * lineHeight + 4
  return shape
}

function measureTable(item, width, maxHeight) {
  const columns = item.columns.length ? item.columns : item.rows[0]?.map((_, index) => `Column ${index + 1}`) || []
  const colCount = clamp(columns.length, 1, 8)
  const pad = 12
  const titleHeight = item.title ? 20 : 0
  const availableWidth = Math.max(60, width - pad * 2)
  const columnWidth = availableWidth / colCount
  let fontSize = 10
  let lineHeight = 13
  let headerLines = []
  let rowsData = []
  let rowHeights = []
  let headerHeight = 24

  for (; fontSize >= 7.5; fontSize -= 0.5) {
    lineHeight = Math.round(fontSize * 1.35 * 10) / 10
    headerLines = columns.map((column) => wrapToWidth(column, columnWidth - 8, fontSize).slice(0, 2))
    headerHeight = Math.max(20, Math.max(...headerLines.map((lines) => lines.length), 1) * lineHeight + 8)
    rowsData = item.rows.slice(0, 24).map((row) => row.map((cell) => wrapToWidth(cell, columnWidth - 8, fontSize)))
    rowHeights = rowsData.map((cells) => Math.max(fontSize + 6, Math.max(...cells.map((lines) => lines.length), 1) * lineHeight + 6))
    const total = titleHeight + headerHeight + rowHeights.reduce((sum, height) => sum + height, 0) + pad * 2
    if (total <= maxHeight) break
  }

  let visibleRows = rowsData.length
  let total = titleHeight + headerHeight + rowHeights.slice(0, visibleRows).reduce((sum, height) => sum + height, 0) + pad * 2
  while (total > maxHeight && visibleRows > 1) {
    visibleRows -= 1
    total = titleHeight + headerHeight + rowHeights.slice(0, visibleRows).reduce((sum, height) => sum + height, 0) + pad * 2
  }

  item.columns = columns
  item.headerLines = headerLines
  item.rowsData = rowsData.slice(0, visibleRows)
  item.rowHeights = rowHeights.slice(0, visibleRows)
  item.truncatedRows = rowsData.length - visibleRows
  item.fontSize = fontSize
  item.lineHeight = lineHeight
  item.headerHeight = headerHeight
  item.columnWidth = columnWidth
  item.pad = pad
  item.height = Math.max(64, Math.min(maxHeight, total))
}

function measureGraph(item, width, maxHeight) {
  const height = Math.max(150, Math.min(maxHeight, width * 0.66))
  item.width = width
  item.height = height

  const pad = { left: 42, right: 16, top: item.title || item.series.length > 1 ? 32 : 16, bottom: 34 }
  const allPoints = item.series.flatMap((series) => series.points)
  if (!allPoints.length) {
    item.invalid = true
    item.plot = null
    return
  }

  let xMin = Math.min(...allPoints.map((point) => point.x))
  let xMax = Math.max(...allPoints.map((point) => point.x))
  let yMin = Math.min(...allPoints.map((point) => point.y))
  let yMax = Math.max(...allPoints.map((point) => point.y))
  if (xMin === xMax) { xMin -= 1; xMax += 1 }
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const xPad = (xMax - xMin) * 0.08
  const yPad = (yMax - yMin) * 0.1
  xMin -= xPad
  xMax += xPad
  yMin -= yPad
  yMax += yPad

  const plotWidth = Math.max(40, width - pad.left - pad.right)
  const plotHeight = Math.max(50, height - pad.top - pad.bottom)
  const mapX = (x) => item.x + pad.left + ((x - xMin) / (xMax - xMin)) * plotWidth
  const mapY = (y) => item.y + pad.top + (1 - (y - yMin) / (yMax - yMin)) * plotHeight

  item.plot = { x: pad.left, y: pad.top, width: plotWidth, height: plotHeight, xMin, xMax, yMin, yMax }
  item.seriesGeometry = item.series.map((series, index) => ({
    label: series.label,
    color: series.color || SERIES_COLORS[index % SERIES_COLORS.length],
    points: series.points.map((point) => ({ x: mapX(point.x), y: mapY(point.y) })),
  }))
  item.xTickLabels = [xMin, (xMin + xMax) / 2, xMax].map((value) => formatNumber(value))
  item.yTickLabels = [yMax, (yMin + yMax) / 2, yMin].map((value) => formatNumber(value))
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

function layoutPanels(panels, region, { gap = 12 } = {}) {
  if (!panels.length) return region.y
  const cols = region.width >= 620 && panels.length > 1 ? 2 : 1
  const rows = Math.ceil(panels.length / cols)
  const width = (region.width - gap * (cols - 1)) / cols
  const maxHeight = (region.height - gap * (rows - 1)) / rows

  panels.forEach((panel, index) => {
    const column = index % cols
    const row = Math.floor(index / cols)
    panel.x = region.x + column * (width + gap)
    panel.y = region.y + row * (maxHeight + gap)
    panel.width = width
    if (panel.kind === 'table') measureTable(panel, width, maxHeight)
    else measureGraph(panel, width, maxHeight)
  })
  return region.y + region.height
}

function getShapeMap(shapes) {
  const map = new Map()
  for (const shape of shapes) {
    map.set(shape.id.toLowerCase(), shape)
    map.set(shapeLabel(shape).toLowerCase(), shape)
  }
  return map
}

function arrowEndpointBox(arrow, shapes, shapeMap) {
  const fromKey = text(arrow.raw?.from ?? arrow.raw?.from_value).toLowerCase()
  const toKey = text(arrow.raw?.to ?? arrow.raw?.to_value).toLowerCase()
  let from = fromKey ? shapeMap.get(fromKey) : null
  let to = toKey ? shapeMap.get(toKey) : null

  if (!from && fromKey) from = shapes.find((shape) => shapeLabel(shape).toLowerCase().includes(fromKey)) || null
  if (!to && toKey) to = shapes.find((shape) => shapeLabel(shape).toLowerCase().includes(toKey)) || null

  if (!fromKey && !toKey) {
    const index = shapes.indexOf(arrow)
    from = shapes[Math.max(0, Math.min(shapes.length - 2, index - 1))] || null
    to = shapes[Math.max(1, Math.min(shapes.length - 1, index))] || null
  }

  if (!from || !to || from === to) return null
  return { from, to }
}

function pickLabelPosition(candidates, width, height, obstacles) {
  const box = (point) => ({ x: point.x - width / 2, y: point.y - height / 2, width, height })
  for (const candidate of candidates) {
    if (candidate.x - width / 2 < 6 || candidate.x + width / 2 > BOARD_WIDTH - 6) continue
    if (candidate.y - height / 2 < 6 || candidate.y + height / 2 > BOARD_HEIGHT - 6) continue
    if (!obstacles.some((obstacle) => intersect(box(candidate), obstacle, 2))) return candidate
  }
  return candidates[0]
}

function intersect(a, b, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}

function routeArrow(arrow, shapes, obstacles) {
  const shapeMap = getShapeMap(shapes)
  const ends = arrowEndpointBox(arrow, shapes, shapeMap)
  if (!ends) {
    arrow.geometry = null
    return
  }
  const { from, to } = ends
  const a = { x: from.cx, y: from.cy }
  const b = { x: to.cx, y: to.cy }
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  const segments = []
  let labelX = (a.x + b.x) / 2
  let labelY = (a.y + b.y) / 2
  let candidates

  if (horizontal) {
    const goingRight = b.x >= a.x
    const x1 = goingRight ? from.x + from.width : from.x
    const x2 = goingRight ? to.x : to.x + to.width
    const y1 = clamp(a.y, from.y + 8, from.y + from.height - 8)
    const y2 = clamp(b.y, to.y + 8, to.y + to.height - 8)
    const midX = (x1 + x2) / 2
    segments.push({ x1, y1, x2: midX, y2: y1 })
    segments.push({ x1: midX, y1, x2: midX, y2 })
    segments.push({ x1: midX, y1: y2, x2, y2 })
    candidates = [
      { x: midX, y: (y1 + y2) / 2 - 15 },
      { x: midX, y: (y1 + y2) / 2 + 15 },
      { x: (x1 + x2) / 2, y: y1 - 15 },
      { x: (x1 + x2) / 2, y: y2 + 15 },
    ]
  } else {
    const goingDown = b.y >= a.y
    const y1 = goingDown ? from.y + from.height : from.y
    const y2 = goingDown ? to.y : to.y + to.height
    const x1 = clamp(a.x, from.x + 8, from.x + from.width - 8)
    const x2 = clamp(b.x, to.x + 8, to.x + to.width - 8)
    const midY = (y1 + y2) / 2
    segments.push({ x1, y1, x2: x1, y2: midY })
    segments.push({ x1, y1: midY, x2, y2: midY })
    segments.push({ x1: x2, y1: midY, x2, y2 })
    candidates = [
      { x: (x1 + x2) / 2 + 22, y: midY },
      { x: (x1 + x2) / 2 - 22, y: midY },
      { x: x1 + 22, y: (y1 + y2) / 2 },
      { x: x2 - 22, y: (y1 + y2) / 2 },
    ]
  }

  const label = text(arrow.label).slice(0, 28)
  const labelWidth = label ? Math.min(160, Math.max(24, label.length * 5.4 + 12)) : 0
  const labelHeight = label ? 18 : 0
  if (label) {
    const chosen = pickLabelPosition(candidates, labelWidth, labelHeight, obstacles)
    labelX = chosen.x
    labelY = chosen.y
  }

  arrow.geometry = {
    segments: segments.filter((segment) => Math.abs(segment.x1 - segment.x2) > 0.5 || Math.abs(segment.y1 - segment.y2) > 0.5),
    label,
    labelX,
    labelY,
    labelWidth,
    labelHeight,
  }
}

function deoverlap(objects, gap = 6) {
  const boxes = objects.filter((object) => BOX_KINDS.has(object.kind))
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false
    boxes.sort((a, b) => a.y - b.y || a.x - b.x)
    for (let index = 0; index < boxes.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < boxes.length; otherIndex += 1) {
        const first = boxes[index]
        const second = boxes[otherIndex]
        if (!intersect(first, second, gap)) continue
        const pushY = first.y + first.height + gap - second.y
        const pushX = first.x + first.width + gap - second.x
        if (pushY > 0 && pushY <= pushX) {
          second.y += pushY
        } else if (pushX > 0) {
          second.x += pushX
        } else {
          second.y += first.height + gap
        }
        if (second.kind === 'shape') {
          second.cx = second.x + second.width / 2
          second.cy = second.y + second.height / 2
        } else if (second.kind === 'code') {
          second.contentTop = second.y + (second.headerHeight || 40)
        } else if (second.kind === 'graph') {
          measureGraph(second, second.width, second.height)
        } else if (second.kind === 'table') {
          measureTable(second, second.width, second.height)
        }
        moved = true
      }
    }
    if (!moved) break
  }
}

function boundsOf(objects, arrows) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const include = (x1, y1, x2, y2) => {
    minX = Math.min(minX, x1)
    minY = Math.min(minY, y1)
    maxX = Math.max(maxX, x2)
    maxY = Math.max(maxY, y2)
  }

  for (const object of objects) {
    if (!BOX_KINDS.has(object.kind)) continue
    include(object.x, object.y, object.x + object.width, object.y + object.height)
  }
  for (const arrow of arrows) {
    for (const segment of arrow.geometry?.segments || []) {
      include(Math.min(segment.x1, segment.x2), Math.min(segment.y1, segment.y2), Math.max(segment.x1, segment.x2), Math.max(segment.y1, segment.y2))
    }
    if (arrow.geometry?.label) {
      include(
        arrow.geometry.labelX - arrow.geometry.labelWidth / 2,
        arrow.geometry.labelY - arrow.geometry.labelHeight / 2,
        arrow.geometry.labelX + arrow.geometry.labelWidth / 2,
        arrow.geometry.labelY + arrow.geometry.labelHeight / 2,
      )
    }
  }

  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function fitToSafeArea(objects, arrows) {
  const bounds = boundsOf(objects, arrows)
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
  const padding = 6
  const fits = bounds.x >= SAFE.x - 2
    && bounds.y >= SAFE.y - 2
    && bounds.x + bounds.width <= SAFE_RIGHT + 2
    && bounds.y + bounds.height <= SAFE_BOTTOM + 2
  if (fits) return { transform: null, bounds }

  const scale = Math.min(
    1,
    (SAFE.width - padding * 2) / Math.max(bounds.width, 1),
    (SAFE.height - padding * 2) / Math.max(bounds.height, 1),
  )
  const tx = SAFE.x + (SAFE.width - bounds.width * scale) / 2 - bounds.x * scale
  const ty = SAFE.y + (SAFE.height - bounds.height * scale) / 2 - bounds.y * scale
  return { transform: `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})`, bounds }
}

function layoutCodeScene(scene, codeBlocks, shapes, texts, variables, outputs, panels) {
  // Code lessons may include a diagram without labelling the step "stack".
  // Layout those shapes in the right-hand column instead of leaving them
  // unpositioned, but leave the semantic structure labels to the model.
  const structure = scene.structure || (shapes.length ? 'diagram' : null)
  const stateItems = [...variables, ...outputs]
  const block = codeBlocks[0]
  const leftX = SAFE.x + 8
  const top = SAFE.y + 4

  if (structure) {
    const leftWidth = 540
    const rightX = leftX + leftWidth + 20
    const rightWidth = SAFE_RIGHT - rightX
    const bottomBandHeight = stateItems.length ? 118 : panels.length ? 130 : 0
    const leftBottom = SAFE_BOTTOM - bottomBandHeight - 8

    if (block) {
      const region = { x: leftX, y: top, width: leftWidth, height: Math.max(160, leftBottom - top - Math.min(112, texts.length * 42)) }
      placeCodeBlock(block, region)
    }
    const noteTop = (block?.y + block?.height || top) + 12
    if (texts.length) {
      layoutTextColumn(texts, { x: leftX, y: noteTop, width: leftWidth, height: Math.max(40, leftBottom - noteTop) }, { gap: 8 })
    }

    const structureRegion = { x: rightX, y: top, width: rightWidth, height: leftBottom - top }
    if (scene.structure === 'stack') layoutShapeColumn(shapes, structureRegion, { gap: 8, maxHeight: 58, reverse: true })
    else if (scene.structure === 'queue') layoutShapeGrid(shapes, structureRegion, { columns: 1, gapY: 8, maxHeight: 54 })
    else layoutShapeGrid(shapes, structureRegion, { columns: 2, gapY: 8, maxHeight: 64 })

    if (stateItems.length) {
      const band = { x: leftX, y: SAFE_BOTTOM - bottomBandHeight + 4, width: SAFE_RIGHT - leftX, height: bottomBandHeight - 12 }
      if (panels.length) {
        const panelWidth = Math.min(500, band.width * 0.55)
        layoutPanels(panels, { x: band.x, y: band.y, width: panelWidth, height: band.height })
        layoutStateGrid(stateItems, { x: band.x + panelWidth + 14, y: band.y, width: band.width - panelWidth - 14, height: band.height }, { gap: 8 })
      } else {
        layoutStateGrid(stateItems, band, { gap: 8 })
      }
    } else if (panels.length) {
      layoutPanels(panels, { x: leftX, y: SAFE_BOTTOM - 150, width: SAFE.width - 16, height: 146 })
    }
    return
  }

  const panelsOnRight = panels.length > 0
  const leftWidth = panelsOnRight ? 500 : 596
  const rightX = leftX + leftWidth + 18
  const rightWidth = SAFE_RIGHT - rightX
  const stateReserve = 0

  if (block) {
    const region = { x: leftX, y: top, width: leftWidth, height: Math.max(160, SAFE_BOTTOM - top - stateReserve - Math.min(126, texts.length * 42) - 8) }
    placeCodeBlock(block, region)
  }
  const noteTop = (block?.y + block?.height || top) + 12
  if (texts.length) {
    layoutTextColumn(texts, { x: leftX, y: noteTop, width: leftWidth, height: Math.max(40, SAFE_BOTTOM - noteTop) }, { gap: 8 })
  }

  let rightY = top
  if (panels.length) {
    const panelHeight = Math.min(330, 220 + panels.length * 40)
    layoutPanels(panels, { x: rightX, y: rightY, width: rightWidth, height: panelHeight })
    rightY += panelHeight + 14
  }
  if (stateItems.length) {
    layoutStateStack(stateItems, { x: rightX, y: rightY, width: rightWidth, height: Math.max(80, SAFE_BOTTOM - rightY) }, { gap: 8 })
  }
}

function placeCodeBlock(block, region) {
  const headerHeight = 40
  const footerHeight = block.maxLines > 0 ? 14 : 0
  const paddingBottom = 10
  const available = Math.max(60, region.height - headerHeight - paddingBottom)
  let lineHeight = 21
  let fontSize = 12
  let visibleLines = block.maxLines

  if (block.maxLines * lineHeight > available) {
    lineHeight = clamp(Math.floor(available / Math.max(block.maxLines, 1)), 12, 21)
    fontSize = clamp(Math.round(lineHeight * 0.58 * 10) / 10, 8, 12)
  }
  if (block.maxLines * lineHeight > available) {
    lineHeight = 12
    fontSize = 8.2
    visibleLines = Math.max(1, Math.floor((available - footerHeight) / lineHeight))
  }

  block.x = region.x
  block.y = region.y
  block.width = region.width
  block.height = Math.min(region.height, headerHeight + visibleLines * lineHeight + footerHeight + paddingBottom)
  block.headerHeight = headerHeight
  block.contentTop = block.y + headerHeight
  block.lineHeight = lineHeight
  block.fontSize = fontSize
  block.visibleLines = visibleLines
  block.truncated = visibleLines < block.maxLines
  block.remainingLines = Math.max(0, block.maxLines - visibleLines)
}

function layoutEquationScene(scene, shapes, texts, variables, outputs, panels) {
  const stateItems = [...variables, ...outputs]
  const stateHeight = stateItems.length ? 66 : 0
  const mainBottom = SAFE_BOTTOM - stateHeight - (stateItems.length ? 12 : 0)
  const hasVisuals = shapes.length > 0 || panels.length > 0
  const textWidth = hasVisuals ? Math.min(470, Math.max(360, SAFE.width * 0.46)) : SAFE.width
  const textRegion = { x: SAFE.x, y: SAFE.y, width: textWidth, height: mainBottom - SAFE.y }
  layoutTextColumn(texts, textRegion, { gap: 12 })

  if (hasVisuals) {
    const visualX = SAFE.x + textWidth + 24
    const visualRegion = { x: visualX, y: SAFE.y, width: SAFE_RIGHT - visualX, height: mainBottom - SAFE.y }
    if (shapes.length && panels.length) {
      const shapesHeight = visualRegion.height * 0.54
      layoutShapeGrid(shapes, { ...visualRegion, height: shapesHeight }, { gapX: 14, gapY: 14, maxHeight: 78 })
      layoutPanels(panels, { x: visualRegion.x, y: visualRegion.y + shapesHeight + 14, width: visualRegion.width, height: visualRegion.height - shapesHeight - 14 })
    } else if (shapes.length) {
      layoutShapeGrid(shapes, visualRegion, { gapX: 14, gapY: 16, maxHeight: 86 })
    } else {
      layoutPanels(panels, visualRegion)
    }
  } else if (panels.length) {
    layoutPanels(panels, { x: SAFE.x, y: SAFE.y, width: SAFE.width, height: mainBottom - SAFE.y })
  }

  if (stateItems.length) {
    layoutStateGrid(stateItems, { x: SAFE.x, y: SAFE_BOTTOM - stateHeight, width: SAFE.width, height: stateHeight }, { gap: 8 })
  }
}

function layoutFlowScene(scene, shapes, texts, variables, outputs, panels) {
  const stateItems = [...variables, ...outputs]
  const stateHeight = stateItems.length ? 62 : 0
  const stateTop = SAFE_BOTTOM - stateHeight
  const captionHeight = texts.length ? Math.min(88, 24 + texts.length * 22) : 0
  layoutTextColumn(texts, { x: SAFE.x, y: SAFE.y, width: SAFE.width, height: captionHeight }, { gap: 6 })
  const visualTop = SAFE.y + captionHeight + (texts.length ? 10 : 0)
  const visualBottom = stateTop - 10
  const hasPanels = panels.length > 0
  const visualWidth = hasPanels && shapes.length ? SAFE.width * 0.58 : SAFE.width
  if (shapes.length) {
    const columns = shapes.length <= 3 ? shapes.length : shapes.length <= 6 ? 3 : 4
    layoutShapeGrid(shapes, { x: SAFE.x, y: visualTop, width: visualWidth, height: visualBottom - visualTop }, { columns, gapX: 22, gapY: 24, maxHeight: 92 })
  }
  if (hasPanels) {
    const panelX = shapes.length ? SAFE.x + visualWidth + 20 : SAFE.x
    layoutPanels(panels, { x: panelX, y: visualTop, width: SAFE_RIGHT - panelX, height: visualBottom - visualTop })
  }
  if (stateItems.length) {
    layoutStateGrid(stateItems, { x: SAFE.x, y: stateTop, width: SAFE.width, height: stateHeight }, { gap: 8 })
  }
}

function layoutStackScene(scene, shapes, texts, variables, outputs, panels) {
  const stateItems = [...variables, ...outputs]
  const stateHeight = stateItems.length ? 62 : 0
  const stateTop = SAFE_BOTTOM - stateHeight
  const captionHeight = texts.length ? Math.min(76, 22 + texts.length * 20) : 0
  layoutTextColumn(texts, { x: SAFE.x, y: SAFE.y, width: SAFE.width, height: captionHeight }, { gap: 6 })
  const visualTop = SAFE.y + captionHeight + (texts.length ? 10 : 0)
  const visualBottom = stateTop - 10
  if (shapes.length) {
    const width = panels.length ? SAFE.width * 0.58 : SAFE.width
    layoutShapeColumn(shapes, { x: SAFE.x, y: visualTop, width, height: visualBottom - visualTop }, { gap: 9, maxHeight: 58, maxWidth: 320, reverse: true })
  }
  if (panels.length) {
    const panelX = shapes.length ? SAFE.x + SAFE.width * 0.6 : SAFE.x
    layoutPanels(panels, { x: panelX, y: visualTop, width: SAFE_RIGHT - panelX, height: visualBottom - visualTop })
  }
  if (stateItems.length) {
    layoutStateGrid(stateItems, { x: SAFE.x, y: stateTop, width: SAFE.width, height: stateHeight }, { gap: 8 })
  }
}

function layoutQueueScene(scene, shapes, texts, variables, outputs, panels) {
  const stateItems = [...variables, ...outputs]
  const stateHeight = stateItems.length ? 62 : 0
  const stateTop = SAFE_BOTTOM - stateHeight
  const captionHeight = texts.length ? Math.min(76, 22 + texts.length * 20) : 0
  layoutTextColumn(texts, { x: SAFE.x, y: SAFE.y, width: SAFE.width, height: captionHeight }, { gap: 6 })
  const visualTop = SAFE.y + captionHeight + (texts.length ? 10 : 0)
  const visualBottom = stateTop - 10
  if (shapes.length) {
    const width = panels.length ? SAFE.width * 0.58 : SAFE.width
    layoutShapeRow(shapes, { x: SAFE.x, y: visualTop, width, height: visualBottom - visualTop }, { gap: 14, maxHeight: 74, maxWidth: 142 })
  }
  if (panels.length) {
    const panelX = shapes.length ? SAFE.x + SAFE.width * 0.6 : SAFE.x
    layoutPanels(panels, { x: panelX, y: visualTop, width: SAFE_RIGHT - panelX, height: visualBottom - visualTop })
  }
  if (stateItems.length) {
    layoutStateGrid(stateItems, { x: SAFE.x, y: stateTop, width: SAFE.width, height: stateHeight }, { gap: 8 })
  }
}

function layoutTreeScene(scene, shapes, texts, variables, outputs, panels) {
  const stateItems = [...variables, ...outputs]
  const stateHeight = stateItems.length ? 62 : 0
  const stateTop = SAFE_BOTTOM - stateHeight
  const captionHeight = texts.length ? Math.min(76, 22 + texts.length * 20) : 0
  layoutTextColumn(texts, { x: SAFE.x, y: SAFE.y, width: SAFE.width, height: captionHeight }, { gap: 6 })
  const visualTop = SAFE.y + captionHeight + (texts.length ? 10 : 0)
  const visualBottom = stateTop - 10
  const regionWidth = panels.length ? SAFE.width * 0.58 : SAFE.width
  const region = { x: SAFE.x, y: visualTop, width: regionWidth, height: visualBottom - visualTop }

  const treeShapes = shapes.slice(0, 7)
  const extraShapes = shapes.slice(7)
  const levels = [[0], [1, 2], [3, 4, 5, 6]]
  const nodeWidth = Math.min(164, Math.max(90, (region.width - 60) / 3))
  const nodeHeight = Math.min(66, Math.max(44, (region.height - 40) / 3))
  const levelGap = Math.max(10, (region.height - nodeHeight * 3) / 3)

  treeShapes.forEach((shape, index) => {
    const level = levels.findIndex((positions) => positions.includes(index))
    const positions = levels[level] || [0]
    const slot = Math.max(0, positions.indexOf(index))
    const count = Math.max(1, positions.length)
    const x = region.x + ((slot + 1) / (count + 1)) * region.width - nodeWidth / 2
    const y = region.y + level * (nodeHeight + levelGap)
    placeBox(shape, clamp(x, region.x, region.x + region.width - nodeWidth), y, nodeWidth, nodeHeight)
  })

  if (extraShapes.length) {
    const rowY = region.y + 3 * (nodeHeight + levelGap)
    layoutShapeGrid(extraShapes, { x: region.x, y: rowY, width: region.width, height: Math.max(40, region.y + region.height - rowY) }, { columns: Math.min(extraShapes.length, 5), gapX: 10, gapY: 8, maxHeight: 44 })
  }

  if (panels.length) {
    const panelX = SAFE.x + SAFE.width * 0.6
    layoutPanels(panels, { x: panelX, y: visualTop, width: SAFE_RIGHT - panelX, height: visualBottom - visualTop })
  }
  if (stateItems.length) {
    layoutStateGrid(stateItems, { x: SAFE.x, y: stateTop, width: SAFE.width, height: stateHeight }, { gap: 8 })
  }
}

function layoutConceptScene(scene, shapes, texts, variables, outputs, panels) {
  const stateItems = [...variables, ...outputs]
  const stateHeight = stateItems.length ? 62 : 0
  const stateTop = SAFE_BOTTOM - stateHeight
  const captionHeight = texts.length ? Math.min(76, 22 + texts.length * 20) : 0
  layoutTextColumn(texts, { x: SAFE.x, y: SAFE.y, width: SAFE.width, height: captionHeight }, { gap: 6 })
  const visualTop = SAFE.y + captionHeight + (texts.length ? 10 : 0)
  const visualBottom = stateTop - 10
  const regionWidth = panels.length ? SAFE.width * 0.58 : SAFE.width
  const region = { x: SAFE.x, y: visualTop, width: regionWidth, height: visualBottom - visualTop }

  if (shapes.length <= 1) {
    if (shapes.length) {
      const width = Math.min(260, region.width)
      const height = Math.min(96, region.height)
      placeBox(shapes[0], region.x + (region.width - width) / 2, region.y + (region.height - height) / 2, width, height)
    }
  } else if (shapes.length <= 8) {
    const [center, ...rest] = shapes
    const nodeWidth = Math.min(190, Math.max(120, region.width * 0.24))
    const nodeHeight = Math.min(78, Math.max(48, region.height * 0.18))
    const centerWidth = Math.min(240, region.width * 0.3)
    placeBox(center, region.x + (region.width - centerWidth) / 2, region.y + (region.height - nodeHeight) / 2, centerWidth, nodeHeight)
    const radiusX = Math.max(nodeWidth / 2 + 10, region.width / 2 - nodeWidth / 2 - 12)
    const radiusY = Math.max(nodeHeight / 2 + 10, region.height / 2 - nodeHeight / 2 - 10)
    rest.forEach((shape, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / rest.length
      const x = center.x + center.width / 2 + Math.cos(angle) * radiusX - nodeWidth / 2
      const y = center.y + center.height / 2 + Math.sin(angle) * radiusY - nodeHeight / 2
      placeBox(shape, clamp(x, region.x, region.x + region.width - nodeWidth), clamp(y, region.y, region.y + region.height - nodeHeight), nodeWidth, nodeHeight)
    })
  } else {
    layoutShapeGrid(shapes, region, { gapX: 16, gapY: 16, maxHeight: 68 })
  }

  if (panels.length) {
    const panelX = SAFE.x + SAFE.width * 0.6
    layoutPanels(panels, { x: panelX, y: visualTop, width: SAFE_RIGHT - panelX, height: visualBottom - visualTop })
  }
  if (stateItems.length) {
    layoutStateGrid(stateItems, { x: SAFE.x, y: stateTop, width: SAFE.width, height: stateHeight }, { gap: 8 })
  }
}

function layoutFallbackScene(scene, shapes, texts, variables, outputs, panels) {
  return layoutConceptScene(scene, shapes, texts, variables, outputs, panels)
}

function detectStructure(scene) {
  for (const step of scene.steps) {
    if (!['stack', 'queue', 'tree'].includes(step.layout)) continue
    if (step.actions.some((action) => action.type === 'add_shape')) return step.layout
  }
  return null
}

function finalizeScene(scene) {
  const shapes = scene.objects.filter((object) => object.kind === 'shape')
  const arrows = scene.objects.filter((object) => object.kind === 'arrow')
  const texts = scene.objects.filter((object) => object.kind === 'text')
  const variables = scene.objects.filter((object) => object.kind === 'variable')
  const outputs = scene.objects.filter((object) => object.kind === 'output')
  const codeBlocks = scene.objects.filter((object) => object.kind === 'code')
  const tables = scene.objects.filter((object) => object.kind === 'table')
  const graphs = scene.objects.filter((object) => object.kind === 'graph')
  const panels = [...tables, ...graphs]

  scene.hasCode = codeBlocks.length > 0
  scene.structure = detectStructure(scene)

  const layout = scene.layout
  if (layout === 'code') layoutCodeScene(scene, codeBlocks, shapes, texts, variables, outputs, panels)
  else if (layout === 'equation') layoutEquationScene(scene, shapes, texts, variables, outputs, panels)
  else if (layout === 'flow') layoutFlowScene(scene, shapes, texts, variables, outputs, panels)
  else if (layout === 'stack') layoutStackScene(scene, shapes, texts, variables, outputs, panels)
  else if (layout === 'queue') layoutQueueScene(scene, shapes, texts, variables, outputs, panels)
  else if (layout === 'tree') layoutTreeScene(scene, shapes, texts, variables, outputs, panels)
  else if (layout === 'concept') layoutConceptScene(scene, shapes, texts, variables, outputs, panels)
  else layoutFallbackScene(scene, shapes, texts, variables, outputs, panels)

  deoverlap(scene.objects)
  for (const shape of shapes) measureShape(shape)
  const obstacles = scene.objects.filter((object) => BOX_KINDS.has(object.kind))
  for (const arrow of arrows) routeArrow(arrow, shapes, obstacles)
  const fit = fitToSafeArea(scene.objects, arrows)
  scene.fitTransform = fit?.transform || null
  scene.bodyBounds = fit?.bounds || null

  scene.steps.forEach((step, index) => {
    step.index = index
    step.actionKeys = step.actions.map((action) => action.key)
  })

  return scene
}

function normalizeTableRows(action) {
  const rawRows = Array.isArray(action.rows) ? action.rows : Array.isArray(action.data) ? action.data : []
  const rows = []
  for (const row of rawRows.slice(0, 24)) {
    if (Array.isArray(row)) {
      const cells = row.slice(0, 8).map((cell) => text(cell))
      if (cells.length) rows.push(cells)
    } else if (row && typeof row === 'object') {
      const cells = Object.values(row).slice(0, 8).map((cell) => text(cell))
      if (cells.length) rows.push(cells)
    }
  }
  let columns = Array.isArray(action.columns)
    ? action.columns.slice(0, 8).map((column) => text(column?.label ?? column?.name ?? column)).filter(Boolean)
    : []
  if (!columns.length) {
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
    columns = Array.from({ length: width }, (_, index) => `Column ${index + 1}`)
  }
  const width = Math.max(columns.length, ...rows.map((row) => row.length))
  while (columns.length < width) columns.push(`Column ${columns.length + 1}`)
  const padded = rows.map((row) => {
    const cells = row.slice(0, width)
    while (cells.length < width) cells.push('')
    return cells
  })
  return { columns, rows: padded }
}

function normalizePoints(value) {
  if (!Array.isArray(value)) return []
  const points = []
  for (const point of value.slice(0, 80)) {
    let x
    let y
    if (Array.isArray(point) && point.length >= 2) {
      x = Number(point[0])
      y = Number(point[1])
    } else if (point && typeof point === 'object') {
      x = Number(point.x)
      y = Number(point.y)
    }
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y })
  }
  return points
}

function normalizeGraphSeries(action) {
  const rawSeries = Array.isArray(action.series) ? action.series : []
  const series = []
  rawSeries.slice(0, 4).forEach((entry, index) => {
    const points = normalizePoints(entry?.points ?? entry?.values ?? entry?.data ?? entry)
    if (!points.length) return
    series.push({
      label: text(entry?.label ?? entry?.name) || `Series ${index + 1}`,
      color: colorOr(entry?.color, SERIES_COLORS[index % SERIES_COLORS.length]),
      points,
    })
  })
  if (!series.length) {
    const points = normalizePoints(action.points ?? action.values ?? action.data)
    if (points.length) {
      series.push({
        label: text(action.label) || 'Series 1',
        color: colorOr(action.color, SERIES_COLORS[0]),
        points,
      })
    }
  }
  return series
}

/**
 * Build a renderable, ordered scene from a TutorResponse-like lesson.
 * @param {any} lesson
 */
export function buildLessonScene(lesson) {
  if (!lesson || !Array.isArray(lesson.steps)) return null
  const steps = lesson.steps.filter((step) => step && Array.isArray(step.whiteboard_actions))
  if (!steps.length) return null

  const scene = {
    lessonId: text(lesson.lesson_id) || 'lesson-local',
    mode: text(lesson.mode) || 'new_lesson',
    title: text(lesson.lesson_title) || 'Lesson',
    summary: text(lesson.spoken_explanation),
    layout: chooseLayout(steps),
    steps: [],
    objects: [],
    allActionKeys: [],
    issues: [],
  }

  const byElementId = new Map()
  const counters = { code: 0, shape: 0, arrow: 0, text: 0, output: 0, note: 0, table: 0, graph: 0 }

  const findObject = (id) => byElementId.get(text(id))

  const addObject = (object) => {
    scene.objects.push(object)
    if (object.id) byElementId.set(object.id, object)
    return object
  }

  steps.forEach((step, stepIndex) => {
    const stepId = text(step.id ?? step.step_id) || `step-${stepIndex + 1}`
    const actions = Array.isArray(step.whiteboard_actions) ? step.whiteboard_actions : []
    const stepEntry = {
      id: stepId,
      title: text(step.title) || `Step ${stepIndex + 1}`,
      narration: text(step.narration),
      explanation: text(step.explanation),
      layout: text(step.layout) || '',
      index: stepIndex,
      actions: [],
      actionKeys: [],
    }
    scene.steps.push(stepEntry)

    actions.forEach((action, actionIndex) => {
      if (!action || !action.type) return
      const type = text(action.type)
      const key = actionKey(stepId, action, actionIndex)
      const entry = { key, type, stepId, stepIndex, actionIndex, raw: action }
      stepEntry.actions.push(entry)
      scene.allActionKeys.push(key)

      // All code actions share one progressive code card. A tutor replaces the
      // snippet in place as the lesson moves from syntax, to example, to trace.
      if (type === 'show_code') {
        let block = findObject(CODE_SLOT_ID)
        if (!block) {
          block = addObject({
            kind: 'code',
            id: CODE_SLOT_ID,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            lines: [],
            label: text(action.label) || 'Code',
          })
        }
        block.updates.push({
          key,
          patch: {
            code: String(action.code ?? ''),
            label: text(action.label) || block.label,
            highlightedLine: 0,
          },
        })
        return
      }

      if (type === 'highlight_code') {
        let block = findObject(CODE_SLOT_ID)
        if (!block) {
          block = addObject({
            kind: 'code',
            id: CODE_SLOT_ID,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            lines: [],
            label: text(action.label) || 'Code',
          })
        }
        if (action.code) {
          block.updates.push({ key, patch: { code: String(action.code ?? ''), label: block.label } })
        }
        block.updates.push({ key, patch: { highlightedLine: Math.max(1, asNumber(action.line, 1)) } })
        return
      }

      if (type === 'show_variable') {
        const id = elementId(action, 'var', counters.note)
        let variable = findObject(id)
        if (!variable || variable.kind !== 'variable') {
          counters.note += 1
          variable = addObject({
            kind: 'variable',
            id,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            variableName: text(action.variable_name) || text(action.label) || 'value',
            value: '',
          })
        }
        variable.updates.push({
          key,
          patch: {
            variableName: text(action.variable_name) || variable.variableName,
            value: singleLineValue(action.value),
          },
        })
        return
      }

      if (type === 'show_output') {
        const explicitId = text(action.id)
        const id = explicitId || `output-${++counters.output}`
        let output = findObject(id)
        if (!output || output.kind !== 'output') {
          output = addObject({
            kind: 'output',
            id,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            value: '',
            label: text(action.label) || 'Output',
          })
        }
        output.updates.push({ key, patch: { value: String(action.value ?? ''), label: text(action.label) || output.label } })
        return
      }

      if (type === 'add_shape') {
        const id = elementId(action, 'shape', counters.shape)
        let shape = findObject(id)
        if (!shape || shape.kind !== 'shape') {
          counters.shape += 1
          shape = addObject({
            kind: 'shape',
            id,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            shapeType: text(action.shape_type) || 'rectangle',
            label: '',
            value: '',
            raw: action,
            color: colorOr(action.color, COLORS.accent),
          })
        }
        shape.updates.push({
          key,
          patch: {
            label: text(action.label) || text(action.text) || shape.label,
            value: text(action.value) || shape.value,
            shapeType: text(action.shape_type) || shape.shapeType,
            color: colorOr(action.color, shape.color),
          },
        })
        return
      }

      if (type === 'add_arrow') {
        const id = elementId(action, 'arrow', counters.arrow)
        counters.arrow += 1
        addObject({
          kind: 'arrow',
          id,
          key,
          stepIndex,
          actionIndex,
          updates: [],
          raw: action,
          label: text(action.label) || '',
        })
        return
      }

      if (type === 'show_text') {
        const id = elementId(action, 'note', counters.text)
        let note = findObject(id)
        if (!note || note.kind !== 'text') {
          counters.text += 1
          note = addObject({
            kind: 'text',
            id,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            value: '',
            role: 'note',
          })
        }
        const previous = note.updates[note.updates.length - 1]?.patch
        note.updates.push({
          key,
          patch: {
            value: text(action.text) || text(action.content) || previous?.value || '',
            role: text(action.role) || previous?.role || 'note',
            align: text(action.align) || previous?.align || undefined,
          },
        })
        return
      }

      if (type === 'show_table') {
        const normalized = normalizeTableRows(action)
        if (!normalized.rows.length) {
          scene.issues.push(`${key}: table had no usable rows`)
          return
        }
        const id = elementId(action, 'table', counters.table)
        const title = text(action.label) || text(action.title) || ''
        let table = findObject(id)
        if (!table || table.kind !== 'table') {
          counters.table += 1
          table = addObject({
            kind: 'table',
            id,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            columns: normalized.columns,
            rows: normalized.rows,
            title,
          })
        } else {
          table.columns = normalized.columns
          table.rows = normalized.rows
          table.title = title
        }
        table.updates.push({ key, patch: { columns: normalized.columns, rows: normalized.rows, title } })
        return
      }

      if (type === 'show_graph') {
        const series = normalizeGraphSeries(action)
        if (!series.length) {
          scene.issues.push(`${key}: graph had no usable points`)
          return
        }
        const id = elementId(action, 'graph', counters.graph)
        const title = text(action.label) || text(action.title) || ''
        const xLabel = text(action.x_label) || text(action.xLabel) || ''
        const yLabel = text(action.y_label) || text(action.yLabel) || ''
        let graph = findObject(id)
        if (!graph || graph.kind !== 'graph') {
          counters.graph += 1
          graph = addObject({
            kind: 'graph',
            id,
            key,
            stepIndex,
            actionIndex,
            updates: [],
            series,
            title,
            xLabel,
            yLabel,
          })
        } else {
          graph.series = series
          graph.title = title
          graph.xLabel = xLabel
          graph.yLabel = yLabel
        }
        graph.updates.push({ key, patch: { series, title, xLabel, yLabel } })
        return
      }

      if (type === 'update_element' || type === 'highlight_element') {
        const targetId = text(action.target_id) || text(action.id)
        const target = findObject(targetId)
        if (!target) {
          scene.issues.push(`${key}: target "${targetId}" does not exist`)
          return
        }
        if (type === 'highlight_element') {
          target.updates.push({ key, patch: { highlighted: true } })
          return
        }
        const patch = {}
        for (const field of ['text', 'value', 'label', 'color']) {
          if (action[field] !== null && action[field] !== undefined && action[field] !== '') {
            patch[field] = field === 'value' ? singleLineValue(action[field]) : String(action[field])
          }
        }
        if (target.kind === 'text') {
          if (patch.text && !patch.value) patch.value = patch.text
          delete patch.text
        } else if (target.kind === 'shape') {
          if (patch.text && !patch.label) patch.label = patch.text
          delete patch.text
        }
        target.updates.push({ key, patch })
      }
    })
  })

  // Code blocks compute their final lines from every update, before layout.
  for (const block of scene.objects.filter((object) => object.kind === 'code')) {
    let code = ''
    let maxLines = 1
    let highlightedLine = 0
    let label = block.label
    for (const update of block.updates) {
      if (typeof update.patch.code === 'string') {
        code = update.patch.code
        maxLines = Math.max(maxLines, code.split('\n').length)
      }
      if (typeof update.patch.highlightedLine === 'number') highlightedLine = update.patch.highlightedLine
      if (typeof update.patch.label === 'string') label = update.patch.label
    }
    block.lines = code.split('\n')
    block.maxLines = maxLines
    block.highlightedLine = highlightedLine
    block.label = label
  }

  return finalizeScene(scene)
}

export function applyObjectUpdates(object, revealedKeys) {
  const state = { ...object, active: false }
  for (const update of object.updates || []) {
    if (!revealedKeys.has(update.key)) continue
    Object.assign(state, update.patch)
    if (typeof update.patch.highlightedLine === 'number') state.highlightedLine = update.patch.highlightedLine
    if (update.patch.highlighted) state.active = true
  }
  if (state.kind === 'code') {
    state.lines = typeof state.code === 'string' ? state.code.split('\n') : (object.lines || [])
    const visible = Math.min(object.visibleLines || state.lines.length, state.lines.length)
    state.visibleLines = Math.max(1, visible)
    state.remainingLines = Math.max(0, state.lines.length - state.visibleLines)
    state.truncated = state.remainingLines > 0
  }
  if (state.kind === 'shape') {
    const measured = measureShape({ ...state, updates: [] })
    state.labelLines = measured.labelLines
    state.labelFontSize = measured.labelFontSize
    state.labelLineHeight = measured.labelLineHeight
    state.labelStartY = measured.labelStartY
    state.labelTruncated = measured.labelTruncated
    state.valueText = measured.valueText
    state.valueY = measured.valueY
  }
  if (state.kind === 'text') {
    const measured = { value: state.value, role: state.role, align: state.align }
    measureTextItem(measured, state.width)
    state.lines = measured.lines
    state.fontSize = measured.fontSize
    state.lineHeight = measured.lineHeight
    state.align = measured.align
  }
  if (state.kind === 'variable' || state.kind === 'output') {
    measureStateItem(state, state.width, state.height)
  }
  if (state.kind === 'table' && Array.isArray(state.rows) && Array.isArray(state.columns)) {
    measureTable(state, state.width, state.height)
  }
  if (state.kind === 'graph' && Array.isArray(state.series)) {
    measureGraph(state, state.width, state.height)
  }
  return state
}

export function validateLessonLayout(lesson) {
  const scene = buildLessonScene(lesson)
  if (!scene) return { scene: null, issues: ['Lesson did not contain any steps.'] }
  const issues = [...scene.issues]
  const boxes = scene.objects.filter((object) => BOX_KINDS.has(object.kind))
  for (let index = 0; index < boxes.length; index += 1) {
    const first = boxes[index]
    if (![first.x, first.y, first.width, first.height].every(Number.isFinite)) {
      issues.push(`${first.id}: has invalid geometry`)
      continue
    }
    for (let otherIndex = index + 1; otherIndex < boxes.length; otherIndex += 1) {
      const second = boxes[otherIndex]
      if (intersect(first, second, 3)) issues.push(`${first.id} overlaps ${second.id}`)
    }
  }
  return { scene, issues }
}
