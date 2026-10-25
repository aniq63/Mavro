/**
 * Mock service boundary for the future FastAPI tutor API.
 * Replace these implementations with fetch calls using VITE_API_BASE_URL when the API is available.
 * Never place provider credentials in this client-side module.
 */
const MOCK_DELAY_MS = 850
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration))

/** @typedef {{ id: string, role: 'tutor' | 'student', text: string, createdAt: string }} ChatMessageData */
/** @typedef {{ kind: 'highlight-step', stepId: string } | { kind: 'clear-highlight' }} WhiteboardAction */
/** @typedef {{ message: string, whiteboardActions: WhiteboardAction[] }} TutorReply */

/** @param {string} prompt @returns {Promise<TutorReply>} */
export async function sendMessage(prompt) {
  await wait(MOCK_DELAY_MS)
  const cleanPrompt = String(prompt ?? '').trim()
  if (!cleanPrompt) throw new Error('Write a question before sending it.')

  const lowerPrompt = cleanPrompt.toLowerCase()
  let message = 'That’s a great question. Look at the highlighted part of the lesson, then follow the values from one step to the next. You can draw or add notes on the board as you think it through.'
  let stepId = 'step-1'

  if (lowerPrompt.includes('stop') || lowerPrompt.includes('2')) {
    message = 'The loop stops after i = 2 because range(3) produces 0, 1, and 2. Once those three values have been used, there is no next value, so the loop finishes. Notice that 3 itself is not included.'
    stepId = 'step-3'
  } else if (lowerPrompt.includes('another') || lowerPrompt.includes('example')) {
    message = 'Try range(4): Python gives the loop i = 0, then 1, then 2, then 3. The stop value (4) is still excluded. The same pattern applies: start included, stop excluded.'
    stepId = 'step-2'
  } else if (lowerPrompt.includes('practice') || lowerPrompt.includes('question')) {
    message = 'Practice: if the code says for i in range(2), what values will i take, and what will print(i) show? Write your prediction on the board before checking: the values start at 0 and stop just before 2.'
    stepId = 'step-1'
  } else if (lowerPrompt.includes('explain') || lowerPrompt.includes('step')) {
    message = 'The loop repeats its indented body once for each value in range(3). First i is 0, then 1, then 2. Each time, print(i) writes that current value to the output.'
    stepId = 'step-2'
  }

  return {
    message,
    whiteboardActions: [{ kind: 'highlight-step', stepId }],
  }
}

/** @param {string} stepId @returns {Promise<TutorReply>} */
export async function requestExplanation(stepId) {
  await wait(500)
  const validStep = ['step-1', 'step-2', 'step-3'].includes(stepId) ? stepId : 'step-1'
  return {
    message: `Let’s focus on ${validStep.replace('-', ' ')}. In this loop, range(3) supplies one value at a time, and the indented print statement runs using that value.`,
    whiteboardActions: [{ kind: 'highlight-step', stepId: validStep }],
  }
}

/** @param {string} topic @returns {Promise<TutorReply>} */
export async function requestWhiteboardUpdate(topic) {
  await wait(500)
  const lowerTopic = String(topic ?? '').toLowerCase()
  const stepId = lowerTopic.includes('stop') ? 'step-3' : lowerTopic.includes('output') ? 'step-2' : 'step-1'
  return {
    message: 'I’ve brought the related part of the example into focus. The lesson stays intact while your own notes and drawings remain on a separate layer.',
    whiteboardActions: [{ kind: 'highlight-step', stepId }],
  }
}
