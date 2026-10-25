import { useCallback, useReducer } from 'react'

const initialState = { elements: [], past: [], future: [] }

function reducer(state, action) {
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return { elements: state.past.at(-1), past: state.past.slice(0, -1), future: [state.elements, ...state.future] }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return { elements: state.future[0], past: [...state.past, state.elements], future: state.future.slice(1) }
  }
  if (action.type === 'clear') {
    if (!state.elements.length) return state
    return { elements: [], past: [...state.past, state.elements], future: [] }
  }
  if (action.type === 'replace') {
    return { elements: action.elements, past: [...state.past, state.elements], future: [] }
  }
  if (action.type === 'add') {
    return { elements: [...state.elements, action.element], past: [...state.past, state.elements], future: [] }
  }
  if (action.type === 'update') {
    return { elements: state.elements.map((item) => item.id === action.id ? { ...item, ...action.patch } : item), past: [...state.past, state.elements], future: [] }
  }
  if (action.type === 'remove') {
    return { elements: state.elements.filter((item) => item.id !== action.id), past: [...state.past, state.elements], future: [] }
  }
  return state
}

export default function useWhiteboard() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const addElement = useCallback((element) => dispatch({ type: 'add', element }), [])
  const updateElement = useCallback((id, patch) => dispatch({ type: 'update', id, patch }), [])
  const removeElement = useCallback((id) => dispatch({ type: 'remove', id }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const replace = useCallback((elements) => dispatch({ type: 'replace', elements }), [])

  return { elements: state.elements, canUndo: state.past.length > 0, canRedo: state.future.length > 0, addElement, updateElement, removeElement, clear, undo, redo, replace }
}
