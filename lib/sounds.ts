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

// Tempo scaduto: klaxon basso discendente
export function playTimeUp() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  playNote(320, t,        0.28, 'sawtooth', 0.5)  // nota bassa
  playNote(220, t + 0.22, 0.38, 'sawtooth', 0.45) // più bassa (alarm)
  playNote(160, t + 0.52, 0.25, 'sawtooth', 0.35) // finale grave
}


// ── Background music ──────────────────────────────────────────────────────────
// Looping chord pad: I–V–vi–IV in C major, sine waves, very soft
let bgGain: GainNode | null = null
let bgScheduleTimeout: ReturnType<typeof setTimeout> | null = null
let bgRunning = false
let bgNextTime = 0
let bgChordIdx = 0

const BG_VOL    = 0.07
const CHORD_DUR = 2.8   // seconds per chord
const LOOK_AHEAD = 7    // schedule this many seconds ahead

// C4 E4 G4 / G3 B3 D4 / A3 C4 E4 / F3 A3 C4
const CHORDS: number[][] = [
  [261.63, 329.63, 392.00],
  [196.00, 246.94, 293.66],
  [220.00, 261.63, 329.63],
  [174.61, 220.00, 261.63],
]

function scheduleChord(c: AudioContext, out: GainNode, freqs: number[], t: number) {
  freqs.forEach(freq => {
    const osc = c.createOscillator()
    const g   = c.createGain()
    osc.connect(g)
    g.connect(out)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1 / freqs.length, t + 0.55)
    g.gain.setValueAtTime(1 / freqs.length, t + CHORD_DUR - 0.65)
    g.gain.linearRampToValueAtTime(0, t + CHORD_DUR)
    osc.start(t)
    osc.stop(t + CHORD_DUR + 0.05)
  })
}

function bgLoop() {
  const c = getCtx()
  if (!c || !bgRunning || !bgGain) return
  while (bgNextTime < c.currentTime + LOOK_AHEAD) {
    scheduleChord(c, bgGain, CHORDS[bgChordIdx % CHORDS.length], bgNextTime)
    bgChordIdx++
    bgNextTime += CHORD_DUR
  }
  bgScheduleTimeout = setTimeout(bgLoop, 1500)
}

export function startBgMusic() {
  if (typeof window === 'undefined' || bgRunning) return
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  bgGain = c.createGain()
  bgGain.gain.setValueAtTime(0, c.currentTime)
  bgGain.gain.linearRampToValueAtTime(BG_VOL, c.currentTime + 1.5)
  bgGain.connect(c.destination)
  bgRunning  = true
  bgNextTime = c.currentTime + 0.1
  bgChordIdx = 0
  bgLoop()
}

export function stopBgMusic() {
  bgRunning = false
  if (bgScheduleTimeout) { clearTimeout(bgScheduleTimeout); bgScheduleTimeout = null }
  if (bgGain && ctx) {
    const now = ctx.currentTime
    bgGain.gain.cancelScheduledValues(now)
    bgGain.gain.setValueAtTime(bgGain.gain.value, now)
    bgGain.gain.linearRampToValueAtTime(0, now + 1.0)
    const ref = bgGain
    setTimeout(() => { ref.disconnect(); if (bgGain === ref) bgGain = null }, 1100)
  }
}
