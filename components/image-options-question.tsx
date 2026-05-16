'use client'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

interface ImageOptionsQuestionProps {
  questionText: string
  options: string[]
  optionImages: (string | null)[]
  selectedAnswer: string | null
  hasAnswered: boolean
  phase: string
  correctAnswer: string
  onSelect: (opt: string) => void
  isClickable: boolean
  questionIndex: number
  allinAvailable?: boolean
  onAllinSelect?: (opt: string) => void
}

export function ImageOptionsQuestion({
  questionText,
  options,
  optionImages,
  selectedAnswer,
  hasAnswered,
  phase,
  correctAnswer,
  onSelect,
  isClickable,
  allinAvailable = false,
  onAllinSelect,
}: ImageOptionsQuestionProps) {
  return (
    <div className="space-y-3">
      <Card className="bg-card border-border animate-slide-down">
        <CardContent className="p-6 text-center">
          <p className="text-xl font-semibold text-foreground">{questionText}</p>
        </CardContent>
      </Card>

      {/* 2x2 image grid */}
      <div className="grid grid-cols-2 gap-3">
        {options.map((option, index) => {
          const imgUrl = optionImages[index]
          const isSelected = selectedAnswer === option
          const isCorrect = option === correctAnswer
          const showCorrect = phase === 'reveal' && isCorrect
          const showWrong = phase === 'reveal' && isSelected && !isCorrect
          return (
            <div key={option} className="relative">
              <button
                onClick={() => onSelect(option)}
                disabled={hasAnswered || !isClickable}
                className={cn(
                  'w-full flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all min-h-[100px]',
                  !hasAnswered && !isSelected && 'bg-muted border-border hover:border-primary/50',
                  isSelected && phase !== 'reveal' && 'bg-quiz-selected border-quiz-selected',
                  showCorrect && 'bg-quiz-correct border-quiz-correct',
                  showWrong && 'bg-quiz-selected border-quiz-selected',
                  hasAnswered && !isSelected && !showCorrect && 'bg-muted border-border opacity-60'
                )}
              >
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt=""
                    className="h-14 w-14 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span className="text-3xl">🏷️</span>
                )}
              </button>
              {allinAvailable && onAllinSelect && (
                <button
                  onClick={() => onAllinSelect(option)}
                  className="absolute top-1 right-1 w-8 h-8 rounded-lg border-2 border-yellow-500 bg-card text-yellow-400 text-[11px] font-black flex items-center justify-center hover:bg-yellow-500/10 transition-colors focus:outline-none"
                >
                  x2
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
