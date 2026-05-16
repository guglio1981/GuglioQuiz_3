'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'

interface OrderQuestionProps {
  questionText: string
  options: string[]
  correctOrder: string[]
  hasAnswered: boolean
  phase: string
  onSubmit: (answer: string) => void
  isClickable: boolean
  questionIndex: number
}

const stripYear = (s: string) => s.replace(/\s*\(\d{4}\)$/, '')

export function OrderQuestion({
  questionText,
  options,
  correctOrder,
  hasAnswered,
  phase,
  onSubmit,
  isClickable,
  questionIndex,
}: OrderQuestionProps) {
  const [items, setItems] = useState<string[]>([...options])
  const [selected, setSelected] = useState<number | null>(null)
  const revealed = phase === 'reveal'

  useEffect(() => {
    setItems([...options])
    setSelected(null)
  }, [questionIndex])

  const handleTap = (index: number) => {
    if (hasAnswered || !isClickable || revealed) return
    if (selected === null) {
      setSelected(index)
    } else if (selected === index) {
      setSelected(null)
    } else {
      // Swap
      const newItems = [...items]
      ;[newItems[selected], newItems[index]] = [newItems[index], newItems[selected]]
      setItems(newItems)
      setSelected(null)
    }
  }

  const handleConfirm = () => {
    if (hasAnswered || !isClickable) return
    onSubmit(JSON.stringify(items))
  }

  return (
    <div className="space-y-3">
      <Card className="bg-card border-border animate-slide-down">
        <CardContent className="p-6 text-center">
          <p className="text-xl font-semibold text-foreground">{questionText}</p>
          {!revealed && !hasAnswered && (
            <p className="text-xs text-muted-foreground mt-2">
              Tocca due elementi per scambiarli, poi conferma
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(revealed ? correctOrder : items).map((item, i) => {
          const userItem = items[i]
          const isRight = revealed && userItem === correctOrder[i]
          const isWrong = revealed && userItem !== correctOrder[i]
          const isSelected = selected === i

          return (
            <button
              key={i}
              onClick={() => handleTap(i)}
              disabled={hasAnswered || !isClickable || revealed}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                !revealed && !isSelected && 'bg-card border-border hover:border-primary/50 text-foreground',
                !revealed && isSelected && 'bg-primary/20 border-primary text-foreground scale-[1.02]',
                isRight && 'bg-quiz-correct border-quiz-correct text-white',
                isWrong && 'bg-muted border-destructive text-foreground',
              )}
            >
              <span className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                !revealed && !isSelected && 'bg-muted text-muted-foreground',
                !revealed && isSelected && 'bg-primary text-primary-foreground',
                isRight && 'bg-white/20',
                isWrong && 'bg-destructive/20 text-destructive',
              )}>
                {i + 1}
              </span>
              <span className="flex-1">{revealed ? item : stripYear(items[i])}</span>
              {revealed && isRight && <Check className="h-4 w-4 shrink-0" />}
              {revealed && isWrong && <X className="h-4 w-4 text-destructive shrink-0" />}
            </button>
          )
        })}
      </div>

      {!revealed && !hasAnswered && (
        <Button
          onClick={handleConfirm}
          disabled={!isClickable}
          className="w-full h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Conferma ordine
        </Button>
      )}
    </div>
  )
}
