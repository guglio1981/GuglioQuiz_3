'use client'
import { memo, useRef, useLayoutEffect, useEffect, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { parseAvatar, type Player } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Trophy, Medal, Award, ArrowRight } from 'lucide-react'
import { AbstentionDots } from '@/components/abstention-dots'

interface LeaderboardProps {
  players: Player[]
  currentPlayerId: string
  questionNumber: number
  totalQuestions: number
  isHost?: boolean
  maxAbstentions?: number
  previousRanks?: Record<string, number>
  onContinue?: () => void
  children?: React.ReactNode
}

const FLIP_DURATION = 450 // ms — must match transition below

export const Leaderboard = memo(function Leaderboard({
  players,
  currentPlayerId,
  questionNumber,
  totalQuestions,
  isHost = false,
  maxAbstentions,
  previousRanks = {},
  onContinue,
  children,
}: LeaderboardProps) {
  const sortedPlayers = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (a.created || '').localeCompare(b.created || '')
  })

  // Compute trend per player vs previousRanks
  const trends: Record<string, 'up' | 'down' | 'none'> = {}
  const hasPrevious = Object.keys(previousRanks).length > 0
  if (hasPrevious) {
    sortedPlayers.forEach((p, currIdx) => {
      const prevIdx = previousRanks[p.id]
      if (prevIdx === undefined) { trends[p.id] = 'none'; return }
      trends[p.id] = currIdx < prevIdx ? 'up' : currIdx > prevIdx ? 'down' : 'none'
    })
  }

  // Fade-in trends after FLIP animation completes
  const [trendsVisible, setTrendsVisible] = useState(false)
  useEffect(() => {
    setTrendsVisible(false)
    if (!hasPrevious) return
    const t = setTimeout(() => setTrendsVisible(true), FLIP_DURATION + 150)
    return () => clearTimeout(t)
  }, [hasPrevious])

  // FLIP animation — runs after every DOM commit
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevTops = useRef<Map<string, number>>(new Map())

  useLayoutEffect(() => {
    const newTops = new Map<string, number>()
    rowRefs.current.forEach((el, id) => {
      newTops.set(id, el.getBoundingClientRect().top)
    })

    rowRefs.current.forEach((el, id) => {
      const prevTop = prevTops.current.get(id)
      const newTop = newTops.get(id)
      if (prevTop === undefined || newTop === undefined) return
      const delta = prevTop - newTop
      if (Math.abs(delta) < 2) return

      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = `transform ${FLIP_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`
        el.style.transform = ''
      }))
    })

    prevTops.current = newTops
  })

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Trophy className="w-6 h-6 text-yellow-500" />
      case 1: return <Medal className="w-6 h-6 text-gray-400" />
      case 2: return <Award className="w-6 h-6 text-amber-600" />
      default:
        return (
          <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">
            {index + 1}
          </span>
        )
    }
  }

  return (
    <Card className="bg-card border-border w-full max-w-md mx-auto">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold text-foreground">
          Classifica
        </CardTitle>
        <p className="text-muted-foreground">
          Dopo {questionNumber} di {totalQuestions} domande
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedPlayers.map((player, index) => {
          const safeCurrentId = (currentPlayerId ?? '').trim()
          const isCurrentPlayer = safeCurrentId.length > 0 && player.id.trim() === safeCurrentId
          const trend = trends[player.id] ?? 'none'

          return (
            <div
              key={player.id}
              ref={el => {
                if (el) rowRefs.current.set(player.id, el)
                else rowRefs.current.delete(player.id)
              }}
              className={cn(
                'flex items-center gap-4 p-4 rounded-xl will-change-transform',
                isCurrentPlayer
                  ? 'bg-primary/20 border-2 border-primary'
                  : 'bg-muted border-2 border-transparent'
              )}
            >
              {/* Rank */}
              <div className="shrink-0">{getRankIcon(index)}</div>

              {/* Avatar */}
              <div className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center shrink-0',
                player.avatar_url ? 'bg-transparent' : (player.avatar ? parseAvatar(player.avatar)?.bg || 'bg-muted' : 'bg-muted'),
                player.avatar && parseAvatar(player.avatar)?.text
              )}>
                {player.avatar_url ? (
                  <img src={player.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                ) : player.avatar ? (
                  <span className={cn(player.avatar.startsWith('initial:') ? 'text-[38px] font-black leading-none' : 'text-[30px]')}>
                    {parseAvatar(player.avatar)?.icon}
                  </span>
                ) : '?'}
              </div>

              {/* Name and Abstentions */}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="font-semibold text-foreground truncate block">
                  {player.name}
                </span>
                {maxAbstentions !== undefined && maxAbstentions > 0 && (
                  <div className="scale-75 origin-left mt-0.5">
                    <AbstentionDots
                      total={maxAbstentions}
                      used={player.abstentions_used || 0}
                    />
                  </div>
                )}
              </div>

              {/* Trend + Score */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Trend indicator */}
                <span
                  className={cn(
                    'leading-none transition-opacity duration-300',
                    trendsVisible && trend !== 'none' ? 'opacity-100' : 'opacity-0',
                    trend === 'up' ? 'text-green-400 text-[11px] font-black' :
                    trend === 'down' ? 'text-red-400 text-[11px] font-black' :
                    'text-yellow-400 text-[11px] font-black'
                  )}
                >
                  {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '●'}
                </span>
                <span className={cn(
                  'text-xl font-bold tabular-nums',
                  player.score >= 0 ? 'text-accent' : 'text-destructive'
                )}>
                  {player.score > 0 && '+'}{player.score}
                </span>
              </div>
            </div>
          )
        })}

        {isHost && onContinue && (
          <Button
            onClick={onContinue}
            size="lg"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
          >
            <ArrowRight className="mr-2 h-5 w-5" />
            Avanti
          </Button>
        )}
        {!isHost && !children && (
          <p className="text-center text-sm text-muted-foreground pt-2">
            In attesa che l&apos;host continui...
          </p>
        )}
        {children && (
          <div className="space-y-3 pt-2">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
