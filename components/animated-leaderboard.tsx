'use client'

import { useEffect, useRef, useState } from 'react'
import { parseAvatar, type Player } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Trophy, Medal, Award, ArrowRight } from 'lucide-react'
import { AbstentionDots } from '@/components/abstention-dots'
import { Button } from '@/components/ui/button'

interface AnimatedLeaderboardProps {
  players: Player[]
  currentPlayerId: string
  questionNumber: number
  totalQuestions: number
  maxAbstentions?: number
  isHost?: boolean
  onContinue?: () => void
  children?: React.ReactNode
}

const ROW_H = 72
const GAP   = 10

function easeInOutCubic(t: number) { return t < 0.5 ? 4*t*t*t : (1 - Math.pow(-2*t+2, 3))/2 }
function easeOutExpo(t: number)    { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function sortPlayers(list: Player[]) {
  return [...list].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (a.created || '').localeCompare(b.created || '')
  })
}

function getRankIcon(index: number) {
  switch (index) {
    case 0: return <Trophy className="w-5 h-5 text-yellow-500" />
    case 1: return <Medal  className="w-5 h-5 text-gray-400" />
    case 2: return <Award  className="w-5 h-5 text-amber-600" />
    default:
      return (
        <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">
          {index + 1}
        </span>
      )
  }
}

