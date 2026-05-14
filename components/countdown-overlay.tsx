'use client'

import { useEffect, useRef, useState } from 'react'

interface CountdownOverlayProps {
  onDone: () => void
}

const CIRCUMFERENCE = 2 * Math.PI * 90  // ≈ 565.5
const TICK_DUR = 900
const PAUSE    = 100

function easeInCubic(t: number) { return t * t * t }

export function CountdownOverlay({ onDone }: CountdownOverlayProps) {
  const [digit, setDigit]       = useState<number | null>(3)
  const [showGo, setShowGo]     = useState(false)
  const [offset, setOffset]     = useState(0)
  const [color, setColor]       = useState('oklch(0.75 0.18 85)')
  const rafRef     = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const COLORS = ['oklch(0.75 0.18 85)', 'oklch(0.65 0.25 160)', 'oklch(0.60 0.22 25)']

  function cancel() {
    if (rafRef.current)     cancelAnimationFrame(rafRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  function animateDigit(n: number, next: () => void) {
    setDigit(n)
    setShowGo(false)
    setOffset(0)
    setColor(COLORS[3 - n])

    let start = 0
    function tick(ts: number) {
      if (!start) start = ts
      const t = Math.min((ts - start) / TICK_DUR, 1)
      setOffset(easeInCubic(t) * CIRCUMFERENCE)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setOffset(CIRCUMFERENCE)
        timeoutRef.current = setTimeout(next, PAUSE)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    animateDigit(3, () =>
      animateDigit(2, () =>
        animateDigit(1, () => {
          setDigit(null)
          setShowGo(true)
          setOffset(0)
          setColor('oklch(0.65 0.25 160)')
          timeoutRef.current = setTimeout(onDone, 900)
        })
      )
    )
    return cancel
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8"
         style={{ background: 'oklch(0.15 0.02 280)' }}>

      <p className="text-sm font-bold uppercase tracking-widest"
         style={{ color: 'oklch(0.60 0 0)' }}>
        La partita inizia tra
      </p>

      <div className="relative" style={{ width: 200, height: 200 }}>
        {/* Ring */}
        <svg className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}
             viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" fill="none"
                  stroke="oklch(0.28 0.02 280)" strokeWidth="10" />
          <circle cx="100" cy="100" r="90" fill="none"
                  stroke={color} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke 0.2s' }} />
        </svg>

        {/* Digit */}
        <div className="absolute inset-0 flex items-center justify-center">
          {digit !== null && (
            <span key={digit}
                  className="font-black tabular-nums"
                  style={{
                    fontSize: 96, lineHeight: 1,
                    color,
                    animation: 'cdPop 0.25s cubic-bezier(0.34,1.5,0.64,1) forwards',
                  }}>
              {digit}
            </span>
          )}
          {showGo && (
            <span className="font-black"
                  style={{
                    fontSize: 64, lineHeight: 1,
                    color: 'oklch(0.65 0.25 160)',
                    animation: 'cdGo 0.4s cubic-bezier(0.34,1.6,0.64,1) forwards',
                  }}>
              Via!
            </span>
          )}
        </div>
      </div>

      <p className="text-base font-semibold"
         style={{ color: showGo ? 'oklch(0.65 0.25 160)' : 'oklch(0.55 0 0)' }}>
        {showGo ? 'Buona fortuna! 🎉' : 'Preparati!'}
      </p>

      <style>{`
        @keyframes cdPop {
          from { opacity: 0; transform: scale(1.6); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes cdGo {
          from { opacity: 0; transform: scale(0.4); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
