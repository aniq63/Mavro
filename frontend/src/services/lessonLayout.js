/**
 * Deterministic teaching-board layout engine.
 *
 * The model supplies teaching intent and ordered actions. This module owns
 * geometry so the board never depends on arbitrary AI-generated coordinates.
 */

export const BOARD_WIDTH = 1000
export const BOARD_HEIGHT = 650

const CODE_SLOT_ID = 'code-main'

const COLORS = {
  ink: '#2a344e',
  muted: '#8a92a4',
  accent: '#6558e8',
  accentSoft: '#f2f0ff',
  amber: '#c9822f',
  green: '#3f9268',
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

export function actionKey(stepId, action, actionIndex) {
  const explicit = text(action?.id)
  if (explicit) return `${stepId}:${explicit}`
  return `${stepId}:${text(action?.type) || 'action'}:${actionIndex}`
}

export function elementId(action, fallbackPrefix, index) {
  return text(action?.id) || text(action?.target_id) || `${fallbackPrefix}-${index + 1}`
}

export function wrapText(value, maxChars = 42) {
  const words = text(value).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let line = ''
  for (const word of words) {
    if (!line) {
      line = word
    } else if (`${line} ${word}`.length <= maxChars) {
      line = `${line} ${word}`
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function inferLayout(steps) {
  const actions = []
  let title = ''
  for (const step of steps) {
    title += ` ${step?.title || ''}`
    for (const action of step?.whiteboard_actions || []) actions.push(action)
  }
  const lowerTitle = title.toLowerCase()
  const types = new Set(actions.map((action) => text(action?.type)))
  if (types.has('show_code') || types.has('highlight_code')) return 'code'
  if (lowerTitle.includes('stack') || lowerTitle.includes('recursion') || lowerTitle.includes('call stack')) return 'stack'
  if (lowerTitle.includes('queue')) return 'queue'
  if (lowerTitle.includes('tree') || lowerTitle.includes('binary')) return 'tree'
  if (types.has('add_shape') && types.has('add_arrow')) return 'flow'
  if (lowerTitle.includes('equation') || lowerTitle.includes('formula') || actions.some((action) => /=/.test(text(action?.text)))) return 'equation'
  if (types.has('add_shape')) return 'concept'
  return 'concept'
}

function chooseLayout(steps) {
  const explicit = []
  const structural = new Set()
  const actionTypes = new Set()
  const valid = ['code', 'flow', 'stack', 'queue', 'tree', 'equation', 'concept']

  for (const step of steps) {
    const candidate = text(step?.layout).toLowerCase()
    if (candidate && candidate !== 'auto' && valid.includes(candidate)) {
      explicit.push(candidate)
      if (['stack', 'queue', 'tree'].includes(candidate)) structural.add(candidate)
    }
    for (const action of step?.whiteboard_actions || []) {
      if (action?.type) actionTypes.add(text(action.type))
    }
  }

  // A lesson that draws code always needs the code template, even when the model
  // labels an early text-only step "concept" or a later call-stack step "stack".
  if (actionTypes.has('show_code') || actionTypes.has('highlight_code')) return 'code'

  if (structural.has('stack')) return 'stack'
  if (structural.has('queue')) return 'queue'
  if (structural.has('tree')) return 'tree'

  if (explicit.length && explicit.every((layout) => layout === explicit[0])) return explicit[0]
  return inferLayout(steps)
}

function nodeLabel(node) {
  let label = text(node.label) || text(node.raw?.label) || text(node.raw?.text) || text(node.raw?.value) || node.id
  for (const update of node.updates || []) {
    if (typeof update.patch?.label === 'string' && update.patch.label) label = update.patch.label
  }
  return label
}

function placeNode(node, x, y, width, height) {
  node.x = x
  node.y = y
  node.width = width
  node.height = height
  node.cx = x + width / 2
  node.cy = y + height / 2
}

function layoutNodes(scene, shapes) {
  const layout = scene.layout

  // Code + diagram hybrid: code stays in the left column while call-stack frames
  // or process nodes form a readable right-hand column.
  if (layout === 'code' && scene.hasCode && shapes.length) {
    const ordered = shapes.slice(0, 6)
    const width = 320
    const height = 56
    const gap = 8
    const columnBottom = 84 + (ordered.length - 1) * (height + gap)
    ordered.forEach((shape, index) => {
      const y = scene.structure === 'stack'
        ? columnBottom - index * (height + gap)
        : 84 + index * (height + gap)
      placeNode(shape, 624, y, width, height)
    })
    scene.structureBottom = 84 + ordered.length * (height + gap) - gap
    return
  }

  if (layout === 'stack') {
    const ordered = shapes.slice(0, 7)
    const width = 220
    const height = 61
    const gap = 11
    const bottom = 505
    ordered.forEach((shape, index) => {
      placeNode(shape, 390, bottom - index * (height + gap), width, height)
    })
    return
  }

  if (layout === 'queue') {
    const ordered = shapes.slice(0, 6)
    const width = 132
    const gap = 14
    const total = ordered.length * width + Math.max(0, ordered.length - 1) * gap
    const startX = Math.max(60, (BOARD_WIDTH - total) / 2)
    ordered.forEach((shape, index) => {
      placeNode(shape, startX + index * (width + gap), 300, width, 66)
    })
    return
  }

  if (layout === 'tree') {
    const positions = [
      [425, 110], [245, 250], [605, 250], [145, 400], [345, 400], [505, 400], [705, 400],
    ]
    const width = 160
    const height = 62
    shapes.slice(0, positions.length).forEach((shape, index) => {
      const [x, y] = positions[index]
      placeNode(shape, x, y, width, height)
    })
    return
  }

  if (layout === 'concept') {
    const ordered = shapes.slice(0, 8)
    if (!ordered.length) return
    const [center, ...rest] = ordered
    placeNode(center, 385, 245, 230, 88)
    const radiusX = 320
    const radiusY = 175
    rest.forEach((shape, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(rest.length, 1)
      const width = 168
      const height = 66
      placeNode(
        shape,
        clamp(500 + Math.cos(angle) * radiusX - width / 2, 40, BOARD_WIDTH - width - 40),
        clamp(300 + Math.sin(angle) * radiusY - height / 2, 100, 470),
        width,
        height,
      )
    })
    return
  }

  if (layout === 'flow') {
    const columns = [72, 376, 680]
    const rows = [132, 292, 452]
    const width = 248
    const height = 88
    shapes.slice(0, 9).forEach((shape, index) => {
      const column = index % 3
      const row = Math.floor(index / 3)
      placeNode(shape, columns[column], rows[row], width, height)
    })
    return
  }

  if (layout === 'equation') {
    shapes.slice(0, 6).forEach((shape, index) => {
      placeNode(shape, 120 + index * 135, 455, 116, 58)
    })
    return
  }

  // Code layout (and any unknown fallback): a readable row of frames under the code.
  const ordered = shapes.slice(0, 5)
  const width = 168
  const gap = 18
  const total = ordered.length * width + Math.max(0, ordered.length - 1) * gap
  const startX = Math.max(56, (BOARD_WIDTH - total) / 2)
  ordered.forEach((shape, index) => {
    placeNode(shape, startX + index * (width + gap), 458, width, 64)
  })

  // Nodes that did not fit are placed as compact bottom chips so they never overlap the code.
  shapes.slice(5).forEach((shape, index) => {
    placeNode(shape, 56 + index * 176, 560, 160, 46)
  })
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function arrowGeometry(arrow, shapes) {
  const fromKey = text(arrow.raw.from ?? arrow.raw.from_value)
  const toKey = text(arrow.raw.to ?? arrow.raw.to_value)
  const lookup = (key) => {
    if (!key) return null
    const lower = key.toLowerCase()
    return shapes.find((shape) => shape.id.toLowerCase() === lower)
      || shapes.find((shape) => nodeLabel(shape).toLowerCase() === lower)
      || shapes.find((shape) => nodeLabel(shape).toLowerCase().includes(lower))
  }
  let from = lookup(fromKey)
  let to = lookup(toKey)
  if (!from && !to) {
    const index = shapes.indexOf(arrow)
    from = shapes[Math.max(0, Math.min(shapes.length - 2, index - 1))]
    to = shapes[Math.max(1, Math.min(shapes.length - 1, index))]
  }
  if (!from || !to || from === to) return null
  const a = rectCenter(from)
  const b = rectCenter(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x1: dx >= 0 ? from.x + from.width : from.x,
      y1: a.y,
      x2: dx >= 0 ? to.x : to.x + to.width,
      y2: b.y,
      labelX: (a.x + b.x) / 2,
      labelY: (a.y + b.y) / 2 - 10,
    }
  }
  return {
    x1: a.x,
    y1: dy >= 0 ? from.y + from.height : from.y,
    x2: b.x,
    y2: dy >= 0 ? to.y : to.y + to.height,
    labelX: (a.x + b.x) / 2 + 8,
    labelY: (a.y + b.y) / 2,
  }
}

function layoutText(scene, texts) {
  const layout = scene.layout
  if (layout === 'equation') {
    let y = 130
    for (const item of texts) {
      item.x = 100
      item.y = y
      item.width = 800
      item.height = 44
      item.align = 'middle'
      y += 48
    }
    return
  }
  if (layout === 'flow' || layout === 'queue') {
    let y = 66
    for (const item of texts.slice(0, 3)) {
      item.x = 72
      item.y = y
      item.width = 856
      item.height = 32
      item.align = 'start'
      y += 30
    }
    return
  }
  if (layout === 'stack' || layout === 'tree' || layout === 'concept') {
    let y = 70
    for (const item of texts.slice(0, 4)) {
      item.x = 60
      item.y = y
      item.width = 300
      item.height = 40
      item.align = 'start'
      y += 42
    }
    return
  }
  // Code + diagram hybrid: notes sit under the right-hand diagram column.
  if (layout === 'code' && scene.hasCode && scene.structure) {
    let y = Math.max(360, (scene.structureBottom || 0) + 14)
    for (const item of texts.slice(0, 2)) {
      item.x = 624
      item.y = y
      item.width = 320
      item.height = 38
      item.align = 'start'
      y += 42
    }
    scene.noteBottom = y
    return
  }

  // Code layout: notes sit under the code card, leaving the right rail for state.
  let y = (scene.codeBottom || 172) + 14
  for (const item of texts.slice(0, 3)) {
    item.x = 56
    item.y = y
    item.width = 560
    item.height = 38
    item.align = 'start'
    y += 42
  }
  scene.noteBottom = y
}

function layoutState(scene, variables, outputs) {
  const layout = scene.layout
  if (layout === 'flow' || layout === 'tree' || layout === 'concept' || layout === 'queue' || layout === 'equation') {
    const itemWidth = layout === 'equation' ? 168 : 150
    const gap = 12
    const startY = layout === 'equation' ? 400 : 540
    const items = [...variables, ...outputs]
    const total = items.length * itemWidth + Math.max(0, items.length - 1) * gap
    const startX = Math.max(40, (BOARD_WIDTH - total) / 2)
    items.forEach((item, index) => {
      item.x = startX + index * (itemWidth + gap)
      item.y = startY
      item.width = itemWidth
      item.height = layout === 'equation' ? 52 : 42
    })
    return
  }

  if (layout === 'code' && scene.hasCode && scene.structure) {
    const items = [...variables, ...outputs]
    const itemWidth = 150
    const gap = 8
    const columns = 6
    const startY = Math.max(520, (scene.noteBottom || 0) + 12)
    items.forEach((item, index) => {
      const row = Math.floor(index / columns)
      const column = index % columns
      item.x = 56 + column * (itemWidth + gap)
      item.y = startY + row * 48
      item.width = itemWidth
      item.height = 42
    })
    return
  }

  let y = 84
  for (const item of variables) {
    item.x = 648
    item.y = y
    item.width = 300
    item.height = 46
    y += 54
  }
  y += variables.length ? 8 : 0
  for (const item of outputs) {
    item.x = 648
    item.y = y
    item.width = 300
    item.height = 38
    y += 42
  }
  scene.stateBottom = y
}

function layoutCode(scene, codeBlocks) {
  const block = codeBlocks[0]
  if (!block) return
  block.x = 56
  block.y = 84
  block.width = 560
  block.height = Math.min(380, 42 + (block.maxLines || block.lines.length) * 23)
  scene.codeBottom = block.y + block.height
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

  scene.hasCode = codeBlocks.length > 0
  scene.structure = detectStructure(scene)

  layoutCode(scene, codeBlocks)
  layoutNodes(scene, shapes)
  layoutText(scene, texts)
  layoutState(scene, variables, outputs)

  for (const arrow of arrows) {
    arrow.geometry = arrowGeometry(arrow, shapes)
  }

  scene.steps.forEach((step, index) => {
    step.index = index
    step.actionKeys = step.actions.map((action) => action.key)
  })

  return scene
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
  }

  const byElementId = new Map()
  const counters = { code: 0, shape: 0, arrow: 0, text: 0, output: 0, note: 0 }

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
      const key = actionKey(stepId, action, actionIndex)
      const entry = { key, type: action.type, stepId, stepIndex, actionIndex, raw: action }
      stepEntry.actions.push(entry)
      scene.allActionKeys.push(key)

      // All code actions share one progressive code card. A tutor replaces the
      // snippet in place as the lesson moves from syntax, to example, to trace.
      if (action.type === 'show_code') {
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

      if (action.type === 'highlight_code') {
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

      if (action.type === 'show_variable') {
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

      if (action.type === 'show_output') {
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
          })
        }
        output.updates.push({ key, patch: { value: singleLineValue(action.value) } })
        return
      }

      if (action.type === 'add_shape') {
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
            color: text(action.color) || COLORS.accent,
          })
        }
        shape.updates.push({
          key,
          patch: {
            label: text(action.label) || text(action.text) || shape.label,
            value: text(action.value) || shape.value,
            shapeType: text(action.shape_type) || shape.shapeType,
            color: text(action.color) || shape.color,
          },
        })
        return
      }

      if (action.type === 'add_arrow') {
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

      if (action.type === 'show_text') {
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
          },
        })
        return
      }

      if (action.type === 'update_element' || action.type === 'highlight_element') {
        const targetId = text(action.target_id) || text(action.id)
        const target = findObject(targetId)
        if (!target) return
        if (action.type === 'highlight_element') {
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
  for (const update of object.updates) {
    if (!revealedKeys.has(update.key)) continue
    Object.assign(state, update.patch)
    if (typeof update.patch.highlightedLine === 'number') state.highlightedLine = update.patch.highlightedLine
    if (update.patch.highlighted) state.active = true
  }
  if (state.kind === 'code' && typeof state.code === 'string') state.lines = state.code.split('\n')
  return state
}

export { COLORS }
