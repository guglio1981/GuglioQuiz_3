'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOPIC_LABELS } from '@/lib/types'
import Link from 'next/link'
import { AudioQuestion } from '@/components/audio-question'
import { ImageOptionsQuestion } from '@/components/image-options-question'
import { OrderQuestion } from '@/components/order-question'

interface Question {
  topic: string
  question_text: string
  question_type?: string
  options: string[]
  correct_answer: string
  image_url?: string | null
  audio_url?: string | null
  option_images?: (string | null)[]
  correct_order?: string[]
}

interface GameRecord {
  id: string
  game_number: number
  questions_json: Question[]
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [record, setRecord] = useState<GameRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)
  const [audioDisabled, setAudioDisabled] = useState(false)

  useEffect(() => {
    const savedUser = localStorage.getItem('guglioquiz_user')
    if (!savedUser) { router.push('/'); return }
    const { id: userId } = JSON.parse(savedUser)
    setAudioDisabled(localStorage.getItem('guglioquiz_audio_disabled') === 'true')
    fetch(`/api/game-history?userId=${userId}`)
      .then(r => r.json())
      .then(({ games }) => {
        const found = games.find((g: GameRecord) => g.id === id)
        if (!found) { router.push('/friends'); return }
        setRecord(found)
        setIsLoading(false)
      })
  }, [id, router])

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }
  if (!record) return null

  const questions = record.questions_json
  const q = questions[current]

  const handleSelect = (opt: string) => {
    if (answered) return
    setSelected(opt)
    setAnswered(true)
    if (q.question_type === 'order') {
      // For order questions, opt is JSON.stringify(userOrder); compare against correct_order
      try {
        const userOrder: string[] = JSON.parse(opt)
        const correctOrder = q.correct_order ?? []
        const isCorrect = userOrder.every((item, i) => item === correctOrder[i])
        if (isCorrect) setCorrectCount(c => c + 1)
      } catch { /* not correct */ }
    } else {
      if (opt === q.correct_answer) setCorrectCount(c => c + 1)
    }
  }

  const handleNext = () => {
    if (current + 1 >= questions.length) {
      setFinished(true)
    } else {
      setCurrent(c => c + 1)
      setSelected(null)
      setAnswered(false)
    }
  }

  if (finished) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        <Trophy className="h-16 w-16 text-primary" />
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Ripasso completato!</h1>
          <p className="text-muted-foreground mt-2">
            Hai risposto correttamente a <span className="text-primary font-bold">{correctCount}</span> su <span className="font-bold">{questions.length}</span> domande
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setCurrent(0); setSelected(null); setAnswered(false); setCorrectCount(0); setFinished(false) }}>
            ↺ Ricomincia
          </Button>
          <Link href={`/history/${id}`}>
            <Button><ArrowLeft className="h-4 w-4 mr-2" />Torna alla partita</Button>
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4 gap-4 max-w-lg mx-auto">

      {/* Header */}
      <div className="w-full flex items-center justify-between pt-2">
        <div className="flex items-center gap-1">
          <Link href="/friends">
            <Button variant="ghost" size="icon" title="Elenco partite">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Link href={`/history/${id}`}>
            <Button variant="ghost" size="sm" className="text-muted-foreground text-xs px-2">
              Dettaglio
            </Button>
          </Link>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">{current + 1} / {questions.length}</span>
        <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
          {TOPIC_LABELS[q.topic as keyof typeof TOPIC_LABELS] ?? q.topic}
        </Badge>
      </div>

      {/* Question + options */}
      <div key={current} className="w-full space-y-3">
        {q.question_type === 'audio' ? (
          <AudioQuestion
            questionText={q.question_text}
            audioUrl={q.audio_url}
            options={q.options}
            selectedAnswer={selected}
            hasAnswered={answered}
            phase={answered ? 'reveal' : 'question'}
            correctAnswer={q.correct_answer}
            onSelect={handleSelect}
            isClickable={!answered}
            audioDisabled={audioDisabled}
            questionIndex={current}
          />
        ) : q.question_type === 'image_options' ? (
          <ImageOptionsQuestion
            questionText={q.question_text}
            options={q.options}
            optionImages={q.option_images ?? []}
            selectedAnswer={selected}
            hasAnswered={answered}
            phase={answered ? 'reveal' : 'question'}
            correctAnswer={q.correct_answer}
            onSelect={handleSelect}
            isClickable={!answered}
            questionIndex={current}
          />
        ) : q.question_type === 'order' ? (
          <OrderQuestion
            questionText={q.question_text}
            options={q.options}
            correctOrder={q.correct_order ?? []}
            hasAnswered={answered}
            phase={answered ? 'reveal' : 'question'}
            onSubmit={handleSelect}
            isClickable={!answered}
            questionIndex={current}
          />
        ) : (
          <>
            <Card className="w-full bg-card border-border animate-slide-down">
              <CardContent className="p-6">
                {q.image_url && (
                  <div className="flex justify-center mb-4">
                    <img src={q.image_url} alt="" className="max-h-48 object-contain rounded-lg"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                )}
                <p className="text-xl md:text-2xl font-semibold text-foreground text-center text-balance">
                  {q.question_text}
                </p>
              </CardContent>
            </Card>
            <div className="w-full grid gap-3">
              {q.options.map((opt, i) => {
                const isCorrect = opt === q.correct_answer
                const isSelected = opt === selected
                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(opt)}
                    disabled={answered}
                    style={{ animationDelay: `${i * 150}ms` }}
                    className={cn(
                      'w-full p-4 rounded-xl text-left font-medium border-2 transition-all animate-slide-in-left',
                      !answered && 'bg-muted border-border hover:border-primary/50 text-foreground',
                      answered && isCorrect && 'bg-quiz-correct border-quiz-correct text-white',
                      answered && isSelected && !isCorrect && 'bg-muted border-destructive text-destructive',
                      answered && !isSelected && !isCorrect && 'bg-muted border-border text-foreground opacity-50',
                    )}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Next button */}
      {answered && (
        <Button className="w-full" onClick={handleNext}>
          {current + 1 < questions.length ? 'Prossima →' : '🏆 Vedi risultato'}
        </Button>
      )}

    </main>
  )
}
