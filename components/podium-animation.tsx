'use client'

import { useEffect, useRef, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { parseAvatar, type Player } from '@/lib/types'

interface PodiumPlayer {
  id: string
  name: string
  score: number
  avatar: string | null
  avatarUrl: string | null
}

interface PodiumAnimationProps {
  players: PodiumPlayer[]
  onDone?: () => void
}

// Sizes
const SIZE_WINNER = 100
const SIZE_SECOND = 72
const SIZE_THIRD  = 54
const SIZE_NORMAL = 62

const ENTER_DUR  = 700
const FLOAT_DUR  = 2000
const SETTLE_DUR = 700
const REVEAL_DUR = 600

function easeOutExpo(t: number) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t) }
function easeInOutCubic(t: number) { return t < 0.5 ? 4*t*t*t : (1 - Math.pow(-2*t+2, 3))/2 }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

const TAILWIND_BG_TO_CSS: Record<string, string> = {
  'bg-red-500':     '#ef4444',
  'bg-blue-500':    '#3b82f6',
  'bg-green-500':   '#22c55e',
  'bg-yellow-500':  '#eab308',
  'bg-purple-500':  '#a855f7',
  'bg-pink-500':    '#ec4899',
  'bg-indigo-500':  '#6366f1',
  'bg-teal-500':    '#14b8a6',
  'bg-orange-500':  '#f97316',
  'bg-cyan-500':    '#06b6d4',
  'bg-rose-500':    '#f43f5e',
  'bg-amber-500':   '#f59e0b',
  'bg-lime-500':    '#84cc16',
  'bg-emerald-500': '#10b981',
  'bg-sky-500':     '#0ea5e9',
  'bg-violet-500':  '#8b5cf6',
  'bg-fuchsia-500': '#d946ef',
  'bg-slate-500':   '#64748b',
  'bg-stone-500':   '#78716c',
  'bg-neutral-500': '#737373',
}

