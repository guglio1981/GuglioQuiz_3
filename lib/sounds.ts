let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  return ctx
}

export function initAudioContext() {
  const c = getCtx()
  if (c?.state === 'suspended') c.resume()
}

function playNote(freq: number, startTime: number, duration: number, type: OscillatorType, gain: number) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gainNode = c.createGain()
  osc.connect(gainNode)
  gainNode.connect(c.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  gainNode.gain.setValueAtTime(gain, startTime)
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

export function playTick() {
  const c = getCtx()
  if (!c) return
  playNote(900, c.currentTime, 0.05, 'square', 0.15)
}

export function playCorrect() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  playNote(523, t,        0.18, 'sine', 0.35) // Do
  playNote(659, t + 0.15, 0.25, 'sine', 0.35) // Mi
}

export function playWrong() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  playNote(440, t,        0.20, 'triangle', 0.35) // La
  playNote(349, t + 0.18, 0.28, 'triangle', 0.30) // Fa
}

export function playFanfare() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  const notes = [523, 659, 784, 659, 1047] // Do Mi Sol Mi Do(alta)
  const dur   = [0.18, 0.18, 0.18, 0.18, 0.45]
  let offset = 0
  notes.forEach((freq, i) => {
    playNote(freq, t + offset, dur[i] + 0.1, 'sine', 0.4)
    offset += dur[i]
  })
}
