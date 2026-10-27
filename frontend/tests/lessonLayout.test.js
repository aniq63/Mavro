import test from 'node:test'
import assert from 'node:assert/strict'

import { BOARD_HEIGHT, BOARD_WIDTH, validateLessonLayout } from '../src/services/lessonLayout.js'

const shape = (id, label, value = '') => ({ type: 'add_shape', id, label, value })
const arrow = (id, from, to, label = '') => ({ type: 'add_arrow', id, from, to, label })

function lesson(layout, actions) {
  return {
    lesson_id: 'layout-test',
    lesson_title: 'Layout test',
    message: 'Testing deterministic layout.',
    spoken_explanation: 'Summary.',
    steps: [{ id: 'step-1', title: 'Step one', layout, narration: 'Narration.', whiteboard_actions: actions }],
  }
}

function transformedBounds(scene) {
  if (!scene.bodyBounds) return null
  const bounds = scene.bodyBounds
  const match = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/.exec(scene.fitTransform || '')
  if (!match) return bounds
  const [, tx, ty, scale] = match.map(Number)
  return {
    x: bounds.x * scale + tx,
    y: bounds.y * scale + ty,
    width: bounds.width * scale,
    height: bounds.height * scale,
  }
}

function assertSafe(name, data) {
  const { scene, issues } = validateLessonLayout(data)
  assert.ok(scene, `${name}: expected a scene`)
  const overlaps = issues.filter((issue) => issue.includes('overlaps'))
  const invalid = issues.filter((issue) => issue.includes('invalid geometry'))
  assert.deepEqual(overlaps, [], `${name}: elements overlap`)
  assert.deepEqual(invalid, [], `${name}: elements have invalid geometry`)

  const bounds = scene.bodyBounds
  if (bounds) {
    const visible = transformedBounds(scene)
    assert.ok(visible.x >= 0 && visible.y >= 0, `${name}: content starts off-board`)
    assert.ok(visible.x + visible.width <= BOARD_WIDTH + 1, `${name}: content is clipped on the right`)
    assert.ok(visible.y + visible.height <= BOARD_HEIGHT + 1, `${name}: content is clipped on the bottom`)
  }
}

test('code lesson with long code, many variables, and notes stays inside the board', () => {
  assertSafe('long code', lesson('code', [
    {
      type: 'show_code',
      id: 'code-1',
      label: 'Python',
      code: Array.from({ length: 18 }, (_, index) => `value_${index} = compute(${index})  # trace line ${index}`).join('\n'),
    },
    { type: 'highlight_code', line: 6 },
    ...Array.from({ length: 7 }, (_, index) => ({ type: 'show_variable', id: `var-${index}`, variable_name: `i${index}`, value: String(index) })),
    { type: 'show_output', value: '0\n1\n2' },
    { type: 'show_text', text: 'The loop updates the same variable each iteration, which is why the tracker only needs one card.', role: 'note' },
  ]))
})

test('equation lesson with graph, table, notes, and state does not overlap', () => {
  assertSafe('equation', lesson('equation', [
    { type: 'show_text', id: 'eq-1', text: '2x + 5 = 17', role: 'equation' },
    { type: 'show_text', id: 'eq-2', text: '2x = 12', role: 'equation' },
    { type: 'show_text', id: 'eq-3', text: 'x = 6', role: 'equation' },
    { type: 'show_text', id: 'note-1', text: 'Subtract five from both sides, then divide both sides by two so the equation stays balanced.', role: 'note' },
    { type: 'show_graph', id: 'graph-1', label: 'y = 2x + 5', points: [[-2, 1], [0, 5], [3, 11], [6, 17]], x_label: 'x', y_label: 'y' },
    { type: 'show_table', id: 'table-1', columns: ['x', '2x + 5'], rows: [['0', '5'], ['3', '11'], ['6', '17']] },
    { type: 'show_variable', variable_name: 'x', value: '6' },
    { type: 'show_output', value: 'x = 6' },
  ]))
})

test('large flow diagrams with many nodes and arrows are packed safely', () => {
  assertSafe('flow', lesson('flow', [
    { type: 'show_text', text: 'A process with many stages still has to stay readable.', role: 'note' },
    ...Array.from({ length: 12 }, (_, index) => shape(`n-${index}`, `Stage ${index + 1}`, `detail ${index}`)),
    ...Array.from({ length: 11 }, (_, index) => arrow(`a-${index}`, `n-${index}`, `n-${index + 1}`, `step ${index + 1}`)),
    { type: 'show_variable', variable_name: 'stage', value: '12' },
  ]))
})

test('large concept maps and code diagrams do not leave unplaced nodes', () => {
  assertSafe('concept', lesson('concept', [
    ...Array.from({ length: 10 }, (_, index) => shape(`c-${index}`, `Concept ${index}`, `value ${index}`)),
    ...Array.from({ length: 9 }, (_, index) => arrow(`ca-${index}`, 'c-0', `c-${index + 1}`, `link ${index}`)),
  ]))
  assertSafe('code + diagram', lesson('code', [
    { type: 'show_code', id: 'code-1', code: 'def fib(n):\n    return n if n < 2 else fib(n-1) + fib(n-2)' },
    ...Array.from({ length: 6 }, (_, index) => shape(`frame-${index}`, `fib(${index})`, 'active')),
  ]))
})

test('invalid visualization data is dropped without crashing', () => {
  const { scene, issues } = validateLessonLayout(lesson('auto', [
    { type: 'show_table', id: 'bad-table', columns: ['a'] },
    { type: 'show_graph', id: 'bad-graph', points: [['x', 'y']] },
    { type: 'update_element', target_id: 'missing', value: 'x' },
  ]))
  assert.ok(scene)
  assert.equal(scene.objects.filter((object) => object.kind === 'table').length, 0)
  assert.equal(scene.objects.filter((object) => object.kind === 'graph').length, 0)
  assert.ok(issues.some((issue) => issue.includes('table had no usable rows')))
  assert.ok(issues.some((issue) => issue.includes('target "missing" does not exist')))
})
