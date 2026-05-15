'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOPIC_LABELS } from '@/lib/types'
import Link from 'next/link'

interface Question {
  topic: string
  question_text: string
  question_type?: string
  options: string[]
  correct_answer: string
  image_url?: string | null
  option_images?: (string | null)[]
  correct_order?: string[]
}

interface GameRecord {
  id: string
  game_number: number
  game_code: string
  played_at: string
  score: number
  total: number
  questions_json: Question[]
  players_json: { name: string; score: number }[]
}

export default function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [record, setRecord] = useState<GameRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const savedUser = localStorage.getItem('guglioquiz_user')
    if (!savedUser) { router.push('/'); return }
    const { id: userId } = JSON.parse(savedUser)
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

  const questions = record.questions_json ?? []
  const date = new Date(record.played_at)

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <Link href="/friends">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">Partita {record.game_number}</p>
            <p className="text-xs text-muted-foreground">
              {date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })} · {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <Link href={`/review/${record.id}`}>
            <Button variant="ghost" size="icon" title="Modalità ripasso">
              <BookOpen className="h-5 w-5" />
            </Button>
          </Link>
        </div>

        {/* All questions stacked */}
        {questions.map((q, qi) => (
          <div key={qi} className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
                {TOPIC_LABELS[q.topic as keyof typeof TOPIC_LABELS] ?? q.topic}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">{qi + 1} / {questions.length}</span>
            </div>

            <Card className="bg-card border-border">
              <CardContent className="p-6">
                {q.question_type === 'audio' && (
                  <div className="flex justify-center mb-3">
                    <span className="text-3xl">🎵</span>
                  </div>
                )}
                {q.image_url && q.question_type !== 'audio' && (
                  <div className="flex justify-center mb-4">
                    <img src={q.image_url} alt="" className="max-h-48 object-contain rounded-lg"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                )}
                <p className="text-xl font-semibold text-foreground text-center text-balance">
                  {q.question_text}
                </p>
              </CardContent>
            </Card>

            {q.question_type === 'image_options' ? (
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, oi) => {
                  const imgUrl = q.option_images?.[oi]
                  const isCorrect = opt === q.correct_answer
                  return (
                    <div key={oi} className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-xl border-2 min-h-[80px]',
                      isCorrect ? 'bg-quiz-correct border-quiz-correct text-white' : 'bg-muted border-border opacity-50'
                    )}>
                      {imgUrl && <img src={imgUrl} alt={opt} className="h-10 w-10 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                      <span className="text-xs font-semibold text-center">{opt}</span>
                    </div>
                  )
                })}
              </div>
            ) : q.question_type === 'order' ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Ordine corretto:</p>
                {(q.correct_order ?? q.options).map((item, oi) => (
                  <div key={oi} className="flex items-center gap-3 p-3 rounded-xl border-2 bg-quiz-correct border-quiz-correct text-white text-sm font-medium">
                    <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">{oi + 1}</span>
                    <span className="flex-1">{item}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className={cn(
                    'w-full p-4 rounded-xl border-2 font-medium text-sm',
                    opt === q.correct_answer
                      ? 'bg-quiz-correct border-quiz-correct text-white'
                      : 'bg-muted border-border text-foreground opacity-50'
                  )}>
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

      </div>
    </main>
  )
}
