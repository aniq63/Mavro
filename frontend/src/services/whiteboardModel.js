/** @typedef {'select' | 'pen' | 'eraser' | 'text' | 'rectangle' | 'ellipse' | 'arrow'} DrawingTool */
/** @typedef {{ id: string, kind: 'stroke', points: Array<{ x: number, y: number }>, color: string, width: number }} StrokeElement */
/** @typedef {{ id: string, kind: 'rectangle' | 'ellipse' | 'arrow', x: number, y: number, width: number, height: number, color: string, strokeWidth: number }} ShapeElement */
/** @typedef {{ id: string, kind: 'text', x: number, y: number, text: string, color: string, fontSize: number }} TextElement */
/** @typedef {StrokeElement | ShapeElement | TextElement} StudentElement */
/** @typedef {{ id: string, codeLine: string, variable: string, output: string, label: string }} TeachingStep */

/** @type {{ title: string, code: string[], steps: TeachingStep[], explanation: string }} */
export const loopLesson = {
  title: 'A for loop, step by step',
  code: ['for i in range(3):', '    print(i)'],
  steps: [
    { id: 'step-1', codeLine: 'i = 0', variable: '0', output: '0', label: 'FIRST PASS' },
    { id: 'step-2', codeLine: 'i = 1', variable: '1', output: '1', label: 'SECOND PASS' },
    { id: 'step-3', codeLine: 'i = 2', variable: '2', output: '2', label: 'THIRD PASS' },
  ],
  explanation: 'range(3) supplies three values: 0, 1, and 2. The indented print statement runs once for each value.',
}

/** @param {unknown} value @returns {value is { message: string, whiteboardActions: Array<{ kind: 'highlight-step', stepId: string } | { kind: 'clear-highlight' }> }} */
export function isTutorReply(value) {
  if (!value || typeof value !== 'object' || !('message' in value) || typeof value.message !== 'string' || !('whiteboardActions' in value) || !Array.isArray(value.whiteboardActions)) return false
  return value.whiteboardActions.every((action) => action && typeof action === 'object' && ((action.kind === 'highlight-step' && typeof action.stepId === 'string') || action.kind === 'clear-highlight'))
}
