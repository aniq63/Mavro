import { useRef, useState } from 'react'
import { buildLessonScene } from '../services/lessonLayout.js'
import { narrationPlayer, prefetchNarration } from '../services/voiceService.js'

const estimateDuration = (text) => {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(2400, Math.min(18000, words * 390 + 900))
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const stepSignature = (step) => JSON.stringify({
  title: step.title,
  narration: step.narration,
  actions: step.actions.map((action) => action.raw),
})

/**
 * Coordinates narration with progressive whiteboard reveals.
 *
 * Synchronisation is intentionally honest: the player aligns each step's
 * narration with the start of that step, and staggers that step's actions
 * across the narration. It does not attempt word-level karaoke timing.
 */
export default function useLessonPlayback() {
  const [scene, setScene] = useState(null)
  const [revealedKeys, setRevealedKeys] = useState(() => new Set())
  const [status, setStatus] = useState('idle')
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [activeStepId, setActiveStepId] = useState(null)
  const [isFollowUp, setIsFollowUp] = useState(false)

  const sceneRef = useRef(null)
  const revealedRef = useRef(new Set())
  const runRef = useRef(0)
  const pausedRef = useRef(false)
  const timerRef = useRef(null)
  const revealQueueRef = useRef(null)
  const segmentRef = useRef({ resolve: null })
  const pauseWaitRef = useRef(null)
  const previousLessonIdRef = useRef(null)

  const commitRevealed = (next) => {
    revealedRef.current = next
    setRevealedKeys(next)
  }

  const revealKey = (key) => {
    if (!key || revealedRef.current.has(key)) return
    const next = new Set(revealedRef.current)
    next.add(key)
    commitRevealed(next)
  }

  const revealObjects = (actions) => {
    const next = new Set(revealedRef.current)
    let changed = false
    for (const action of actions) {
      if (!next.has(action.key)) {
        next.add(action.key)
        changed = true
      }
    }
    if (changed) commitRevealed(next)
  }

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const resolveSegment = (reason) => {
    const resolve = segmentRef.current.resolve
    segmentRef.current.resolve = null
    if (resolve) resolve(reason)
  }

  const resolvePauseWait = () => {
    const resolve = pauseWaitRef.current
    pauseWaitRef.current = null
    if (resolve) resolve()
  }

  const scheduleReveal = (run) => {
    if (runRef.current !== run || pausedRef.current) return
    const queue = revealQueueRef.current
    if (!queue || queue.index >= queue.actions.length) return
    const action = queue.actions[queue.index]
    queue.index += 1
    revealKey(action.key)
    timerRef.current = setTimeout(() => scheduleReveal(run), queue.interval)
  }

  const startReveal = (actions, run, interval) => {
    clearTimer()
    revealQueueRef.current = { actions, index: 0, interval, run }
    if (!pausedRef.current) scheduleReveal(run)
  }

  const waitWhilePaused = async (run) => {
    while (pausedRef.current && runRef.current === run) {
      await new Promise((resolve) => { pauseWaitRef.current = resolve })
    }
  }

  const playSegment = async (narration) => {
    const ended = new Promise((resolve) => { segmentRef.current.resolve = resolve })
    let started = false
    try {
      started = await narrationPlayer.play(narration, {
        onEnd: ({ reason }) => resolveSegment(reason),
        onError: () => resolveSegment('error'),
        onStart: () => {
          if (pausedRef.current) narrationPlayer.pause()
        },
      })
    } catch {
      resolveSegment('error')
    }
    return { started, ended }
  }

  const runLesson = async (targetScene, startIndex, run) => {
    const steps = targetScene.steps
    setStatus('loading')

    for (let index = startIndex; index < steps.length; index += 1) {
      if (runRef.current !== run) return
      const step = steps[index]
      setCurrentStepIndex(index)
      setActiveStepId(step.id)

      const remaining = step.actions.filter((action) => !revealedRef.current.has(action.key))

      const nextStep = steps[index + 1]
      if (nextStep?.narration) prefetchNarration(nextStep.narration)

      const narration = step.narration || step.explanation || step.title
      const estimated = estimateDuration(narration)
      setStatus('playing')

      const { started, ended } = await playSegment(narration)
      if (runRef.current !== run) return
      if (pausedRef.current) setStatus('paused')

      const interval = Math.max(760, Math.min(1500, Math.round(estimated / Math.max(remaining.length, 1))))
      startReveal(remaining, run, interval)

      if (started) {
        const reason = await ended
        if (runRef.current !== run || reason === 'stopped') return
      } else {
        await wait(estimated)
      }
      if (runRef.current !== run) return

      clearTimer()
      revealObjects(step.actions)
      await wait(420)
      if (runRef.current !== run) return
      await waitWhilePaused(run)
    }

    if (runRef.current !== run) return
    if (targetScene.summary) {
      setStatus('playing')
      const { started, ended } = await playSegment(targetScene.summary)
      if (started) {
        const reason = await ended
        if (runRef.current !== run || reason === 'stopped') return
      }
    }
    if (runRef.current !== run) return
    setStatus('finished')
    setActiveStepId(steps[steps.length - 1]?.id ?? null)
  }

  const beginPlayback = (targetScene, startIndex) => {
    const run = runRef.current + 1
    runRef.current = run
    pausedRef.current = false
    clearTimer()
    setCurrentStepIndex(startIndex)
    setActiveStepId(targetScene.steps[startIndex]?.id ?? null)
    runLesson(targetScene, startIndex, run)
  }

  const stop = () => {
    runRef.current += 1
    pausedRef.current = false
    clearTimer()
    resolveSegment('stopped')
    resolvePauseWait()
    narrationPlayer.stop('stopped')
    setStatus('idle')
  }

  const loadLesson = (lesson) => {
    const nextScene = buildLessonScene(lesson)
    if (!nextScene) return null

    // A conversational clarification may have no drawable actions. Keep the
    // existing board intact instead of replacing it with an empty scene.
    if (!nextScene.objects.length) {
      setIsFollowUp(Boolean(sceneRef.current))
      return { scene: null, empty: true }
    }

    const previousScene = sceneRef.current
    const revealedBefore = new Set(revealedRef.current)
    stop()
    const sameLesson = Boolean(previousLessonIdRef.current && nextScene.lessonId === previousLessonIdRef.current)
    const followUp = sameLesson && (lesson.mode === 'follow_up' || lesson.mode === 'clarification')
    const preserved = new Set()

    // Keep only the unchanged prefix of an existing lesson. Playback resumes at the
    // first revised step, so every changed step is narrated against fresh visuals.
    if (followUp && previousScene) {
      const previousSteps = new Map(previousScene.steps.map((step) => [step.id, step]))
      for (const step of nextScene.steps) {
        const oldStep = previousSteps.get(step.id)
        if (!oldStep || stepSignature(oldStep) !== stepSignature(step)) break
        for (const action of step.actions) {
          if (revealedBefore.has(action.key)) preserved.add(action.key)
        }
      }
    }

    sceneRef.current = nextScene
    setScene(nextScene)
    setIsFollowUp(followUp)
    commitRevealed(preserved)
    previousLessonIdRef.current = nextScene.lessonId

    const firstUnrevealed = nextScene.steps.findIndex(
      (step) => step.actions.some((action) => !preserved.has(action.key)),
    )
    const startIndex = firstUnrevealed >= 0 ? firstUnrevealed : 0
    beginPlayback(nextScene, startIndex)
    return nextScene
  }

  const clearLesson = () => {
    stop()
    sceneRef.current = null
    previousLessonIdRef.current = null
    setScene(null)
    setIsFollowUp(false)
    commitRevealed(new Set())
    setCurrentStepIndex(0)
    setActiveStepId(null)
  }

  const pause = () => {
    if (status !== 'playing' && status !== 'loading') return false
    pausedRef.current = true
    clearTimer()
    narrationPlayer.pause()
    setStatus('paused')
    return true
  }

  const resume = () => {
    if (status !== 'paused') return false
    pausedRef.current = false
    narrationPlayer.resume()
    setStatus('playing')
    resolvePauseWait()
    const queue = revealQueueRef.current
    if (queue && queue.index < queue.actions.length) scheduleReveal(runRef.current)
    return true
  }

  const togglePause = () => {
    if (status === 'paused') return resume()
    return pause()
  }

  const replay = () => {
    const targetScene = sceneRef.current
    if (!targetScene) return
    const startIndex = Math.min(currentStepIndex, targetScene.steps.length - 1)
    const preserved = new Set()
    for (let index = 0; index < startIndex; index += 1) {
      for (const action of targetScene.steps[index].actions) preserved.add(action.key)
    }
    stop()
    commitRevealed(preserved)
    beginPlayback(targetScene, startIndex)
  }

  const restart = () => {
    const targetScene = sceneRef.current
    if (!targetScene) return
    stop()
    commitRevealed(new Set())
    beginPlayback(targetScene, 0)
  }

  const totalSteps = scene?.steps.length ?? 0

  return {
    scene,
    revealedKeys,
    status,
    isPlaying: status === 'playing' || status === 'loading',
    isPaused: status === 'paused',
    isFinished: status === 'finished',
    hasLesson: Boolean(scene),
    currentStepIndex,
    totalSteps,
    activeStepId,
    isFollowUp,
    loadLesson,
    clearLesson,
    pause,
    resume,
    togglePause,
    stop,
    replay,
    restart,
  }
}
