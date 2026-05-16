'use client'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { VolumeX, Music, Play } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const CLIP_DURATION = 15 // seconds

interface AudioQuestionProps {
  questionText: string
  audioUrl: string | null | undefined
  options: string[]
  selectedAnswer: string | null
  hasAnswered: boolean
  phase: string
  correctAnswer: string
  onSelect: (opt: string) => void
  isClickable: boolean
  audioDisabled: boolean
  questionIndex: number
}

export function AudioQuestion({
  questionText,
  audioUrl,
  options,
  selectedAnswer,
  hasAnswered,
  phase,
  correctAnswer,
  onSelect,
  isClickable,
  audioDisabled,
  questionIndex,
}: AudioQuestionProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [progress, setProgress] = useState(0) // 0-100
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPlayButton, setShowPlayButton] = useState(false)

  useEffect(() => {
    setProgress(0)
    setIsPlaying(false)
    setShowPlayButton(false)
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current)

    if (audioDisabled || !audioUrl || !audioRef.current) return

    const audio = audioRef.current
    audio.currentTime = 0

    const startPlayback = () => {
      stopTimerRef.current = setTimeout(() => {
        audio.pause()
        setIsPlaying(false)
        setProgress(100)
      }, CLIP_DURATION * 1000)
    }

    const playPromise = audio.play()
    if (playPromise) {
      playPromise
        .then(() => {
          setIsPlaying(true)
          setShowPlayButton(false)
          startPlayback()
        })
        .catch(() => {
          // Autoplay blocked (e.g. iOS) — show manual play button
          setShowPlayButton(true)
        })
    }

    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
      audio.pause()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex])

  // Animate progress bar while playing
  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + (100 / (CLIP_DURATION * 10))
        return Math.min(next, 100)
      })
    }, 100)
    return () => clearInterval(interval)
  }, [isPlaying])

  const handleManualPlay = () => {
    if (!audioRef.current) return
    const audio = audioRef.current
    audio.play().then(() => {
      setIsPlaying(true)
      setShowPlayButton(false)
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
      stopTimerRef.current = setTimeout(() => {
        audio.pause()
        setIsPlaying(false)
        setProgress(100)
      }, CLIP_DURATION * 1000)
    }).catch(() => {})
  }

  return (
    <div className="space-y-3">
      <Card className="bg-card border-border animate-slide-down">
        <CardContent className="p-6 text-center space-y-4">
          {audioDisabled || !audioUrl ? (
            <div className="flex flex-col items-center gap-2">
              <VolumeX className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">Audio disabilitato</p>
            </div>
          ) : (
            <>
              <audio ref={audioRef} src={audioUrl} preload="auto" />
              <div className="flex flex-col items-center gap-3">
                {showPlayButton ? (
                  <button
                    onClick={handleManualPlay}
                    className="w-16 h-16 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                  >
                    <Play className="h-8 w-8 text-primary-foreground ml-1" />
                  </button>
                ) : (
                  <div className={cn(
                    'w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center',
                    isPlaying && 'animate-pulse'
                  )}>
                    <Music className="h-8 w-8 text-primary" />
                  </div>
                )}
                {/* Progress bar */}
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-none"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {showPlayButton ? 'Tocca per avviare l\'audio' : isPlaying ? 'In ascolto...' : progress >= 100 ? 'Clip terminata' : 'In caricamento...'}
                </p>
              </div>
            </>
          )}
          <p className="text-xl font-semibold text-foreground">{questionText}</p>
        </CardContent>
      </Card>

      {/* Text options */}
      <div className="grid gap-3">
        {options.map((option, index) => {
          const isSelected = selectedAnswer === option
          const isCorrect = option === correctAnswer
          const showCorrect = phase === 'reveal' && isCorrect
          const showWrong = phase === 'reveal' && isSelected && !isCorrect
          return (
            <button
              key={index}
              onClick={() => onSelect(option)}
              disabled={hasAnswered || !isClickable}
              className={cn(
                'w-full p-4 rounded-xl text-left font-medium transition-all border-2 focus:outline-none text-foreground',
                !hasAnswered && !isSelected && 'bg-muted border-border hover:border-primary/50 hover:bg-muted/80',
                isSelected && phase !== 'reveal' && 'bg-quiz-selected border-quiz-selected text-primary-foreground',
                showCorrect && 'bg-quiz-correct border-quiz-correct text-white animate-pulse-correct',
                showWrong && 'bg-quiz-selected border-quiz-selected text-primary-foreground',
                hasAnswered && !isSelected && !showCorrect && 'bg-muted border-border'
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
