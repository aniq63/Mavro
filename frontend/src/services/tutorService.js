/**
 * FastAPI-backed tutor service for the Mavro frontend.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const normalizeApiUrl = (url) => String(url ?? '').trim().replace(/\/$/, '')

export function createConversationId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Build the whiteboardActions array that TutorDashboard.applyReply understands.
 * We emit one 'highlight-step' action per step that contains a highlight_code action
 * so the lesson tab can visually advance. All other step data is passed through as-is.
 *
 * @param {any} reply - raw API response
 * @returns {Array<{ kind: 'highlight-step', stepId: string } | { kind: 'clear-highlight' }>}
 */
function buildWhiteboardActions(reply) {
  const actions = []
  const steps = Array.isArray(reply?.steps) ? reply.steps : []

  for (const step of steps) {
    // The backend serialises 'id' aliased as 'step_id' in the Pydantic model; the
    // raw JSON key coming over the wire is 'step_id'. Support both forms.
    const stepId = String(step?.step_id ?? step?.id ?? '').trim()
    if (!stepId) continue
    const whiteboardActions = Array.isArray(step.whiteboard_actions) ? step.whiteboard_actions : []
    if (whiteboardActions.some((a) => a && a.type === 'highlight_code')) {
      actions.push({ kind: 'highlight-step', stepId })
    }
  }

  // If no highlight_code actions were present but the reply has steps, mark the
  // first step active so the lesson panel advances.
  if (!actions.length && steps.length > 0) {
    const firstId = String(steps[0]?.step_id ?? steps[0]?.id ?? '').trim()
    if (firstId) actions.push({ kind: 'highlight-step', stepId: firstId })
  }

  return actions
}

async function requestTutorChat(payload) {
  const url = `${normalizeApiUrl(API_BASE_URL)}/api/tutor/chat`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail = Array.isArray(data?.detail)
      ? data.detail.map((item) => item.msg || item).join(', ')
      : data?.detail || 'The tutor could not answer that question right now.'
    throw new Error(typeof detail === 'string' ? detail : 'The tutor could not answer that question right now.')
  }

  const data = await response.json()
  const message = String(data.message ?? 'The tutor has a follow-up.')
  const normalized = {
    lesson_id: data.lesson_id || null,
    mode: data.mode || 'new_lesson',
    message,
    spoken_explanation: data.spoken_explanation || message,
    lesson_title: data.lesson_title || 'Lesson update',
    board_summary: data.board_summary || '',
    follow_up_question: data.follow_up_question || null,
    steps: Array.isArray(data.steps) ? data.steps : [],
    whiteboardActions: buildWhiteboardActions(data),
  }
  return normalized
}

/** @param {string} prompt @param {string} conversationId @param {string} boardSummary @returns {Promise<any>} */
export async function sendMessage(prompt, conversationId, boardSummary = '') {
  const cleanPrompt = String(prompt ?? '').trim()
  if (!cleanPrompt) throw new Error('Write a question before sending it.')
  if (!conversationId) throw new Error('A conversation ID is required.')

  return requestTutorChat({
    conversation_id: conversationId,
    message: cleanPrompt,
    board_summary: boardSummary || 'The whiteboard is empty.',
  })
}

/** @param {string} stepId @param {string} conversationId @param {string} boardSummary @returns {Promise<any>} */
export async function requestExplanation(stepId, conversationId, boardSummary = '') {
  const question = stepId
    ? `Explain step ${stepId} of the current lesson in more detail.`
    : 'Give me a summary of the current lesson.'
  return sendMessage(question, conversationId, boardSummary)
}

/** @param {string} topic @param {string} conversationId @param {string} boardSummary @returns {Promise<any>} */
export async function requestWhiteboardUpdate(topic, conversationId, boardSummary = '') {
  const cleanTopic = String(topic ?? '').trim() || 'this lesson'
  return sendMessage(`Focus on ${cleanTopic} in the current lesson.`, conversationId, boardSummary)
}
