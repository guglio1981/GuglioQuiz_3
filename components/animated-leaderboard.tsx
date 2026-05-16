'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { parseAvatar, type Player } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Trophy, Medal, Award, ArrowRight } from 'lucide-react'
import { AbstentionDots } from '@/components/abstention-dots'
import { Button } from '@/components/ui/button'

interface AnimatedLeaderboardProps {
  players: Player[]
  initialPlayers?: Player[]
  currentPlayerId: string
  questionNumber: number
  totalQuestions: number
  maxAbstentions?: number
  isHost?: boolean
  onContinue?: () => void
  children?: React.ReactNode
}

function easeOutExpo(t: number) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t) }
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
  initialPlayers,
  currentPlayerId,
  questionNumber,
  totalQuestions,
  maxAbstentions,
  isHost,
  onContinue,
  children,
}: AnimatedLeaderboardProps) {
  // "Old" state = scores before this question was processed
  const oldSortedRef = useRef<Player[]>(sortPlayers(initialPlayers ?? players))
  const oldSorted = oldSortedRef.current

  const [displayScores, setDisplayScores] = useState<Record<string, number>>(
    () => Object.fromEntries(oldSorted.map(p => [p.id, p.score]))
  )
  // Rows are rendered in this order; starts with old order, switches to new after count-up
  const [orderedPlayers, setOrderedPlayers] = useState<Player[]>(oldSorted)

  // FLIP refs
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // Set to a snapshot of old positions right before the reorder setState fires
  const flipSnapshot = useRef<Map<string, number> | null>(null)

  const rafRef = useRef<number | null>(null)
  const didAnimRef = useRef(false)

  // ── FLIP: runs synchronously after every DOM commit ──────────────────────
  // If flipSnapshot is set it means a reorder just happened → animate rows
  useLayoutEffect(() => {
    const snap = flipSnapshot.current
    if (!snap) return
    flipSnapshot.current = null

    rowRefs.current.forEach((el, id) => {
      const prevTop = snap.get(id)
      if (prevTop === undefined) return
      const currTop = el.getBoundingClientRect().top
      const delta = prevTop - currTop
      if (Math.abs(delta) < 2) return

      // Invert: jump to old position instantly
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
      // Play: animate to new position (two rAFs to guarantee the browser paints the jump first)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)'
        el.style.transform = ''
      }))
    })
  }) // intentionally no dep array — needs to run after every commit

  // ── Main animation: count-up scores, then FLIP reorder ───────────────────
  useEffect(() => {
    if (didAnimRef.current) return

    const newSorted = sortPlayers(players)
    const oldScores = Object.fromEntries(oldSorted.map(p => [p.id, p.score]))
    const newScores = Object.fromEntries(newSorted.map(p => [p.id, p.score]))

    // Wait until players prop actually has updated scores to animate
    const hasChange = newSorted.some(p => (oldScores[p.id] ?? 0) !== (newScores[p.id] ?? 0))
    if (!hasChange) return

    didAnimRef.current = true

    // Short pause so the screen settles before numbers start moving
    const t1 = setTimeout(() => {
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
          // Numbers done → FLIP rows to new positions
          setDisplayScores(newScores)

          setTimeout(() => {
            // FIRST: snapshot current DOM positions before reorder
            const snap = new Map<string, number>()
            rowRefs.current.forEach((el, id) => snap.set(id, el.getBoundingClientRect().top))
            flipSnapshot.current = snap

            // LAST: reorder DOM → useLayoutEffect will compute deltas and animate
            setOrderedPlayers(newSorted)
          }, 180)
        }
      }

      rafRef.current = requestAnimationFrame(countTick)
    }, 700)

    return () => {
      clearTimeout(t1)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [players]) // re-checks when players update (guard: didAnimRef ensures single run)

  return (
    <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-auto overflow-hidden">
      <div className="text-center px-6 pt-5 pb-3">
        <h2 className="text-2xl font-bold text-foreground">Classifica</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Dopo {questionNumber} di {totalQuestions} domande
        </p>
      </div>

      <div className="px-4 pb-4">
        <div className="space-y-2.5">
          {orderedPlayers.map((player, index) => {
            const safeId = (currentPlayerId ?? '').trim()
            const isMe = safeId.length > 0 && player.id.trim() === safeId
            const score = displayScores[player.id] ?? player.score

            return (
              <div
                key={player.id}
                ref={el => {
                  if (el) rowRefs.current.set(player.id, el)
                  else rowRefs.current.delete(player.id)
                }}
                style={{ height: 72 }}
                className={cn(
                  'flex items-center gap-3 px-4 rounded-xl will-change-transform',
                  isMe
                    ? 'bg-primary/20 border-2 border-primary'
                    : 'bg-muted border-2 border-transparent'
                )}
              >
                {/* Rank */}
                <div className="shrink-0 w-6 flex items-center justify-center">
                  {getRankIcon(index)}
                </div>

                {/* Avatar */}
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                  player.avatar_url ? 'bg-transparent' : (player.avatar ? parseAvatar(player.avatar)?.bg || 'bg-muted' : 'bg-muted'),
                  player.avatar && parseAvatar(player.avatar)?.text
                )}>
                  {player.avatar_url ? (
                    <img src={player.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                  ) : player.avatar ? (
                    <span className={cn(
                      player.avatar.startsWith('initial:') ? 'text-[30px] font-black leading-none' : 'text-[22px]'
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
