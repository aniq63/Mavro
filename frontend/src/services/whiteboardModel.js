/** @typedef {'select' | 'pen' | 'eraser' | 'text' | 'rectangle' | 'ellipse' | 'arrow'} DrawingTool */
/** @typedef {{ id: string, kind: 'stroke', points: Array<{ x: number, y: number }>, color: string, width: number }} StrokeElement */
/** @typedef {{ id: string, kind: 'rectangle' | 'ellipse' | 'arrow', x: number, y: number, width: number, height: number, color: string, strokeWidth: number }} ShapeElement */
/** @typedef {{ id: string, kind: 'text', x: number, y: number, text: string, color: string, fontSize: number }} TextElement */
/** @typedef {StrokeElement | ShapeElement | TextElement} StudentElement */

/**
 * Validates that a value is a proper TutorReply from the API.
 * @param {unknown} value
 * @returns {value is { message: string, spoken_explanation?: string, lesson_title?: string, board_summary?: string, follow_up_question?: string, steps?: any[], whiteboardActions: any[] }}
 */
export function isTutorReply(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string' &&
    'whiteboardActions' in value &&
    Array.isArray(value.whiteboardActions)
  )
}

/**
 * Given a list of API steps from a TutorResponse, return a flat list of all
 * whiteboard actions across all steps in order.
 * @param {Array<{ id?: string, step_id?: string, whiteboard_actions?: any[] }>} steps
 * @returns {any[]}
 */
export function flattenStepActions(steps) {
  if (!Array.isArray(steps)) return []
  const out = []
  for (const step of steps) {
    const actions = Array.isArray(step?.whiteboard_actions) ? step.whiteboard_actions : []
    for (const action of actions) {
      if (action && typeof action === 'object') out.push(action)
    }
  }
  return out
}