export function AnimatedLeaderboard({
  players,
  currentPlayerId,
  questionNumber,
  totalQuestions,
  maxAbstentions,
  isHost,
  onContinue,
  children,
}: AnimatedLeaderboardProps) {
  // Snapshot at first render = old scores/order
  const prevRef = useRef<Player[] | null>(null)
  if (prevRef.current === null) {
    prevRef.current = sortPlayers(players)
  }

  const oldSorted = prevRef.current

  // Display state
  const [displayScores, setDisplayScores] = useState<Record<string, number>>(
    () => Object.fromEntries(oldSorted.map(p => [p.id, p.score]))
  )
  const [tops, setTops] = useState<Record<string, number>>(
    () => Object.fromEntries(oldSorted.map((p, i) => [p.id, i * (ROW_H + GAP)]))
  )
  const [orderedPlayers, setOrderedPlayers] = useState<Player[]>(oldSorted)

  const rafRef  = useRef<number | null>(null)
  const prevPlayersRef = useRef(players)

  useEffect(() => {
    if (players === prevPlayersRef.current) return
    prevPlayersRef.current = players

    const newSorted = sortPlayers(players)
    const newTops   = Object.fromEntries(newSorted.map((p, i) => [p.id, i * (ROW_H + GAP)]))
    const oldScores = Object.fromEntries(oldSorted.map(p => [p.id, p.score]))
    const newScores = Object.fromEntries(newSorted.map(p => [p.id, p.score]))

    // Current tops snapshot for reorder animation
    let currentTops = Object.fromEntries(oldSorted.map((p, i) => [p.id, i * (ROW_H + GAP)]))

    function cancelAnim() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }

    // FASE 1: static 800ms, then FASE 2: count up, then FASE 3: reorder

    const t1 = setTimeout(() => {
      // FASE 2 — count up scores
      let start = 0
      const COUNT_DUR = 900

      function countTick(ts: number) {
        if (!start) start = ts
        const t = Math.min((ts - start) / COUNT_DUR, 1)
        const e = easeOutExpo(t)

        const scores: Record<string, number> = {}
        newSorted.forEach(p => {
          scores[p.id] = Math.round(lerp(oldScores[p.id] ?? 0, newScores[p.id], e))
        })
        setDisplayScores(scores)

        if (t < 1) {
          rafRef.current = requestAnimationFrame(countTick)
        } else {
          setDisplayScores(newScores)

          // FASE 3 — reorder rows after short pause
          setTimeout(() => {
            let start2 = 0
            const REORDER_DUR = 700

            function reorderTick(ts: number) {
              if (!start2) start2 = ts
              const t = Math.min((ts - start2) / REORDER_DUR, 1)
              const e = easeInOutCubic(t)

              const newTopsState: Record<string, number> = {}
              newSorted.forEach(p => {
                newTopsState[p.id] = lerp(currentTops[p.id] ?? 0, newTops[p.id], e)
              })
              setTops(newTopsState)

              if (t < 1) {
                rafRef.current = requestAnimationFrame(reorderTick)
              } else {
                setTops(newTops)
                setOrderedPlayers(newSorted)
              }
            }
            rafRef.current = requestAnimationFrame(reorderTick)
          }, 300)
        }
      }
      rafRef.current = requestAnimationFrame(countTick)
    }, 800)

    return () => {
      clearTimeout(t1)
      cancelAnim()
    }
  }, [players])

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const containerH = orderedPlayers.length * (ROW_H + GAP) - GAP

  return (
    <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-auto overflow-hidden">
      <div className="text-center px-6 pt-5 pb-3">
        <h2 className="text-2xl font-bold text-foreground">Classifica</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Dopo {questionNumber} di {totalQuestions} domande
        </p>
      </div>

      <div className="px-4 pb-4">
        {/* Animated rows */}
        <div className="relative" style={{ height: containerH }}>
          {orderedPlayers.map((player, fallbackIdx) => {
            const safeId = (currentPlayerId ?? '').trim()
            const isMe   = safeId.length > 0 && player.id.trim() === safeId
            const score  = displayScores[player.id] ?? player.score
            const rankIdx = orderedPlayers.indexOf(player)

            return (
              <div
                key={player.id}
                className={cn(
                  'absolute left-0 right-0 flex items-center gap-3 px-4 rounded-xl',
                  isMe
                    ? 'bg-primary/20 border-2 border-primary'
                    : 'bg-muted border-2 border-transparent'
                )}
                style={{
                  top: tops[player.id] ?? fallbackIdx * (ROW_H + GAP),
                  height: ROW_H,
                }}
              >
                {/* Rank */}
                <div className="shrink-0 w-6 flex items-center justify-center">
                  {getRankIcon(rankIdx)}
                </div>

                {/* Avatar */}
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                    player.avatar_url
                      ? 'bg-transparent'
                      : player.avatar
                        ? parseAvatar(player.avatar)?.bg || 'bg-muted'
                        : 'bg-muted',
                    player.avatar && parseAvatar(player.avatar)?.text
                  )}
                >
                  {player.avatar_url ? (
                    <img src={player.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                  ) : player.avatar ? (
                    <span className={cn(
                      player.avatar.startsWith('initial:')
                        ? 'text-[30px] font-black leading-none'
                        : 'text-[22px]'
                    )}>
                      {parseAvatar(player.avatar)?.icon}
                    </span>
                  ) : '?'}
                </div>

                {/* Name + abstentions */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground truncate block text-sm">
                    {player.name}
                  </span>
                  {maxAbstentions !== undefined && maxAbstentions > 0 && (
                    <div className="scale-75 origin-left">
                      <AbstentionDots total={maxAbstentions} used={player.abstentions_used || 0} />
                    </div>
                  )}
                </div>

                {/* Score */}
                <div className="text-right shrink-0">
                  <span className={cn(
                    'text-xl font-bold tabular-nums',
                    score >= 0 ? 'text-accent' : 'text-destructive'
                  )}>
                    {score > 0 && '+'}{score.toLocaleString('it-IT')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Buttons / children */}
        {(isHost && onContinue) || children ? (
          <div className="space-y-3 pt-4">
            {isHost && onContinue && (
              <Button
                onClick={onContinue}
                size="lg"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
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
            {children}
          </div>
        ) : (
          !isHost && (
            <p className="text-center text-sm text-muted-foreground pt-4">
              In attesa che l&apos;host continui...
            </p>
          )
        )}
      </div>
    </div>
  )
}
