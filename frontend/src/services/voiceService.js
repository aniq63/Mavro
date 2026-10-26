/**
 * Narration service.
 *
 * Primary path: ask the FastAPI backend for natural speech (ElevenLabs / OpenAI).
 * Fallback: the browser's SpeechSynthesis API, so the lesson still narrates when
 * no provider key is configured or the provider is temporarily unavailable.
 */

const rawBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const API_BASE = String(rawBase).trim().replace(/\/$/, '')
const CACHE_LIMIT = 24

const urlCache = new Map()
let providerState = { available: null, checkedAt: 0, retryAt: 0 }

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function revokeUrl(url) {
  if (url && String(url).startsWith('blob:')) {
    try { URL.revokeObjectURL(url) } catch { /* ignore */ }
  }
}

function rememberUrl(text, url) {
  urlCache.set(text, url)
  while (urlCache.size > CACHE_LIMIT) {
    const firstKey = urlCache.keys().next().value
    const stale = urlCache.get(firstKey)
    urlCache.delete(firstKey)
    revokeUrl(stale)
  }
}

async function fetchSpeechBlob(text, signal) {
  const response = await fetch(`${API_BASE}/api/voice/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!response.ok) return null
  const blob = await response.blob()
  if (!blob || !blob.size) return null
  return { url: URL.createObjectURL(blob), provider: response.headers.get('X-TTS-Provider') || 'server' }
}

export async function checkVoiceProvider() {
  const now = Date.now()
  if (providerState.available !== null && now < providerState.retryAt) return providerState
  try {
    const response = await fetch(`${API_BASE}/api/voice/status`)
    if (!response.ok) throw new Error('status failed')
    const data = await response.json()
    const available = Boolean(data?.available)
    const retryMs = available ? 60000 : Math.max(120000, (Number(data?.retry_seconds) || 60) * 1000)
    providerState = {
      available,
      provider: data?.provider ?? 'browser',
      checkedAt: now,
      retryAt: now + retryMs,
    }
  } catch {
    providerState = { available: false, provider: 'browser', checkedAt: now, retryAt: now + 120000 }
  }
  return providerState
}

async function narrationUrl(text, { signal } = {}) {
  const clean = String(text ?? '').trim()
  if (!clean) return null
  if (urlCache.has(clean)) return { url: urlCache.get(clean), cached: true }
  const status = await checkVoiceProvider()
  if (!status.available) return null
  try {
    const result = await fetchSpeechBlob(clean, signal)
    if (!result) {
      const now = Date.now()
      providerState = { available: false, provider: 'browser', checkedAt: now, retryAt: now + 120000 }
      return null
    }
    rememberUrl(clean, result.url)
    return { url: result.url, cached: false, provider: result.provider }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    const now = Date.now()
    providerState = { available: false, provider: 'browser', checkedAt: now, retryAt: now + 120000 }
    return null
  }
}

export function prefetchNarration(text) {
  const clean = String(text ?? '').trim()
  if (!clean || urlCache.has(clean)) return
  narrationUrl(clean).catch(() => {})
}

function pickBrowserVoice() {
  if (!speechSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const preferred = [
    'Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria',
    'Microsoft Jenny', 'Karen', 'Moira', 'Serena',
  ]
  for (const name of preferred) {
    const match = voices.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase()))
    if (match) return match
  }
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith('en')) || voices[0]
}

export class NarrationPlayer {
  constructor() {
    this.audio = null
    this.utterance = null
    this.currentUrl = null
    this.state = 'idle'
    this.token = 0
    this.callbacks = {}
    this.mode = null
  }

  get isPlaying() {
    return this.state === 'playing'
  }

  get isPaused() {
    return this.state === 'paused'
  }

  _setState(next) {
    this.state = next
    this.callbacks?.onStateChange?.(next)
  }

  _cleanupAudio() {
    if (this.audio) {
      this.audio.onended = null
      this.audio.onerror = null
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load?.()
      this.audio = null
    }
  }

  _cleanupBrowser() {
    if (this.utterance) {
      this.utterance.onend = null
      this.utterance.onerror = null
      this.utterance = null
    }
  }

  async play(text, callbacks = {}) {
    this.stop('interrupted')
    const token = ++this.token
    const clean = String(text ?? '').trim()
    this.callbacks = callbacks
    if (!clean) {
      callbacks.onError?.('empty')
      return false
    }

    this._setState('loading')
    let result = null
    try {
      result = await narrationUrl(clean)
    } catch {
      // Network failure: fall through to the browser voice.
    }
    if (token !== this.token) return false

    if (result?.url) {
      this.currentUrl = result.url
      const audio = new Audio(result.url)
      audio.preload = 'auto'
      audio.playbackRate = 0.98
      this.audio = audio
      this.mode = 'server'
      audio.onended = () => {
        if (token !== this.token) return
        this._cleanupAudio()
        this.currentUrl = null
        this.callbacks = {}
        this._setState('idle')
        callbacks.onEnd?.({ reason: 'ended' })
      }
      audio.onerror = () => {
        if (token !== this.token) return
        this._cleanupAudio()
        this.currentUrl = null
        this._playBrowserFallback(clean, token, callbacks)
      }
      try {
        await audio.play()
        if (token !== this.token) return false
        this._setState('playing')
        callbacks.onStart?.({
          mode: 'server',
          duration: Number.isFinite(audio.duration) ? audio.duration * 1000 : null,
        })
        return true
      } catch {
        this._cleanupAudio()
        this.currentUrl = null
        this._playBrowserFallback(clean, token, callbacks)
        return true
      }
    }

    this._playBrowserFallback(clean, token, callbacks)
    return true
  }

  _playBrowserFallback(text, token, callbacks) {
    if (token !== this.token) return
    if (!speechSupported()) {
      this._setState('idle')
      callbacks.onError?.('unsupported')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickBrowserVoice()
    if (voice) utterance.voice = voice
    utterance.rate = 0.97
    utterance.pitch = 1.02
    utterance.lang = 'en-US'
    utterance.onstart = () => {
      if (token !== this.token) return
      this._setState('playing')
      callbacks.onStart?.({ mode: 'browser', duration: null })
    }
    utterance.onend = () => {
      if (token !== this.token) return
      this._cleanupBrowser()
      this.callbacks = {}
      this._setState('idle')
      callbacks.onEnd?.({ reason: 'ended' })
    }
    utterance.onerror = (event) => {
      if (token !== this.token) return
      this._cleanupBrowser()
      this._setState('idle')
      if (event?.error === 'interrupted' || event?.error === 'canceled') return
      callbacks.onError?.(event?.error || 'speech-error')
    }
    this.utterance = utterance
    this.mode = 'browser'
    window.speechSynthesis.speak(utterance)
  }

  pause() {
    if (this.mode === 'server' && this.audio && this.state === 'playing') {
      this.audio.pause()
      this._setState('paused')
      return true
    }
    if (this.mode === 'browser' && speechSupported() && this.state === 'playing') {
      window.speechSynthesis.pause()
      this._setState('paused')
      return true
    }
    return false
  }

  resume() {
    if (this.mode === 'server' && this.audio && this.state === 'paused') {
      this.audio.play().then(() => this._setState('playing')).catch(() => this._setState('paused'))
      return true
    }
    if (this.mode === 'browser' && speechSupported() && this.state === 'paused') {
      window.speechSynthesis.resume()
      this._setState('playing')
      return true
    }
    return false
  }

  replay() {
    if (this.mode === 'server' && this.audio) {
      this.audio.currentTime = 0
      this.audio.play().then(() => this._setState('playing')).catch(() => {})
      return true
    }
    return false
  }

  stop(reason = 'stopped') {
    const wasActive = this.state !== 'idle'
    this.token += 1
    this._cleanupAudio()
    this._cleanupBrowser()
    if (speechSupported()) window.speechSynthesis.cancel()
    this.currentUrl = null
    this._setState('idle')
    const pending = this.callbacks
    this.callbacks = {}
    if (wasActive) pending?.onEnd?.({ reason })
    return true
  }
}

export const narrationPlayer = new NarrationPlayer()

export function stopSpeech() {
  return narrationPlayer.stop('stopped')
}

export function pauseSpeech() {
  return narrationPlayer.pause()
}

export function resumeSpeech() {
  return narrationPlayer.resume()
}

export function speakText(text, options = {}) {
  narrationPlayer.play(text, {
    onEnd: options.onEnd,
    onError: options.onError,
    onStart: options.onStart,
  })
  return true
}