function twBgToCss(tw: string | undefined): string {
  return tw ? (TAILWIND_BG_TO_CSS[tw] ?? 'oklch(0.28 0.02 280)') : 'oklch(0.28 0.02 280)'
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function PodiumAnimation({ players, onDone }: PodiumAnimationProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const rafRef   = useRef<number | null>(null)
  const confRef  = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Stabilize references so the animation doesn't restart on every render
  const top3 = useMemo(() => players.slice(0, 3), [players])
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const startAnimation = useCallback(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || top3.length === 0) return

    // Cancel previous
    if (rafRef.current)  cancelAnimationFrame(rafRef.current)
    if (confRef.current) cancelAnimationFrame(confRef.current)
    stage.innerHTML = ''

    const SW = stage.offsetWidth
    const SH = stage.offsetHeight
    const CX = SW / 2
    const CY = SH / 2 - 20

    // 3 column positions, shuffled so winner isn't always center
    const colsBase = [SW * 0.18, SW * 0.5, SW * 0.82]
    const finalCols = shuffle(colsBase)

    // Build card elements
    type CardState = {
      el: HTMLDivElement
      x: number; y: number; size: number; opacity: number
      fromX: number; fromY: number; fromSize: number
      frozenX: number; frozenY: number
      rank: number; idx: number
      orbitR: number; orbitSpeed: number; orbitOffset: number
    }

    const cards: CardState[] = top3.map((p, i) => {
      const rank = i + 1
      const el = document.createElement('div')
      el.style.cssText = `
        position:absolute; display:flex; flex-direction:column;
        align-items:center; gap:6px; opacity:0; left:0; top:0;
        pointer-events:none;
      `

      // Avatar
      const parsed = p.avatar ? parseAvatar(p.avatar) : null
      const avatarEl = document.createElement('div')
      avatarEl.style.cssText = `
        width:${SIZE_NORMAL}px; height:${SIZE_NORMAL}px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        border:3px solid oklch(0.35 0.03 280);
        background:${twBgToCss(parsed?.bg)};
        transition: border-color 0.4s, box-shadow 0.4s;
        overflow:hidden; flex-shrink:0;
      `

      // Avatar content
      if (p.avatarUrl) {
        const img = document.createElement('img')
        img.src = p.avatarUrl
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;'
        avatarEl.appendChild(img)
      } else if (parsed) {
        const span = document.createElement('span')
        span.className = p.avatar?.startsWith('initial:') ? '' : ''
        span.style.cssText = `font-size:${SIZE_NORMAL * 0.5}px; line-height:1;`
        span.textContent = parsed.icon
        avatarEl.appendChild(span)
      }

      // Name
      const nameEl = document.createElement('div')
      nameEl.style.cssText = 'font-size:14px;font-weight:800;color:white;text-align:center;white-space:nowrap;'
      nameEl.textContent = p.name

      // Reveal section (hidden initially)
      const revealEl = document.createElement('div')
      revealEl.style.cssText = `
        display:flex; flex-direction:column; align-items:center; gap:3px;
        opacity:0; transform:translateY(8px);
        transition:opacity 0.4s, transform 0.4s;
      `

      // Rank number
      const rankColors = ['oklch(0.78 0.18 85)', 'oklch(0.75 0.05 280)', 'oklch(0.62 0.22 25)']
      const rankEl = document.createElement('div')
      rankEl.style.cssText = `font-size:26px;font-weight:900;color:${rankColors[i]};line-height:1;`
      rankEl.textContent = String(rank)

      // Score
      const scoreEl = document.createElement('div')
      scoreEl.style.cssText = `font-size:12px;font-weight:700;color:${rankColors[i]};font-variant-numeric:tabular-nums;`
      scoreEl.textContent = p.score.toLocaleString('it-IT')

      revealEl.appendChild(rankEl)
      revealEl.appendChild(scoreEl)

      // Crown for winner
      if (rank === 1) {
        const crownEl = document.createElement('span')
        crownEl.style.cssText = 'font-size:22px;opacity:0;transition:opacity 0.3s;display:block;'
        crownEl.textContent = '👑'
        crownEl.id = `crown-${i}`
        el.appendChild(crownEl)
      } else {
        const spacer = document.createElement('span')
        spacer.style.cssText = 'height:22px;display:block;'
        el.appendChild(spacer)
      }

      el.appendChild(avatarEl)
      el.appendChild(nameEl)
      el.appendChild(revealEl)
      stage.appendChild(el)

      return {
        el, x: CX, y: CY, size: SIZE_NORMAL, opacity: 0,
        fromX: CX, fromY: CY, fromSize: SIZE_NORMAL,
        frozenX: CX, frozenY: CY,
        rank, idx: i,
        orbitR: 60 + i * 22,
        orbitSpeed: 0.45 + i * 0.18,
        orbitOffset: (i / 3) * Math.PI * 2 + Math.random() * 0.5,
      }
    })

    function applyCard(c: CardState) {
      const w = c.el.offsetWidth || 80
      const h = c.el.offsetHeight || 120
      c.el.style.opacity = String(c.opacity)
      c.el.style.transform = `translate(${c.x - w/2}px, ${c.y - h/2}px)`
      const av = c.el.querySelector('div') as HTMLDivElement
      if (av) {
        av.style.width  = c.size + 'px'
        av.style.height = c.size + 'px'
        const inner = av.querySelector('span, img') as HTMLElement
        if (inner && inner.tagName !== 'IMG') {
          inner.style.fontSize = (c.size * 0.5) + 'px'
        }
      }
    }

    let phase = 'enter'
    let startTime = 0

    function runAnim(ts: number) {
      if (startTime === 0) startTime = ts
      const el = ts - startTime

      if (phase === 'enter') {
        cards.forEach((c, i) => {
          const delay = i * 200
          const t = Math.max(0, Math.min((el - delay) / 400, 1))
          const e = easeOutExpo(t)
          const angle = c.orbitOffset
          const tx = CX + Math.cos(angle) * c.orbitR
          const ty = CY + Math.sin(angle) * c.orbitR * 0.4
          c.x = lerp(CX, tx, e)
          c.y = lerp(CY + 50, ty, e)
          c.opacity = e
          applyCard(c)
        })
        if (el >= ENTER_DUR) { phase = 'float'; startTime = ts }

      } else if (phase === 'float') {
        const t = el / FLOAT_DUR
        cards.forEach(c => {
          const angle = c.orbitOffset + t * Math.PI * 2 * c.orbitSpeed
          c.x = CX + Math.cos(angle) * c.orbitR * 0.9
          c.y = CY + Math.sin(angle) * c.orbitR * 0.42
          c.opacity = 1
          applyCard(c)
        })
        if (el >= FLOAT_DUR) {
          phase = 'settle'; startTime = ts
          cards.forEach(c => { c.fromX = c.x; c.fromY = c.y; c.fromSize = c.size })
        }

      } else if (phase === 'settle') {
        const t = Math.min(el / SETTLE_DUR, 1)
        const e = easeInOutCubic(t)
        cards.forEach(c => {
          c.x = lerp(c.fromX, finalCols[c.idx], e)
          c.y = lerp(c.fromY, CY - 10, e)
          applyCard(c)
        })
        if (el >= SETTLE_DUR) {
          phase = 'reveal'; startTime = ts
          cards.forEach(c => { c.fromSize = c.size })
        }

      } else if (phase === 'reveal') {
        const t = Math.min(el / REVEAL_DUR, 1)
        const e = easeOutExpo(t)
        const targetSizes = [SIZE_WINNER, SIZE_SECOND, SIZE_THIRD]
        cards.forEach(c => {
          c.size = lerp(c.fromSize, targetSizes[c.idx], e)
          c.x = finalCols[c.idx]; c.y = CY - 10
          applyCard(c)

          const av = c.el.querySelector('div') as HTMLDivElement
          if (av) {
            const borderColors = [
              `oklch(0.78 0.18 85 / ${e})`,
              `oklch(0.75 0.05 280 / ${e})`,
              `oklch(0.62 0.22 25 / ${e})`,
            ]
            const glowColors = [
              `0 0 ${20*e}px oklch(0.78 0.18 85 / ${0.6*e})`,
              `0 0 ${12*e}px oklch(0.75 0.05 280 / ${0.4*e})`,
              `0 0 ${12*e}px oklch(0.62 0.22 25 / ${0.4*e})`,
            ]
            av.style.borderColor = borderColors[c.idx]
            av.style.boxShadow   = glowColors[c.idx]
          }

          if (el > REVEAL_DUR * 0.5) {
            const reveal = c.el.querySelector('div:last-child') as HTMLElement
            if (reveal) {
              reveal.style.opacity = '1'
              reveal.style.transform = 'translateY(0)'
            }
            if (c.rank === 1) {
              const crown = c.el.querySelector(`#crown-${c.idx}`) as HTMLElement
              if (crown) crown.style.opacity = '1'
            }
          }
        })

        if (el >= REVEAL_DUR) {
          phase = 'done'
          startConfetti()
          onDoneRef.current?.()
          return
        }
      }

      rafRef.current = requestAnimationFrame(runAnim)
    }

    rafRef.current = requestAnimationFrame(runAnim)

    // Confetti
    function startConfetti() {
      if (!canvas) return
      canvas.width  = stage.offsetWidth
      canvas.height = stage.offsetHeight
      const ctx = canvas.getContext('2d')!
      const COLORS = [
        'oklch(0.75 0.18 85)', 'oklch(0.55 0.22 300)',
        'oklch(0.65 0.25 160)', 'oklch(0.60 0.22 25)', '#fff'
      ]
      const pieces = Array.from({ length: 90 }, () => ({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 60,
        w: 5 + Math.random() * 6, h: 3 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        vx: (Math.random() - .5) * 3, vy: 1.5 + Math.random() * 3,
        rot: Math.random() * 360, vrot: (Math.random() - .5) * 8, alpha: 1,
      }))
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        let alive = false
        pieces.forEach(p => {
          p.x += p.vx; p.y += p.vy; p.rot += p.vrot; p.vy += 0.06
          if (p.y > canvas.height - 40) p.alpha -= 0.025
          if (p.alpha > 0) {
            alive = true
            ctx.save()
            ctx.globalAlpha = Math.max(0, p.alpha)
            ctx.translate(p.x, p.y)
            ctx.rotate(p.rot * Math.PI / 180)
            ctx.fillStyle = p.color
            ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h)
            ctx.restore()
          }
        })
        if (alive) confRef.current = requestAnimationFrame(draw)
        else ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      confRef.current = requestAnimationFrame(draw)
    }

  }, [top3])

  useEffect(() => {
    startAnimation()
    return () => {
      if (rafRef.current)  cancelAnimationFrame(rafRef.current)
      if (confRef.current) cancelAnimationFrame(confRef.current)
    }
  }, [startAnimation])

  return (
    <div className="relative w-full flex-1 min-h-0" style={{ minHeight: '320px' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />
      <div
        ref={stageRef}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}
