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

// Tic secco una volta al secondo (chiamato dall'esterno solo quando il secondo cambia)
export function playTick() {
  const c = getCtx()
  if (!c) return
  // Click secco: breve impulso a 1200Hz, decay rapidissimo
  playNote(1200, c.currentTime, 0.04, 'square', 0.12)
}

// Risposta corretta: ding brillante ascendente (Do5 → Mi5 → Sol5)
export function playCorrect() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  playNote(1047, t,        0.15, 'sine', 0.4)  // Do5
  playNote(1319, t + 0.12, 0.15, 'sine', 0.4)  // Mi5
  playNote(1568, t + 0.24, 0.30, 'sine', 0.45) // Sol5
}

// Risposta sbagliata: buzzer basso dissonante (Fa#2 → Re2)
export function playWrong() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  // Nota bassa + distorsione sawtooth = suono "errore" inconfondibile
  playNote(185, t,        0.25, 'sawtooth', 0.5) // Fa#3
  playNote(155, t + 0.22, 0.35, 'sawtooth', 0.4) // Re#3 (dissonanza)
}

// Astensione: singolo "clunk" piatto neutro (nota media smorzata)
export function playAbstain() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  playNote(370, t, 0.18, 'triangle', 0.25) // Fa#4 smorzato
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
