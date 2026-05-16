'use client'

import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { playTick, playTimeUp } from '@/lib/sounds'

interface QuizTimerProps {
  duration: number // in seconds
  onComplete: () => void
  isActive: boolean
  questionKey?: number // Add a key to reset timer on question change
}

export function QuizTimer({ duration, onComplete, isActive, questionKey = 0 }: QuizTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration)
  const startTimeRef = useRef(Date.now())
  const hasCompletedRef = useRef(false)
  const lastTickRef = useRef(-1) // ultimo secondo in cui abbiamo suonato il tick
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Reset timer when questionKey changes or when timer becomes active
  useEffect(() => {
    setTimeLeft(duration)
    startTimeRef.current = Date.now()
    hasCompletedRef.current = false
    lastTickRef.current = -1
  }, [questionKey, duration])

  useEffect(() => {
    if (!isActive) return
    startTimeRef.current = Date.now()
    hasCompletedRef.current = false

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const remaining = Math.max(0, duration - elapsed)
      setTimeLeft(remaining)

      // Tick una sola volta per secondo (non ogni 100ms)
      if (remaining <= 5 && remaining > 0 && remaining !== lastTickRef.current) {
        lastTickRef.current = remaining
        playTick()
      }

      if (remaining <= 0 && !hasCompletedRef.current) {
        hasCompletedRef.current = true
        clearInterval(interval)
        playTimeUp()
        onCompleteRef.current()
      }
    }, 100)

    return () => clearInterval(interval)
  }, [isActive, duration, questionKey])

  const progress = (timeLeft / duration) * 100
  const circumference = 2 * Math.PI * 45 // radius = 45
  const strokeDashoffset = circumference * (1 - progress / 100)

  const getColor = () => {
    if (timeLeft <= 3) return 'text-destructive'
    if (timeLeft <= 5) return 'text-chart-5'
    return 'text-primary'
  }

  return (
    <div className="relative w-24 h-24">
      {/* Background circle */}
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="48"
          cy="48"
          r="45"
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
          className="text-muted"
        />
        <circle
          cx="48"
          cy="48"
          r="45"
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          className={cn('transition-all duration-100', getColor())}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
        />
      </svg>

      {/* Time display */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'text-3xl font-bold tabular-nums',
            getColor(),
            timeLeft <= 3 && 'animate-pulse'
          )}
        >
          {timeLeft}
        </span>
      </div>
    </div>
  )
}
