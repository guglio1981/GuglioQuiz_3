'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { QuizTimer } from '@/components/quiz-timer'
import { AbstentionDots } from '@/components/abstention-dots'
import { Leaderboard } from '@/components/leaderboard'
import { 
  getGameByCode,
  getPlayers,
  getQuestions,
  saveQuestions,
  submitAnswerV3,
  getAnswersForQuestion,
  processAnswers,
  subscribeToGame,
  subscribeToPlayers,
  subscribeToAnswers,
  unsubscribe,
  updateGameStatus,
  updateGamePhase,
  advanceToNextQuestion,
  updateGamePhaseAndSync,
  resetGameForNewManche,
  resetPlayersForNewManche,
  rematchGame,
  rematchGameDirect,
  saveSoloResult,
  getSoloResults,
  syncLeaderboardPhase,
  clearGameSettingsForNewManche,
  clearAnswersForGame,
  submitArcadeResult,
  getArcadeResults,
  processArcadeResults,
  subscribeToArcadeResults,
  setCurrentArcadeGameInDb,
  clearCurrentArcadeGame,
  getPlayerStatsForGame,
  updatePlayerScore,
  type ArcadeResult,
  type PlayerStat,
} from '@/lib/game-store'
import {
  TOPIC_LABELS,
  parseAvatar,
  AVATAR_COLORS,
  AVATAR_ICONS,
  SCORING,
  ARCADE_GAME_LABELS,
  calculateCorrectPoints,
  calculateWrongPoints,
  type Game,
  type Player,
  type Question,
  type Answer,
  type AvatarId,
  type ArcadeGame,
  type SoloResult,
  isUntimedGame,
  isAllinGame,
} from '@/lib/types'
import { ArcadeGameWrapper } from '@/components/arcade/arcade-game-wrapper'
import { AudioQuestion } from '@/components/audio-question'
import { ImageOptionsQuestion } from '@/components/image-options-question'
import { OrderQuestion } from '@/components/order-question'
import { CountdownOverlay } from '@/components/countdown-overlay'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { initAudioContext, playCorrect, playWrong, playAbstain, startBgMusic, stopBgMusic } from '@/lib/sounds'
import { downloadQuizPDF } from '@/lib/generate-quiz-pdf'
import { RotateCcw, Home, Loader2, HandHelping, FileDown, RefreshCw, Clock, HelpCircle, Globe, Gamepad2, TimerOff, Target, Timer, Trophy, UserRound, Music2 } from 'lucide-react'


type GamePhase = 'loading' | 'question' | 'reveal' | 'leaderboard' | 'arcade' | 'arcade_results' | 'finished'

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()

  // State
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playersBeforeScoring, setPlayersBeforeScoring] = useState<Player[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null)
  const [phase, setPhase] = useState<GamePhase>('loading')
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [questionStartTime, setQuestionStartTime] = useState<number>(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [questionScore, setQuestionScore] = useState<number | null>(null)
  const [myResponseTime, setMyResponseTime] = useState<number | null>(null)
  
  // Arcade state
  const [arcadeRound, setArcadeRound] = useState(0)
  const [currentArcadeGame, setCurrentArcadeGame] = useState<ArcadeGame | null>(null)
  const [arcadeResults, setArcadeResults] = useState<ArcadeResult[]>([])
  const [hasCompletedArcade, setHasCompletedArcade] = useState(false)
  const [lastManche, setLastManche] = useState(0)
  const [isClickable, setIsClickable] = useState(false) // Previene click accidentali su iOS
  const [isKeepingScores, setIsKeepingScores] = useState(false)
  const [isResettingScores, setIsResettingScores] = useState(false)
  const [isStartingRematch, setIsStartingRematch] = useState(false)
  const [showRematchPopup, setShowRematchPopup] = useState(false)
  const [soloHistory, setSoloHistory] = useState<SoloResult[]>([])
  const [soloResultSaved, setSoloResultSaved] = useState(false)
  const [gameHistorySaved, setGameHistorySaved] = useState(false)
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStat>>({})
  const soloStatsRef = useRef({ correctCount: 0, totalTimeMs: 0, answeredCount: 0 })
  const [showCountdown, setShowCountdown] = useState(false)
  const [isRedirectingToLobby, setIsRedirectingToLobby] = useState(false)
  const [isAnimatingReset, setIsAnimatingReset] = useState(false)
  const [hostDisconnected, setHostDisconnected] = useState(false)
  const [audioDisabled, setAudioDisabled] = useState(false)
  const [musicEnabled, setMusicEnabled] = useState(false)
  // All-in: which 5-question window was the joker last used (-1 = never)
  const [allinUsedWindow, setAllinUsedWindow] = useState(-1)
  const [allinActive, setAllinActive] = useState(false)
  const [previousLeaderboardRanks, setPreviousLeaderboardRanks] = useState<Record<string, number>>({})
  const savedLeaderboardRanksRef = useRef<Record<string, number>>({})
  const leaderboardSnappedRef = useRef(false)

  // Memoize player calculations to avoid expensive filter/find on every render
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (a.created || '').localeCompare(b.created || '')
    })
  }, [players])

  const currentPlayer = useMemo(() => {
    return players.find((p) => p.id === currentPlayerId)
  }, [players, currentPlayerId])

  const isHost = useMemo(() => {
    return currentPlayer?.is_host || false
  }, [currentPlayer])

  // Gestione del ritardo di sicurezza per i click
  useEffect(() => {
    if (phase === 'question') {
      setIsClickable(false)
      const timer = setTimeout(() => {
        setIsClickable(true)
      }, 600) // 600ms di sicurezza prima di poter cliccare
      return () => clearTimeout(timer)
    }
  }, [phase, currentQuestionIndex])

  // Sound effects on phase change
  useEffect(() => {
    if (phase === 'reveal') {
      const correct = questions[currentQuestionIndex]?.correct_answer
      if (!selectedAnswer) playAbstain()
      else if (selectedAnswer === correct) playCorrect()
      else playWrong()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Guard ref to prevent handleReveal from being called multiple times
  const isRevealingRef = useRef(false)

  // Ref that always holds the latest state — updated on every render.
  // This lets useCallback / subscription callbacks read fresh values
  // without needing those values in their dependency arrays.
  const latestRef = useRef({
    selectedAnswer: null as string | null,
    myResponseTime: null as number | null,
    answers: [] as Answer[],
    currentPlayerId: null as string | null,
    currentQuestionIndex: 0,
    players: [] as Player[],
    phase: 'loading' as GamePhase,
    isHost: false,
    game: null as Game | null,
    questions: [] as Question[],
    allinActive: false,
  })
  // Sync on every render (no useEffect needed — this runs synchronously)
  latestRef.current = {
    selectedAnswer, myResponseTime, answers, currentPlayerId,
    currentQuestionIndex, players, phase, isHost:
      players.find(p => p.id === currentPlayerId)?.is_host || false,
    game, questions, allinActive,
  }

  // Reset arcade state when manche changes (new manche started)
  useEffect(() => {
    if (!game) return

    if (game.manche !== lastManche && lastManche !== 0) {
      // New manche detected - reset ALL arcade state and phase
      setLastManche(game.manche)
      setArcadeRound(0)
      setCurrentArcadeGame(null)
      setArcadeResults([])
      setHasCompletedArcade(false)
      // If stuck in arcade phase from previous manche, go back to loading
      setPhase('loading')
    } else if (lastManche === 0 && game.manche > 0) {
      // Initial load - just record current manche
      setLastManche(game.manche)
    }
  }, [game, lastManche])

  // Sync arcade game from database (for non-host clients)
  useEffect(() => {
    if (!game) return

    // Check if host has set an arcade game in the database
    const dbArcadeGame = game.current_arcade_game
    const dbArcadeRound = game.current_arcade_round || 0

    if (dbArcadeGame && dbArcadeRound > arcadeRound) {
      // New arcade game set by host
      setCurrentArcadeGame(dbArcadeGame)
      setArcadeRound(dbArcadeRound)
      setHasCompletedArcade(false)
      setArcadeResults([])
      setPhase('arcade')
      isRevealingRef.current = false
    }
  }, [game, arcadeRound])

  const currentQuestion = questions[currentQuestionIndex]

  // Load initial data
  useEffect(() => {
    // Check if we're in browser
    if (typeof window === 'undefined') return
    
    const playerId = sessionStorage.getItem('guglioquiz_playerId')
    if (!playerId) {
      toast.error('Sessione scaduta, torna alla home')
      router.push('/')
      return
    }
    setCurrentPlayerId(playerId)
    setAudioDisabled(localStorage.getItem('guglioquiz_audio_disabled') === 'true')
    setMusicEnabled(localStorage.getItem('guglioquiz_music_enabled') === 'true')

    const loadGame = async () => {
      // Add retry logic for page navigation/reload scenarios
      let retries = 5
      let gameData = null
      
      while (retries > 0 && !gameData) {
        gameData = await getGameByCode(code)
        if (!gameData) {
          retries--
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 800))
          }
        }
      }
      
      if (!gameData) {
        toast.error('Partita non trovata')
        router.push('/')
        return
      }
      setGame(gameData)

      // Retry getting players to handle temporary network issues
      let playerRetries = 3
      let playersData: typeof players = []
      let currentPlayerData = null
      
      while (playerRetries > 0 && !currentPlayerData) {
        playersData = await getPlayers(gameData.id)
        currentPlayerData = playersData.find((p) => p.id === playerId)
        if (!currentPlayerData) {
          playerRetries--
          if (playerRetries > 0) {
            await new Promise(resolve => setTimeout(resolve, 600))
          }
        }
      }
      
      setPlayers(playersData)
      
      if (!currentPlayerData) {
        toast.error('Non sei in questa partita')
        router.push('/')
        return
      }

      // Check if questions already exist — use questions_json from gameData directly
      // to avoid an extra API round-trip and race conditions
      let questionsData: typeof questions = (
        gameData.questions_json &&
        Array.isArray(gameData.questions_json) &&
        (gameData.questions_json as any[]).length > 0
      ) ? (gameData.questions_json as any) : await getQuestions(gameData.id)
      
      if (questionsData.length === 0 && currentPlayerData?.is_host) {
        setIsGenerating(true)
        // Broadcast progress to clients via phase="generating:XX" — no extra DB field needed
        let lastBroadcastedPct = -10
        const broadcastProgress = (pct: number) => {
          const rounded = Math.min(99, Math.round(pct))
          if (rounded - lastBroadcastedPct >= 8) {
            lastBroadcastedPct = rounded
            updateGamePhase(gameData.id, `generating:${rounded}`).catch(console.error)
          }
        }
        broadcastProgress(0) // fires immediately: 0 - (-10) = 10 >= 8
        try {
          const usedHashesKey = 'guglioquiz_used_question_hashes'
          const usedTextsKey = 'guglioquiz_used_question_texts'
          const storedHashes = localStorage.getItem(usedHashesKey)
          const storedTexts = localStorage.getItem(usedTextsKey)
          let usedQuestionHashes: string[] = storedHashes ? JSON.parse(storedHashes) : []
          const usedQuestionTexts: string[] = storedTexts ? JSON.parse(storedTexts) : []

          // Se l'utente è loggato, arricchisci con gli hash dal DB (deduplicazione tra sessioni)
          const _sessionUserId = sessionStorage.getItem('guglioquiz_userId')
          if (_sessionUserId) {
            try {
              const _histRes = await fetch(`/api/question-history?userId=${_sessionUserId}`)
              const _histData = await _histRes.json()
              usedQuestionHashes = [...new Set([...usedQuestionHashes, ...(_histData.hashes || [])])]
            } catch { /* usa solo localStorage se il DB non risponde */ }
          }

          const totalRequested = gameData.question_count || 10
          // Generate extra buffer to cover broken images.
          // Image-heavy topics (logo/flag/year) discard the whole question on broken image
          // → add a flat +10 spare. Other topics: decorative image removed but question kept
          // → smaller +4 buffer is enough.
          const imageTopics = ['indovina_logo', 'indovina_bandiera', 'indovina_anno']
          const hasImageTopics = (gameData.topics as string[]).some(t => imageTopics.includes(t))
          const buffer = hasImageTopics ? 10 : 4
          const totalToGenerate = totalRequested + buffer
          const chunkSize = 5
          const numChunks = Math.ceil(totalToGenerate / chunkSize)

          // Run all chunks in PARALLEL — much faster than sequential
          setGenerationProgress(0)
          let chunksCompleted = 0
          const chunkResults = await Promise.all(
            Array.from({ length: numChunks }, (_, i) => {
              const countForThisChunk = Math.min(chunkSize, totalToGenerate - i * chunkSize)
              if (countForThisChunk <= 0) return Promise.resolve({ questions: [], hashes: [] })
              return fetch('/api/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  topics: gameData.topics,
                  count: countForThisChunk,
                  difficulty: gameData.difficulty,
                  usedQuestionHashes: usedQuestionHashes.slice(-1000),
                  usedQuestionTexts: usedQuestionTexts.slice(-30),
                  enableAudioQuestions: sessionStorage.getItem('guglioquiz_hostAudioEnabled') === 'true'
                    && sessionStorage.getItem('guglioquiz_audioOk') !== 'false',
                }),
              }).then(async (res) => {
                const text = await res.text()
                let data: any
                try { data = JSON.parse(text) } catch { return { questions: [], hashes: [] } }
                if (!res.ok) return { questions: [], hashes: [] }
                chunksCompleted++
                const pct = Math.round((chunksCompleted / numChunks) * 65)
                setGenerationProgress(pct)
                broadcastProgress(pct)
                return { questions: data.questions || [], hashes: data.hashes || [] }
              })
            })
          )

          const allQuestionsRaw = chunkResults.flatMap(r => r.questions)
          // Deduplicate across parallel chunks (each chunk doesn't know about others)
          const seenTexts = new Set<string>()
          const allQuestions = allQuestionsRaw.filter((q: any) => {
            const key = (q.question_text as string).trim().toLowerCase()
            if (seenTexts.has(key)) return false
            seenTexts.add(key)
            return true
          })
          const allHashes = chunkResults.flatMap(r => r.hashes)

          if (allQuestions.length === 0) throw new Error('No questions generated')

          // Pre-validate image URLs in parallel — 4s timeout per image
          const validateImageUrl = (url: string): Promise<boolean> =>
            new Promise((resolve) => {
              const img = new window.Image()
              const timer = setTimeout(() => { img.src = ''; resolve(false) }, 4000)
              img.onload = () => { clearTimeout(timer); resolve(true) }
              img.onerror = () => { clearTimeout(timer); resolve(false) }
              img.src = url
            })

          let imagesValidated = 0
          const totalToValidate = allQuestions.length
          const validationResults = await Promise.all(
            allQuestions.map(async (q: any) => {
              if (!q.image_url) {
                imagesValidated++
                const pct = 65 + Math.round((imagesValidated / totalToValidate) * 30)
                setGenerationProgress(pct)
                broadcastProgress(pct)
                return q      // text question — always keep
              }
              const ok = await validateImageUrl(q.image_url)
              imagesValidated++
              const pct = 65 + Math.round((imagesValidated / totalToValidate) * 30)
              setGenerationProgress(pct)
              broadcastProgress(pct)
              if (ok) return q
              // Image-based topics (logo/flag/year): image IS the question → discard
              const imageTopics = ['indovina_logo', 'indovina_bandiera', 'indovina_anno']
              if (imageTopics.includes(q.topic)) return null
              // Other topics: image is decorative → keep without image
              return { ...q, image_url: null }
            })
          )
          // Filter out broken-image questions, then cap at requested count
          let validatedQuestions = validationResults.filter(Boolean).slice(0, totalRequested)

          // Retry: if buffer wasn't enough (AI returned fewer than asked), generate the missing count
          if (validatedQuestions.length < totalRequested) {
            const missing = totalRequested - validatedQuestions.length
            console.warn(`[Quiz] Only ${validatedQuestions.length}/${totalRequested} questions — retrying ${missing} more`)
            try {
              const retryText = await fetch('/api/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  topics: gameData.topics,
                  count: missing + 2, // small extra buffer on retry
                  difficulty: gameData.difficulty,
                  usedQuestionHashes: usedQuestionHashes.slice(-30),
                  usedQuestionTexts: usedQuestionTexts.slice(-30),
                }),
              }).then(r => r.text())
              const retryData = (() => { try { return JSON.parse(retryText) } catch { return { questions: [] } } })()
              const retryQs: any[] = retryData.questions || []
              // Validate images for retry questions too
              const retryValidated = await Promise.all(retryQs.map(async (q: any) => {
                if (!q.image_url) return q
                const ok = await validateImageUrl(q.image_url)
                if (ok) return q
                const imgTopics = ['indovina_logo', 'indovina_bandiera', 'indovina_anno']
                return imgTopics.includes(q.topic) ? null : { ...q, image_url: null }
              }))
              const retryFiltered = retryValidated.filter(Boolean)
              validatedQuestions = [...validatedQuestions, ...retryFiltered].slice(0, totalRequested)
            } catch (e) {
              console.error('[Quiz] Retry generation failed:', e)
            }
          }

          // Save new hashes and texts to localStorage
          const allTexts = allQuestions.map((q: any) => q.question_text as string)
          const trimmedHashes = [...usedQuestionHashes, ...allHashes].slice(-1000)
          localStorage.setItem(usedHashesKey, JSON.stringify(trimmedHashes))
          const trimmedTexts = [...usedQuestionTexts, ...allTexts].slice(-200)
          localStorage.setItem(usedTextsKey, JSON.stringify(trimmedTexts))

          // Se loggato, salva anche su DB per deduplicazione tra sessioni
          if (_sessionUserId && allHashes.length > 0) {
            fetch('/api/question-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: _sessionUserId, hashes: allHashes }),
            }).catch(() => {}) // fire-and-forget
          }

          questionsData = await saveQuestions(gameData.id, validatedQuestions, gameData.manche || 1)

          // After generation, directly initialize game for the host — don't wait for SSE
          // because gameData.questions_ready is stale (was false when loadGame started).
          setGenerationProgress(100)
          setIsGenerating(false)
          setQuestions(questionsData)
          setCurrentQuestionIndex(0)
          setPhase('question')
          setShowCountdown(true)
          setIsTimerActive(false)
          setQuestionStartTime(Date.now())
          // Broadcast phase=question to DB so clients receive it via subscribeToGame SSE
          updateGamePhase(gameData.id, 'question').catch(console.error)
          return
        } catch (err) {
          toast.error(`Errore: ${err instanceof Error ? err.message : 'Generazione domande fallita'}`)
          router.push('/')
          return
        }
      }

      // If we have questions AND they are ready, start the game
      if (questionsData.length > 0 && gameData.questions_ready) {
        setQuestions(questionsData)

        // Use phase from DB if it exists, otherwise default to question if host is starting
        const hostNow = currentPlayerData?.is_host || false
        const initialPhase = (gameData.phase as GamePhase) || (hostNow ? 'question' : 'loading')

        // For clients that load AFTER questions_ready is already set: sync to host's current
        // question index so they don't get stuck showing Q0 while host is already ahead.
        // (The questions_ready useEffect won't run because questions.length > 0 after setQuestions)
        if (!hostNow && gameData.current_question > 0) {
          setCurrentQuestionIndex(gameData.current_question - 1)
        }

        setPhase(initialPhase)

        if (hostNow && !gameData.phase) {
          updateGamePhase(gameData.id, 'question').catch(console.error)
        }

        if (initialPhase === 'question' || initialPhase === 'reveal') {
          const qIdx = gameData.current_question > 0 ? gameData.current_question - 1 : 0
          if (!hostNow && initialPhase === 'question' && qIdx === 0) {
            setShowCountdown(true)
            setIsTimerActive(false)
          } else {
            setIsTimerActive(initialPhase === 'question')
          }
          setQuestionStartTime(Date.now())
        }
      }
    }

    loadGame()
  }, [code, router])

  // Wait for questions to be ready (for non-host clients)
  useEffect(() => {
    if (!game?.id || questions.length > 0) return
    if (!game.questions_ready) return

    const hostNow = latestRef.current.isHost

    getQuestions(game.id).then(qs => {
      if (qs.length === 0) return
      setQuestions(qs)
      // Sync to host's current question index (default 0 = first question)
      const hostIdx = game.current_question > 0 ? game.current_question - 1 : 0
      setCurrentQuestionIndex(hostIdx)
      // Use the LATEST game phase from latestRef (not the stale closure 'game'),
      // because an SSE with phase='question' might have arrived while getQuestions() was in-flight
      // and was skipped (questions not yet loaded). 'generating' is transient → treat as 'question'.
      const latestDbPhase = (latestRef.current.game?.phase as string) || ''
      const targetPhase: GamePhase = (latestDbPhase && latestDbPhase !== 'loading' && !latestDbPhase.startsWith('generating'))
        ? latestDbPhase as GamePhase
        : 'question'
      setPhase(targetPhase)
      if (targetPhase === 'question') {
        if (!hostNow && hostIdx === 0) {
          setShowCountdown(true)
          setIsTimerActive(false)
        } else {
          setIsTimerActive(true)
        }
        setQuestionStartTime(Date.now())
        // HOST: broadcast phase=question to DB so clients that load AFTER questions_ready
        // was set can still receive the phase update via subscribeToGame and start their timer
        if (hostNow) {
          updateGamePhase(game.id, 'question').catch(console.error)
        }
      }
    })
  }, [game?.id, game?.questions_ready, questions.length])

// Remove player when browser closes
  useEffect(() => {
    if (!currentPlayerId) return

    const handleBeforeUnload = () => {
      // Don't remove player if we're redirecting to lobby for new manche
      if (sessionStorage.getItem('guglioquiz_redirecting') === 'true') {
        sessionStorage.removeItem('guglioquiz_redirecting')
        return
      }
      // Use sendBeacon for reliable delivery on page close
      const url = `/api/remove-player?playerId=${currentPlayerId}`
      navigator.sendBeacon(url)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [currentPlayerId])

  // Subscribe to realtime updates
  // IMPORTANT: deps use game?.id (not game object) to avoid re-subscribing on every game state change.
  // Callback reads from latestRef to always get fresh values.
  const gameIdForSub = game?.id
  const gameCodeForSub = game?.code
  useEffect(() => {
    if (!gameIdForSub) return

    const gameChannel = subscribeToGame(gameIdForSub, (updatedGame) => {
      setGame(prev => {
        // Deep compare to avoid unnecessary re-renders
        if (prev && JSON.stringify(prev) === JSON.stringify(updatedGame)) return prev
        return updatedGame
      })
      
      const { isHost: latestIsHost, currentQuestionIndex: latestQIdx, questions: latestQuestions } = latestRef.current
      
      // If host broadcast 'resetting' or 'keeping', show GQ screen immediately on client
      if (!latestIsHost) {
        const tsm = (updatedGame as any).topic_selection_mode
        if (tsm === 'resetting') setIsResettingScores(true)
        else if (tsm === 'keeping') setIsKeepingScores(true)
      }

      // Host ha avviato rivincita: mostra popup ai client
      if (!latestIsHost && updatedGame.phase === 'rematch_pending') {
        setShowRematchPopup(true)
      }

      // Rivincita diretta: client ricarica /game senza passare dalla lobby
      if (!latestIsHost && updatedGame.phase === 'rematch_direct') {
        sessionStorage.setItem('guglioquiz_redirecting', 'true')
        setTimeout(() => { window.location.href = `/game/${updatedGame.code}` }, 50)
        return
      }

      // If game status changed to lobby, show GQ screen immediately then redirect
      if (updatedGame.status === 'lobby' && !latestIsHost) {
        sessionStorage.setItem('guglioquiz_redirecting', 'true')
        setIsRedirectingToLobby(true)
        setTimeout(() => { window.location.href = `/lobby/${updatedGame.code}` }, 50)
        return
      }
      
      // Sync question index with host's current_question (for non-host players)
      if (!latestIsHost && updatedGame.current_question > 0) {
        const serverQuestionIndex = updatedGame.current_question - 1
        if (serverQuestionIndex !== latestQIdx && serverQuestionIndex < latestQuestions.length) {
          setCurrentQuestionIndex(serverQuestionIndex)
          setSelectedAnswer(null)
          setHasAnswered(false)
          setAnswers([])
          setPhase('question')
          if (serverQuestionIndex === 0) {
            setShowCountdown(true)
            setIsTimerActive(false)
          } else {
            setIsTimerActive(true)
          }
          setQuestionStartTime(Date.now())
          setQuestionScore(null)
          setMyResponseTime(null)
          setAllinActive(false)
          isRevealingRef.current = false
        }
      }

      // Sync phase (for non-host players)
      if (!latestIsHost && updatedGame.phase && updatedGame.phase !== latestRef.current.phase) {
        const rawPhase = updatedGame.phase as string
        const newPhase = rawPhase as GamePhase

        // Extract real progress from "generating:XX" broadcast by host
        if (rawPhase.startsWith('generating')) {
          const pct = rawPhase.includes(':') ? parseInt(rawPhase.split(':')[1]) : 0
          if (!isNaN(pct)) setGenerationProgress(pct)
          // Keep clients on loading/generating — don't change phase
        } else if (newPhase === 'question' && latestQuestions.length === 0) {
          // questions_ready useEffect will fire shortly and load questions + set phase
        } else {
          setPhase(newPhase)
        }

        // Handle specific logic when entering a phase
        if (newPhase === 'question' && latestQuestions.length > 0) {
          isRevealingRef.current = false
          setIsTimerActive(true)
          setQuestionStartTime(Date.now())
          setHasAnswered(false)
          setSelectedAnswer(null)
          setAnswers([])
        } else if (newPhase === 'reveal') {
          // Guard against truly stale SSEs (e.g. Q4 reveal arriving after Q5 question).
          // Allow reveals for the current question OR one ahead (latestRef may lag by 1
          // render if question+reveal SSEs arrive back-to-back before React flushes).
          const eventQIdx = (updatedGame.current_question || 1) - 1
          const currentIdx = latestRef.current.currentQuestionIndex
          if (eventQIdx === currentIdx) {
            setIsTimerActive(false)
            setPlayersBeforeScoring(latestRef.current.players)
            handleReveal()
          } else if (eventQIdx === currentIdx + 1) {
            // Ref is one render behind — wait for React to flush the question
            // index state update before handleReveal reads latestRef.current
            setTimeout(() => {
              setIsTimerActive(false)
              handleReveal()
            }, 150)
          }
          // eventQIdx < currentIdx: stale event, discard
        }
      }

    })
    const playersChannel = subscribeToPlayers(gameIdForSub, (updatedPlayers) => {
      setPlayers(prev => {
        if (prev && JSON.stringify(prev) === JSON.stringify(updatedPlayers)) return prev
        return updatedPlayers
      })
      // Detect host disconnection (non-host clients only)
      if (!latestRef.current.isHost && updatedPlayers.length > 0) {
        const hostStillPresent = updatedPlayers.some(p => p.is_host)
        if (!hostStillPresent) {
          setHostDisconnected(true)
          setTimeout(() => {
            sessionStorage.clear()
            window.location.href = '/'
          }, 3000)
        }
      }
    })

    // PWA/mobile: force refresh when app comes back to foreground or goes back online
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      if (sessionStorage.getItem('guglioquiz_redirecting') === 'true') return

      const [updatedGame, updatedPlayers] = await Promise.all([
        getGameByCode(code),
        getPlayers(gameIdForSub),
      ])

      if (updatedPlayers.length > 0) {
        setPlayers(updatedPlayers)
        // Check host presence on return — catches tab-close that sendBeacon missed
        if (!latestRef.current.isHost && !updatedPlayers.some(p => p.is_host)) {
          setHostDisconnected(true)
          setTimeout(() => { sessionStorage.clear(); window.location.href = '/' }, 3000)
          return
        }
      }

      if (!updatedGame) return
      setGame(updatedGame)

      if (updatedGame.status === 'lobby' && !latestRef.current.isHost) {
        sessionStorage.setItem('guglioquiz_redirecting', 'true')
        setIsRedirectingToLobby(true)
        setTimeout(() => { window.location.href = `/lobby/${updatedGame.code}` }, 50)
        return
      }

      // Sync phase and question index from server — player may have missed events while away
      if (!latestRef.current.isHost && updatedGame.phase) {
        const serverPhase = updatedGame.phase as GamePhase
        const serverIdx = updatedGame.current_question > 0 ? updatedGame.current_question - 1 : 0

        setPhase(serverPhase)
        if (serverIdx !== latestRef.current.currentQuestionIndex) {
          setCurrentQuestionIndex(serverIdx)
          setSelectedAnswer(null)
          setHasAnswered(false)
          setAnswers([])
          setQuestionScore(null)
          setMyResponseTime(null)
          isRevealingRef.current = false
        }
        if (serverPhase === 'question') {
          setIsTimerActive(true)
          setQuestionStartTime(Date.now())
        } else {
          setIsTimerActive(false)
        }
      }
    }
    
    const handleOnline = () => {
      // Quando ritorna la connessione di rete (es. switch WiFi -> 4G) forziamo un aggiornamento
      handleVisibilityChange()
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      unsubscribe(gameChannel)
      unsubscribe(playersChannel)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [gameIdForSub, code])

  // Subscribe to answers for current question
  useEffect(() => {
    if (!currentQuestion?.id || phase !== 'question') return

    const sub = subscribeToAnswers(currentQuestion.id, (freshAnswers) => {
      setAnswers(freshAnswers)
    })

    return () => {
      unsubscribe(sub)
    }
  }, [currentQuestion?.id, phase])



  const handleAnswerSelect = useCallback(
    async (answer: string) => {
      if (hasAnswered || !currentQuestion || !currentPlayerId) return
      initAudioContext()

      const responseTime = Date.now() - questionStartTime

      setSelectedAnswer(answer)
      setHasAnswered(true)
      setIsTimerActive(false)
      setMyResponseTime(responseTime)

      await submitAnswerV3(
        currentQuestion.id,
        currentPlayerId,
        answer,
        false,
        responseTime
      )
    },
    [hasAnswered, currentQuestion, currentPlayerId, questionStartTime]
  )

  const handleTimeUp = useCallback(async () => {
    if (hasAnswered || !currentQuestion || !currentPlayerId || !currentPlayer || !game) return

    setHasAnswered(true)
    setIsTimerActive(false)
    setMyResponseTime(SCORING.TIME_LIMIT_MS)

    // Check if this counts as abstention or wrong answer
    const isAbstention = (currentPlayer?.abstentions_used ?? 0) < game.max_abstentions

    await submitAnswerV3(
      currentQuestion.id,
      currentPlayerId,
      "", // Usa stringa vuota per evitare errori del database
      isAbstention,
      SCORING.TIME_LIMIT_MS
    )
  }, [hasAnswered, currentQuestion, currentPlayerId, currentPlayer, game])

  const handleManualAbstain = async () => {
    if (phase !== 'question' || hasAnswered || !isClickable || !currentQuestion || !currentPlayer || !game) return
    
    // Check if player can abstain
    if (currentPlayer.abstentions_used >= game.max_abstentions) {
      toast.error('Hai esaurito le astensioni!')
      return
    }

    setHasAnswered(true)
    setSelectedAnswer(null)
    setMyResponseTime(0)

    try {
      await submitAnswerV3(
        currentQuestion!.id,
        currentPlayer.id,
        "", // Passiamo una stringa vuota invece di null
        true, // is_abstention
        0
      )
    } catch (error) {
      console.error('Error submitting manual abstention:', error)
      setHasAnswered(false)
      toast.error('Errore durante l\'astensione')
    }
  }

  const goToNextQuestion = useCallback(async () => {
    if (!game) return
    const nextIndex = currentQuestionIndex + 1
    setCurrentQuestionIndex(nextIndex)
    setSelectedAnswer(null)
    setHasAnswered(false)
    setAnswers([])
    setPhase('question')
    setIsTimerActive(true)
    setQuestionStartTime(Date.now())
    setQuestionScore(null)
    setMyResponseTime(null)
    
    if (isHost && game) {
      // Single DB write → single SSE event on clients (avoids double timer-start race)
      await advanceToNextQuestion(game.id, nextIndex + 1)
    }
  }, [game, currentQuestionIndex, isHost])

  const handleReveal = useCallback(async () => {
    // Read ALL values from the ref to avoid stale closures.
    // This is the critical fix: useCallback's dep array doesn't include
    // selectedAnswer, myResponseTime, answers etc., so reading them
    // directly from closure would give stale (null/empty) values.
    const {
      selectedAnswer: latestSelectedAnswer,
      myResponseTime: latestResponseTime,
      answers: latestAnswers,
      currentPlayerId: latestPlayerId,
      currentQuestionIndex: latestQIdx,
      players: latestPlayers,
      isHost: latestIsHost,
      game: latestGame,
      questions: latestQuestions,
      allinActive: latestAllinActive,
    } = latestRef.current

    const latestQuestion = latestQuestions[latestQIdx]
    const latestPlayer = latestPlayers.find(p => p.id === latestPlayerId)

    if (!latestQuestion || !latestGame || !latestPlayer || !latestPlayerId) return
    
    // Prevent double calls using ref
    if (isRevealingRef.current) return
    isRevealingRef.current = true

    setPhase('reveal')
    setIsTimerActive(false)
    if (latestIsHost && latestGame) {
      updateGamePhase(latestGame.id, 'reveal').catch(console.error)
    }

    // Get the player's answer
    const myAnswer = latestAnswers.find(a => a.player_id === latestPlayerId)
    const actualSelectedAnswer = latestSelectedAnswer || myAnswer?.answer
    const actualResponseTime = latestResponseTime || myAnswer?.response_time_ms || SCORING.TIME_LIMIT_MS
    
    const isCorrect = actualSelectedAnswer === latestQuestion.correct_answer
    const didNotAnswer = !actualSelectedAnswer
    const canStillAbstain = latestPlayer.abstentions_used < latestGame.max_abstentions

    // Track personal stats (solo + multiplayer)
    if (!didNotAnswer) {
      soloStatsRef.current.answeredCount++
      soloStatsRef.current.totalTimeMs += actualResponseTime
      if (isCorrect) soloStatsRef.current.correctCount++
    }
    const isUntimed = isUntimedGame(latestGame.game_profile)

    let score = 0
    if (isCorrect) {
      score = isUntimed ? SCORING.CORRECT_UNTIMED : calculateCorrectPoints(actualResponseTime)
    } else if (didNotAnswer && canStillAbstain) {
      score = 0
    } else {
      if (isUntimed) {
        score = SCORING.WRONG_UNTIMED
      } else {
        const sortedByScore = [...latestPlayers].sort((a, b) => b.score - a.score)
        const position = sortedByScore.findIndex(p => p.id === latestPlayerId) + 1
        score = calculateWrongPoints(position, latestPlayers.length, latestQIdx === 0, actualResponseTime)
      }
    }

    setQuestionScore(score)

    // All-in bonus: if active and player actually answered, double the points
    if (latestAllinActive && !didNotAnswer && score !== 0 && latestPlayerId) {
      updatePlayerScore(latestPlayerId, score).catch(console.error) // adds score again → ×2
    }
    setAllinActive(false)

    const processNextPhase = () => {
      const { isHost: nowIsHost, game: nowGame } = latestRef.current
      const questionNum = latestQIdx + 1
      const isLastQuestion = questionNum === latestQuestions.length
      const showLeaderboard = questionNum % 5 === 0 || isLastQuestion

      if (isLastQuestion) {
        if (nowIsHost && nowGame) {
          // Single DB write (phase + topic_selection_mode) → single SSE event on clients
          updateGamePhaseAndSync(nowGame.id, 'finished').catch(console.error)
        }
        setPhase('finished')
      } else if (showLeaderboard) {
        if (nowIsHost && nowGame) {
          updateGamePhaseAndSync(nowGame.id, 'leaderboard').catch(console.error)
        }
        setPhase('leaderboard')
      } else {
        goToNextQuestion()
      }
    }

    // SOLO l'host decide quando si passa alla fase successiva.
    // DB calls and minimum display time run in PARALLEL:
    // total wait = max(DB_time, 400ms) instead of DB_time + 400ms
    if (latestIsHost) {
      // Snapshot scores BEFORE processAnswers so AnimatedLeaderboard can animate from old → new
      setPlayersBeforeScoring([...latestPlayers])

      const withTimeout = (p: Promise<unknown>, ms: number) =>
        Promise.race([p, new Promise<void>(resolve => setTimeout(resolve, ms))])

      await Promise.all([
        new Promise(resolve => setTimeout(resolve, 200)),
        withTimeout(
          processAnswers(
            latestGame.id,
            latestQuestion.id,
            latestQuestion.correct_answer,
            latestGame.max_abstentions,
            latestQIdx === 0,
            latestGame.game_profile || 'timed'
          ).catch(console.error),
          12000
        ),
      ])
      // getPlayers runs in background — don't block phase transition on it
      getPlayers(latestGame.id).then(setPlayers).catch(console.error)
      processNextPhase()
      isRevealingRef.current = false
    } else {
      // Il client rilascia il lock e aspetta l'evento SSE dell'host
      isRevealingRef.current = false
    }
  // Minimal deps — actual values are read from latestRef
  }, [goToNextQuestion])

  // Check if all players answered — HOST only. Clients are driven by SSE phase events.
  useEffect(() => {
    if (!isHost || phase !== 'question' || !currentQuestion) return
    // Guard: only auto-reveal if at least 800ms have passed since question started
    // Prevents spurious immediate triggers on manche transition
    if (answers.length >= players.length && players.length > 0 && questionStartTime > 0 && Date.now() - questionStartTime >= 800) {
      handleReveal()
    }
  }, [answers.length, players.length, phase, currentQuestion, handleReveal, questionStartTime])

  // Host-side fallback: Force reveal if time is up and some players disconnected/didn't answer
  useEffect(() => {
    if (phase !== 'question' || !isHost || !game) return

    // Untimed: 60s grace, timed: 15s + 4s grace
    const timeout = isUntimedGame(game.game_profile) ? 60000 : SCORING.TIME_LIMIT_MS + 4000
    const fallbackTimer = setTimeout(() => {
      handleReveal()
    }, timeout)

    return () => clearTimeout(fallbackTimer)
  }, [phase, isHost, game, currentQuestionIndex, handleReveal])

  // Client-side fallback: polling every 5s during question phase + single-shot for reveal/leaderboard
  useEffect(() => {
    if (isHost || !game) return

    let fallbackTimer: NodeJS.Timeout
    const isUntimed = isUntimedGame(game.game_profile)

    if (phase === 'question') {
      // Wait until the question should definitely be over before polling.
      // Timed: start at 17s (15s + 2s grace), then every 4s.
      // Untimed: start at 65s (just before host's 60s fallback fires), then every 4s.
      // This keeps extra server calls to 1-2 per question instead of every 5s from the start.
      const initialDelay = isUntimed ? 65000 : SCORING.TIME_LIMIT_MS + 2000

      const startPolling = setTimeout(() => {
        const pollInterval = setInterval(async () => {
          const updatedGame = await getGameByCode(game.code)
          if (!updatedGame || updatedGame.phase === 'question') return
          clearInterval(pollInterval)
          setGame(updatedGame)
          const serverPhase = updatedGame.phase as GamePhase
          const latestQIdx = latestRef.current.currentQuestionIndex
          if (serverPhase === 'reveal' && !isRevealingRef.current) {
            setIsTimerActive(false)
            setPlayersBeforeScoring(latestRef.current.players)
            setPhase('reveal')
            handleReveal()
          } else if (serverPhase === 'leaderboard' || serverPhase === 'finished') {
            setPhase(serverPhase)
            isRevealingRef.current = false
          } else if (serverPhase === 'question' && updatedGame.current_question > latestQIdx + 1) {
            const newQIdx = updatedGame.current_question - 1
            setCurrentQuestionIndex(newQIdx)
            setSelectedAnswer(null)
            setHasAnswered(false)
            setAnswers([])
            setPhase('question')
            setIsTimerActive(!isUntimed)
            setQuestionStartTime(Date.now())
            setQuestionScore(null)
            setMyResponseTime(null)
            isRevealingRef.current = false
          }
        }, 4000)
        return () => clearInterval(pollInterval)
      }, initialDelay)

      return () => clearTimeout(startPolling)
    } else if (phase === 'reveal') {
      fallbackTimer = setTimeout(async () => {
        const updatedGame = await getGameByCode(game.code)
        if (!updatedGame) return
        if (updatedGame.phase === 'leaderboard' || updatedGame.phase === 'finished') {
          setGame(updatedGame)
          setPhase(updatedGame.phase as GamePhase)
        } else if (updatedGame.current_question > currentQuestionIndex + 1) {
          setGame(updatedGame)
          const newQIdx = updatedGame.current_question - 1
          setCurrentQuestionIndex(newQIdx)
          setSelectedAnswer(null)
          setHasAnswered(false)
          setAnswers([])
          setPhase('question')
          if (newQIdx === 0) {
            setShowCountdown(true)
            setIsTimerActive(false)
          } else {
            setIsTimerActive(true)
          }
          setQuestionStartTime(Date.now())
          isRevealingRef.current = false
        } else if (updatedGame.phase === 'reveal') {
          // Both host and client stuck in reveal (host's processAnswers is hanging).
          // Retry after another 15s — by then the host's 12s timeout will have fired.
          setTimeout(async () => {
            const retryGame = await getGameByCode(game.code)
            if (!retryGame) return
            if (retryGame.phase !== 'reveal') {
              setGame(retryGame)
              setPhase(retryGame.phase as GamePhase)
            } else if (retryGame.current_question > currentQuestionIndex + 1) {
              setGame(retryGame)
              const newQIdx = retryGame.current_question - 1
              setCurrentQuestionIndex(newQIdx)
              setSelectedAnswer(null)
              setHasAnswered(false)
              setAnswers([])
              setPhase('question')
              setIsTimerActive(newQIdx !== 0)
              if (newQIdx === 0) setShowCountdown(true)
              setQuestionStartTime(Date.now())
              isRevealingRef.current = false
            }
          }, 15000)
        }
      }, 8000)
    } else if (phase === 'leaderboard') {
      // Fallback: if SSE missed the transition out of leaderboard, poll after 12s
      fallbackTimer = setTimeout(async () => {
        const updatedGame = await getGameByCode(game.code)
        if (!updatedGame) return
        // Host moved to next question or another phase
        if (updatedGame.current_question > currentQuestionIndex + 1) {
          setGame(updatedGame)
          const newQIdx = updatedGame.current_question - 1
          setCurrentQuestionIndex(newQIdx)
          setSelectedAnswer(null)
          setHasAnswered(false)
          setAnswers([])
          setPhase('question')
          if (newQIdx === 0) {
            setShowCountdown(true)
            setIsTimerActive(false)
          } else {
            setIsTimerActive(true)
          }
          setQuestionStartTime(Date.now())
          isRevealingRef.current = false
        } else if (updatedGame.phase && updatedGame.phase !== 'leaderboard') {
          setGame(updatedGame)
        }
      }, 12000)
    }

    return () => clearTimeout(fallbackTimer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isHost, game?.code, game?.game_profile, currentQuestionIndex, handleReveal])

  // Client fast-path: if player already answered but SSE reveal is dropped,
  // poll DB after 5s instead of waiting for the 25s question-phase fallback.
  useEffect(() => {
    if (isHost || !game || !hasAnswered || phase !== 'question') return

    const timer = setTimeout(async () => {
      const updatedGame = await getGameByCode(game.code)
      if (!updatedGame || updatedGame.phase === 'question') return
      setGame(updatedGame)
      const serverPhase = updatedGame.phase as GamePhase
      if (serverPhase === 'reveal') {
        setIsTimerActive(false)
        // Let handleReveal fire via setGame → SSE-like path is not available here,
        // so manually trigger reveal state
        if (!isRevealingRef.current) {
          setPhase('reveal')
          handleReveal()
        }
      } else if (serverPhase === 'leaderboard' || serverPhase === 'finished') {
        setPhase(serverPhase)
        isRevealingRef.current = false
      } else if (serverPhase === 'question' && updatedGame.current_question > currentQuestionIndex + 1) {
        const newQIdx = updatedGame.current_question - 1
        setCurrentQuestionIndex(newQIdx)
        setSelectedAnswer(null)
        setHasAnswered(false)
        setAnswers([])
        setPhase('question')
        setIsTimerActive(true)
        setQuestionStartTime(Date.now())
        setQuestionScore(null)
        setMyResponseTime(null)
        isRevealingRef.current = false
      }
    }, 5000)

    return () => clearTimeout(timer)
  }, [isHost, hasAnswered, phase, game?.code, currentQuestionIndex, handleReveal])

const handleNextFromLeaderboard = async () => {
    if (!game) return

    // Check if arcade is configured for this group of questions
    const arcadeGames = game.arcade_games as ArcadeGame[] | null
    const arcadeFreq = game.arcade_frequency || 5
    const questionNum = currentQuestionIndex + 1
    const shouldPlayArcade = arcadeGames && arcadeGames.length > 0 && questionNum % arcadeFreq === 0

    if (shouldPlayArcade && arcadeGames) {
      // Host picks the game and saves to DB so all players see the same
      const randomGame = arcadeGames[Math.floor(Math.random() * arcadeGames.length)]
      const newRound = arcadeRound + 1

      await setCurrentArcadeGameInDb(game.id, randomGame, newRound)

      setCurrentArcadeGame(randomGame)
      setArcadeRound(newRound)
      setHasCompletedArcade(false)
      setArcadeResults([])
      setPhase('arcade')
    } else {
      goToNextQuestion()
    }
  }

  const handleNewManche = async (resetScores: boolean) => {
    if (!game || isKeepingScores || isResettingScores) return
    if (resetScores) setIsResettingScores(true)
    else setIsKeepingScores(true)

    const showStart = Date.now()

    // Let React render the loading screen before starting async operations
    await new Promise(resolve => setTimeout(resolve, 80))

    // Broadcast to clients so they show the right loading message
    await syncLeaderboardPhase(game.id, resetScores ? 'resetting' : 'keeping')

    // Fire game reset + player reset together in parallel — no animation delay.
    await Promise.all([
      resetGameForNewManche(game.id),
      resetPlayersForNewManche(game.id, resetScores),
    ])
    clearAnswersForGame(game.id) // fire-and-forget

    // Ensure the message is visible for at least 2 seconds
    const elapsed = Date.now() - showStart
    if (elapsed < 2000) await new Promise(resolve => setTimeout(resolve, 2000 - elapsed))

    sessionStorage.setItem('guglioquiz_redirecting', 'true')
    if (isHost) {
      window.location.href = `/settings?code=${game.code}&manche=true`
    } else {
      window.location.href = `/lobby/${game.code}`
    }
  }

  // Save solo result and load history when solo game finishes
  useEffect(() => {
    if (phase !== 'finished' || !game?.solo_mode || !currentPlayerId || soloResultSaved) return
    const me = players.find(p => p.id === currentPlayerId)
    if (!me) return
    setSoloResultSaved(true)

    const userId = sessionStorage.getItem('guglioquiz_userId') || ''
    const { correctCount, totalTimeMs, answeredCount } = soloStatsRef.current
    const avgTime = answeredCount > 0 ? Math.round(totalTimeMs / answeredCount) : 0

    if (userId) {
      saveSoloResult({
        user_id: userId,
        score: me.score,
        correct_answers: correctCount,
        total_questions: questions.length,
        topics: game.topics as any,
        difficulty: game.difficulty,
        game_profile: (game.game_profile || 'timed') as any,
        avg_response_time_ms: avgTime,
      })
      fetch('/api/game-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          game_code: game?.code ?? '',
          score: me.score,
          total: questions.length,
          questions_json: questions,
          players_json: [{ name: me.name, score: me.score }],
        }),
      }).catch(() => {})
      getSoloResults(userId, 10).then(setSoloHistory).catch(console.error)
    }
  }, [phase, game?.solo_mode, currentPlayerId, soloResultSaved, players, questions.length, game])

  // Save multiplayer game history when game finishes (for logged-in players)
  useEffect(() => {
    if (phase !== 'finished' || game?.solo_mode || !currentPlayerId || gameHistorySaved) return
    const me = players.find(p => p.id === currentPlayerId)
    if (!me) return
    const userId = sessionStorage.getItem('guglioquiz_userId') || ''
    if (!userId) return
    setGameHistorySaved(true)
    const playersData = sortedPlayers.map(p => ({ name: p.name, score: p.score }))
    fetch('/api/game-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        game_code: game?.code ?? '',
        score: me.score,
        total: 0,
        questions_json: questions,
        players_json: playersData,
      }),
    }).catch(() => {}) // fire-and-forget
  }, [phase, game?.solo_mode, game?.code, currentPlayerId, gameHistorySaved, players, sortedPlayers, questions])

  // Load per-player stats from answers when multiplayer game finishes
  useEffect(() => {
    if (phase !== 'finished' || game?.solo_mode || !game?.id) return
    getPlayerStatsForGame(game.id).then(setPlayerStats).catch(console.error)
  }, [phase, game?.solo_mode, game?.id])

  // Background music: start/stop based on musicEnabled + phase
  useEffect(() => {
    if (musicEnabled && phase !== 'finished') {
      startBgMusic()
    } else {
      stopBgMusic()
    }
    return () => stopBgMusic()
  }, [musicEnabled, phase])

  // Snapshot rank positions each time the leaderboard appears — used for trend triangles
  useEffect(() => {
    if (phase === 'leaderboard' && !leaderboardSnappedRef.current) {
      leaderboardSnappedRef.current = true
      setPreviousLeaderboardRanks(savedLeaderboardRanksRef.current)
      savedLeaderboardRanksRef.current = Object.fromEntries(sortedPlayers.map((p, i) => [p.id, i]))
    } else if (phase !== 'leaderboard') {
      leaderboardSnappedRef.current = false
    }
  }, [phase, sortedPlayers])

  const handleQuickRematch = async () => {
    if (!game || isStartingRematch) return
    setIsStartingRematch(true)
    const rematchStart = Date.now()
    await updateGamePhase(game.id, 'rematch_pending')
    await Promise.all([
      rematchGameDirect(game.id),
      resetPlayersForNewManche(game.id, true),
    ])
    clearAnswersForGame(game.id).catch(console.error)
    // Ensure the screen is visible for at least 2 seconds
    const rematchElapsed = Date.now() - rematchStart
    if (rematchElapsed < 2000) await new Promise(resolve => setTimeout(resolve, 2000 - rematchElapsed))
    sessionStorage.setItem('guglioquiz_redirecting', 'true')
    window.location.href = `/game/${game.code}`
  }

  const handleGoHome = () => {
    sessionStorage.clear()
    router.push('/')
  }

  // Arcade game completion handler
  const handleArcadeComplete = useCallback(async (rawScore: number) => {
    if (!game || !currentPlayerId || !currentArcadeGame) return

    setHasCompletedArcade(true)

    await submitArcadeResult(
      game.id,
      currentPlayerId,
      currentArcadeGame,
      arcadeRound,
      rawScore
    )
  }, [game, currentPlayerId, currentArcadeGame, arcadeRound])

  // Subscribe to arcade results when in arcade phase (with polling fallback)
  useEffect(() => {
    if (phase !== 'arcade' && phase !== 'arcade_results') return
    if (!game || arcadeRound === 0) return

    let isMounted = true
    let allCompleted = false
    let resultsFinalized = false // Freeze results once processing is complete

    async function fetchAndCheckResults() {
      if (!isMounted || allCompleted) return

      const results = await getArcadeResults(game!.id, arcadeRound)
      if (!isMounted) return

      // Mostra subito i risultati parziali (raw score + chi ha completato)
      if (!resultsFinalized) setArcadeResults(results)

      // Check if all players completed
      if (results.length === players.length && results.length > 0) {
        allCompleted = true
        try {
          if (isHost) {
            const isLowerBetter = ['reaction_time', 'memory_cards', 'speed_typing', 'sequenza_numerica', 'puzzle_slider'].includes(currentArcadeGame || '')
            await processArcadeResults(game!.id, arcadeRound, currentArcadeGame || '', isLowerBetter)
            const updatedPlayers = await getPlayers(game!.id)
            if (isMounted) setPlayers(updatedPlayers)
          } else {
            // Clients: aspetta che l'host processi (max 2s invece di 3s)
            await new Promise(resolve => setTimeout(resolve, 2000))
            const updatedPlayers = await getPlayers(game!.id)
            if (isMounted) setPlayers(updatedPlayers)
          }
        } catch (error) {
          console.error("Error processing arcade results:", error)
        }

        // Fetch finale con points_earned calcolati — mostra risultati definitivi
        const finalResults = await getArcadeResults(game!.id, arcadeRound)
        if (isMounted) {
          resultsFinalized = true
          setArcadeResults(finalResults)
          setPhase('arcade_results')
        }
      }
    }

    // Initial fetch
    fetchAndCheckResults()

    // Poll ogni 4s come fallback
    const pollInterval = setInterval(fetchAndCheckResults, 4000)

    // Realtime: aggiorna subito quando arrivano nuovi risultati
    const channel = subscribeToArcadeResults(game!.id, arcadeRound, (freshResults) => {
      if (isMounted && !resultsFinalized) setArcadeResults(freshResults)
      if (!allCompleted) fetchAndCheckResults()
    })

    return () => {
      isMounted = false
      clearInterval(pollInterval)
      unsubscribe(channel)
    }
  }, [phase, game, arcadeRound, players.length, isHost, currentArcadeGame])

  const handleContinueFromArcade = async () => {
    if (game) {
      await clearCurrentArcadeGame(game.id)
    }
    // Call goToNextQuestion BEFORE setCurrentArcadeGame(null) so React batches
    // phase='question' and currentArcadeGame=null together in one render,
    // avoiding the blank screen caused by arcade condition failing before
    // question condition is ready
    goToNextQuestion()
    setCurrentArcadeGame(null)
    setHasCompletedArcade(false)
    setArcadeResults([])
  }

  const handleAbortMatch = async () => {
    if (!game || !isHost) return

    // Parallel: resetGameForNewManche (single DB write: clears game + sets status=lobby)
    // + resetPlayersForNewManche (reset scores to 0).
    // clearAnswersForGame fires and forgets — no need to block the redirect.
    await Promise.all([
      resetGameForNewManche(game.id),
      resetPlayersForNewManche(game.id, true),
    ])
    clearAnswersForGame(game.id) // fire-and-forget

    // Set flag to prevent beforeunload from removing player
    sessionStorage.setItem('guglioquiz_redirecting', 'true')
    window.location.href = `/settings?code=${game.code}&manche=true`
  }

  // Host disconnected overlay — shown above any phase
  if (hostDisconnected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-4 text-center">
        <img src="/logo-gq.png" alt="GQ" className="w-20 h-20 opacity-40" />
        <h2 className="text-2xl font-bold text-foreground">L&apos;host ha abbandonato</h2>
        <p className="text-muted-foreground">Verrai reindirizzato alla home tra 3 secondi...</p>
      </main>
    )
  }

  // Loading state
  if (phase === 'loading') {
    const isGen = isGenerating || ((game?.phase as string) || '').startsWith('generating')
    const questionCount = game?.question_count || 10
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
        </div>
        {isGen ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <p className="text-foreground font-semibold">Generazione di {questionCount} domande</p>
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, generationProgress)}%` }}
              />
            </div>
            <p className="text-muted-foreground text-sm">{Math.min(100, Math.round(generationProgress))}%</p>
          </div>
        ) : (
          <p className="text-muted-foreground">Caricamento partita...</p>
        )}
        {!currentPlayerId && (
          <Button variant="outline" onClick={() => router.push('/')} className="mt-2">
            <Home className="h-4 w-4 mr-2" />
            Torna alla Home
          </Button>
        )}
      </main>
    )
  }

  // Arcade phase
  if ((phase === 'arcade' || phase === 'arcade_results') && currentPlayerId && currentArcadeGame && currentPlayer) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        <div className="w-full max-w-md flex flex-col gap-3">
          <ArcadeGameWrapper
            game={currentArcadeGame}
            playerId={currentPlayerId}
            playerName={currentPlayer.name}
            players={players}
            isHost={isHost}
            onComplete={handleArcadeComplete}
            onContinue={handleContinueFromArcade}
            allResults={arcadeResults}
            hasCompleted={hasCompletedArcade}
            resultsReady={phase === 'arcade_results'}
          />
          {isHost && (
            <Button
              variant="ghost"
              size="lg"
              className="w-full font-bold bg-purple-600 text-white"
              onClick={handleAbortMatch}
            >
              Termina partita e torna a impostazioni
            </Button>
          )}
        </div>
      </main>
    )
  }

  // Leaderboard phase
  if (phase === 'leaderboard' && currentPlayerId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        {/* Preload logo so it appears instantly when switching to the GQ loading screen */}
        <img src="/logo-gq.png" alt="" className="hidden" aria-hidden />
        <div className="w-full max-w-md flex flex-col gap-3">
          <Leaderboard
            players={sortedPlayers}
            currentPlayerId={currentPlayerId}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={questions.length}
            isHost={isHost}
            maxAbstentions={game?.max_abstentions}
            previousRanks={previousLeaderboardRanks}
            onContinue={handleNextFromLeaderboard}
          />
          {isHost && (
            <Button
              variant="ghost"
              size="lg"
              className="w-full font-bold bg-purple-600 text-white"
              onClick={handleAbortMatch}
            >
              Termina partita e torna a impostazioni
            </Button>
          )}
        </div>
      </main>
    )
  }

  // Full-screen loading while preparing new manche
  if (isStartingRematch) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
        </div>
        <p className="text-primary font-black uppercase tracking-widest text-base">Rivincita in corso...</p>
      </div>
    )
  }

  if (showRematchPopup) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
        </div>
        <p className="text-muted-foreground text-lg">Rivincita in arrivo!</p>
        <p className="text-red-500 font-black uppercase tracking-widest text-base">Punteggi azzerati</p>
        <p className="text-primary font-black uppercase tracking-widest text-base">Stesse impostazioni</p>
      </div>
    )
  }

  if (isKeepingScores || isResettingScores || isRedirectingToLobby) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
        </div>
        <p className="text-muted-foreground text-lg">Caricamento nuova manche...</p>
        {(isResettingScores || isKeepingScores) && (
          <p className="text-red-500 font-black uppercase tracking-widest text-base">
            {isResettingScores ? 'Punteggi azzerati' : 'Punteggi mantenuti'}
          </p>
        )}
      </div>
    )
  }

  // Finished phase — solo mode end screen
  if (phase === 'finished' && currentPlayerId && game?.solo_mode) {
    const me = players.find(p => p.id === currentPlayerId)
    const { correctCount, totalTimeMs, answeredCount } = soloStatsRef.current
    const avgTimeSec = answeredCount > 0 ? (totalTimeMs / answeredCount / 1000).toFixed(1) : '—'
    const pct = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0

    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Modalità solitaria</p>
            <h1 className="text-3xl font-black text-foreground">Partita completata!</h1>
          </div>

          {/* Stats */}
          <Card className="bg-card border-border">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start gap-3 rounded-xl p-3 bg-muted/40 border border-border">
                <Trophy className="h-7 w-7 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1.5">Punteggio</p>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/45 text-white">{me?.score ?? 0} pt</span>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl p-3 bg-muted/40 border border-border">
                <Target className="h-7 w-7 text-green-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-green-400 mb-1.5">Corrette</p>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-green-500/45 text-white">{correctCount} / {questions.length} — {pct}%</span>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl p-3 bg-muted/40 border border-border">
                <Timer className="h-7 w-7 text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-1.5">Tempo medio</p>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-500/45 text-white">{avgTimeSec}s per risposta</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* History */}
          {soloHistory.length > 1 && (
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Le tue ultime partite</p>
                <div className="space-y-2">
                  {soloHistory.map((r, i) => {
                    const rPct = r.total_questions > 0 ? Math.round((r.correct_answers / r.total_questions) * 100) : 0
                    const isToday = new Date(r.created).toDateString() === new Date().toDateString()
                    const dateLabel = isToday ? 'oggi' : new Date(r.created).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
                    return (
                      <div key={r.id} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${i === 0 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/40'}`}>
                        <span className="font-bold text-foreground">{r.score} pt</span>
                        <span className="text-muted-foreground">{rPct}%</span>
                        <span className="text-muted-foreground">{r.total_questions} dom</span>
                        <span className="text-muted-foreground text-xs">{dateLabel}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleQuickRematch}
              disabled={isStartingRematch}
              size="lg"
              className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 text-white"
            >
              <RefreshCw className="mr-2 h-5 w-5" />
              Gioca ancora
            </Button>
            <Button
              onClick={() => { sessionStorage.setItem('guglioquiz_redirecting', 'true'); window.location.href = `/settings?code=${game.code}&manche=true` }}
              size="lg"
              variant="secondary"
              className="w-full h-14 text-lg font-bold"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Cambia impostazioni
            </Button>
            <Button onClick={handleGoHome} size="lg" variant="outline" className="w-full h-14 text-lg font-bold">
              <Home className="mr-2 h-5 w-5" />
              Torna alla Home
            </Button>
          </div>
        </div>
      </main>
    )
  }

  // Finished phase — multiplayer
  if (phase === 'finished' && currentPlayerId) {
    const winner = sortedPlayers[0]
    const isWinner = winner?.id === currentPlayerId

    // Leaderboard + buttons
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        <img src="/logo-gq.png" alt="" className="hidden" aria-hidden />
        <Leaderboard
          players={sortedPlayers}
          currentPlayerId={currentPlayerId}
          playerStats={playerStats}
          questionNumber={questions.length}
          totalQuestions={questions.length}
          maxAbstentions={game?.max_abstentions}
        >
          {isHost ? (
            <>
              <Button
                onClick={handleQuickRematch}
                disabled={isStartingRematch}
                size="lg"
                className="w-full h-14 text-sm md:text-lg font-bold bg-green-600 hover:bg-green-700 text-white whitespace-normal"
              >
                <RefreshCw className="mr-2 h-5 w-5 flex-shrink-0" />
                <span>Rivincita (stesse impostazioni)</span>
              </Button>
              <Button
                onClick={() => handleNewManche(false)}
                size="lg"
                className="w-full h-14 text-sm md:text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 whitespace-normal"
              >
                <RotateCcw className="mr-2 h-5 w-5 flex-shrink-0" />
                <span>Nuova Manche (mantieni punteggi)</span>
              </Button>
              <Button
                onClick={() => handleNewManche(true)}
                size="lg"
                className="w-full h-14 text-sm md:text-lg font-bold whitespace-normal"
                variant="secondary"
              >
                <RotateCcw className="mr-2 h-5 w-5 flex-shrink-0" />
                <span>Nuova Manche (azzera punteggi)</span>
              </Button>
              <Button
                onClick={handleGoHome}
                size="lg"
                variant="outline"
                className="w-full h-14 text-lg font-bold"
              >
                <Home className="mr-2 h-5 w-5" />
                Torna alla Home
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-muted-foreground">
                  In attesa che l&apos;host avvii una nuova manche...
                </p>
              </div>
              <Button
                onClick={handleGoHome}
                size="lg"
                variant="outline"
                className="w-full h-14 text-lg font-bold"
              >
                <Home className="mr-2 h-5 w-5" />
                Torna alla Home
              </Button>
            </>
          )}
          <Button
            onClick={() => downloadQuizPDF(questions, sortedPlayers)}
            size="lg"
            variant="outline"
            className="w-full h-14 text-lg font-bold border-violet-500 text-violet-400 hover:bg-violet-500/10"
          >
            <FileDown className="mr-2 h-5 w-5" />
            Scarica PDF domande
          </Button>
        </Leaderboard>

      </main>
    )
  }

  // Question/Reveal phase — if question data isn't ready yet, show a spinner
  // instead of a blank screen (prevents black screen during phase transitions).
  // Only block on missing question/game — currentPlayer may briefly lag behind
  // on re-render; we skip the full-screen flash and handle its absence inline.
  if (!currentQuestion || !game) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-4 animate-[fadeIn_0.25s_ease_0.08s_both]">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" fetchPriority="high" />
        </div>
        <p className="text-muted-foreground">Caricamento...</p>
      </main>
    )
  }

  const correctAnswer = currentQuestion.correct_answer

  return (
    <>
    {showCountdown && (
      <CountdownOverlay onDone={() => {
        setShowCountdown(false)
        setIsTimerActive(true)
        setQuestionStartTime(Date.now())
      }} />
    )}
    <main className="min-h-screen flex flex-col p-4 md:p-8">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-row items-center gap-2">
            <Badge variant="outline" className="text-primary border-primary">
              {currentQuestionIndex + 1} / {questions.length}
            </Badge>
            <Badge variant="secondary" className="whitespace-nowrap">
              {TOPIC_LABELS[currentQuestion.topic as keyof typeof TOPIC_LABELS] ||
                currentQuestion.topic}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Music toggle */}
            <button
              onClick={() => {
                const next = !musicEnabled
                setMusicEnabled(next)
                localStorage.setItem('guglioquiz_music_enabled', String(next))
                initAudioContext()
              }}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                musicEnabled
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title={musicEnabled ? 'Musica attiva' : 'Musica disattivata'}
            >
              <Music2 className="h-4 w-4" />
            </button>
            <AbstentionDots
              total={game.max_abstentions}
              used={currentPlayer?.abstentions_used ?? 0}
            />
          </div>
        </div>

        {/* Timer always centered with score positioned to its right */}
        <div className="relative flex justify-center items-center">
          {/* Timer - always centered, hidden if untimed */}
          {!isUntimedGame(game.game_profile) ? (
            <QuizTimer
              duration={15}
              onComplete={handleTimeUp}
              isActive={isTimerActive}
              questionKey={currentQuestionIndex}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4 border-2 border-primary/30 rounded-full w-24 h-24 bg-primary/5">
              <span className="text-4xl">∞</span>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Relax</span>
            </div>
          )}

          
          {/* Question score (shown after reveal) - positioned to the right of timer */}
          {phase === 'reveal' && questionScore !== null && (
            <div className="absolute left-1/2 ml-16 flex items-baseline gap-2">
              <span className={cn(
                'text-3xl font-bold',
                questionScore > 0 && 'text-green-500',
                questionScore < 0 && 'text-red-500',
                questionScore === 0 && 'text-white'
              )}>
                {questionScore > 0 ? `+${questionScore}` : questionScore}
              </span>
              <span className="text-white text-lg">punti</span>
            </div>
          )}
        </div>

        {/* Question + Answers — type dispatch */}
        <div key={currentQuestionIndex} className="animate-fade-in-up space-y-3">
        {currentQuestion.question_type === 'audio' ? (
          <AudioQuestion
            key={currentQuestionIndex}
            questionText={currentQuestion.question_text}
            audioUrl={(currentQuestion as any).audio_url}
            options={currentQuestion.options}
            correctAnswer={correctAnswer}
            questionIndex={currentQuestionIndex}
            audioDisabled={audioDisabled}
            phase={phase}
            selectedAnswer={selectedAnswer}
            hasAnswered={hasAnswered}
            isClickable={isClickable}
            onSelect={handleAnswerSelect}
          />
        ) : currentQuestion.question_type === 'image_options' ? (
          <ImageOptionsQuestion
            key={currentQuestionIndex}
            questionText={currentQuestion.question_text}
            options={currentQuestion.options}
            optionImages={(currentQuestion as any).option_images ?? []}
            correctAnswer={correctAnswer}
            questionIndex={currentQuestionIndex}
            phase={phase}
            selectedAnswer={selectedAnswer}
            hasAnswered={hasAnswered}
            isClickable={isClickable}
            onSelect={handleAnswerSelect}
          />
        ) : currentQuestion.question_type === 'order' ? (
          <OrderQuestion
            key={currentQuestionIndex}
            questionText={currentQuestion.question_text}
            options={currentQuestion.options}
            correctOrder={(currentQuestion as any).correct_order ?? currentQuestion.options}
            questionIndex={currentQuestionIndex}
            phase={phase}
            hasAnswered={hasAnswered}
            isClickable={isClickable}
            onSubmit={handleAnswerSelect}
          />
        ) : (
          <>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            {currentQuestion.image_url && (
              <div className="flex justify-center mb-4">
                <img
                  src={currentQuestion.image_url}
                  alt="Immagine domanda"
                  className="max-h-48 md:max-h-64 object-contain rounded-lg"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement
                    img.style.display = 'none'
                    const placeholder = img.nextElementSibling as HTMLElement | null
                    if (placeholder) placeholder.style.display = 'flex'
                  }}
                />
                <div
                  style={{ display: 'none' }}
                  className="flex-col items-center justify-center gap-2 w-32 h-32 rounded-xl bg-muted border border-border text-muted-foreground text-center text-sm p-3"
                >
                  <span className="text-3xl">🖼️</span>
                  <span>Immagine non disponibile</span>
                </div>
              </div>
            )}
            <p className="text-xl md:text-2xl font-semibold text-foreground text-center text-balance">
              {currentQuestion.question_text}
            </p>
          </CardContent>
        </Card>

        {/* Answers */}
        <div className="grid gap-3">
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedAnswer === option
            const isCorrect = option === correctAnswer
            const showCorrect = phase === 'reveal' && isCorrect
            const showWrong = phase === 'reveal' && isSelected && !isCorrect
            const allinAvailable = game.allin_enabled && !game.solo_mode && !hasAnswered && allinUsedWindow !== Math.floor(currentQuestionIndex / 5)

            return (
              <div
                key={`${currentQuestionIndex}-${index}`}
                className="flex gap-2 animate-slide-in-left"
                style={{ animationDelay: `${index * 250}ms` }}
              >
                <button
                  onClick={() => handleAnswerSelect(option)}
                  disabled={hasAnswered || !isClickable}
                  className={cn(
                    'flex-1 p-4 md:p-5 rounded-xl text-left font-medium transition-all border-2 focus:outline-none',
                    'text-foreground',
                    !hasAnswered &&
                      !isSelected &&
                      'bg-muted border-border hover:border-primary/50 hover:bg-muted/80',
                    isSelected &&
                      phase !== 'reveal' &&
                      'bg-quiz-selected border-quiz-selected text-primary-foreground',
                    showCorrect &&
                      'bg-quiz-correct border-quiz-correct text-white animate-pulse-correct',
                    showWrong && 'bg-quiz-selected border-quiz-selected text-primary-foreground',
                    hasAnswered && !isSelected && !showCorrect && 'bg-muted border-border'
                  )}
                >
                  {option}
                </button>
                {allinAvailable && (
                  <button
                    onClick={() => {
                      setAllinActive(true)
                      setAllinUsedWindow(Math.floor(currentQuestionIndex / 5))
                      initAudioContext()
                      handleAnswerSelect(option)
                    }}
                    className="w-12 shrink-0 rounded-xl border-2 border-yellow-500 bg-transparent text-yellow-400 text-[13px] font-black flex items-center justify-center hover:bg-yellow-500/10 transition-colors focus:outline-none"
                  >
                    x2
                  </button>
                )}
              </div>
            )
          })}
        </div>
          </>
        )}

        {/* Answer status indicator - no card wrapper */}
        {phase === 'reveal' && (
          <div className="text-center py-2">
            {selectedAnswer === correctAnswer ? (
              <p className="text-accent font-bold text-lg">Risposta corretta!</p>
            ) : selectedAnswer ? (
              <p className="text-destructive font-bold text-lg">Risposta sbagliata!</p>
            ) : isUntimedGame(game.game_profile) ? (
              <p className="text-muted-foreground font-bold text-lg">Astenuto!</p>
            ) : (
              <p className="text-muted-foreground font-bold text-lg">Tempo scaduto!</p>
            )}
          </div>
        )}

        {/* Abstain Button (Only in untimed mode and before answering) */}
        {isUntimedGame(game.game_profile) && phase === 'question' && !hasAnswered && (
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={handleManualAbstain}
              disabled={(currentPlayer?.abstentions_used ?? 0) >= game.max_abstentions}
              className="w-full p-4 md:p-5 rounded-xl font-medium border-2 border-purple-600 bg-purple-600 text-white hover:bg-purple-700 gap-2"
            >
              <HandHelping className="h-5 w-5" />
              Astieniti ({game.max_abstentions - (currentPlayer?.abstentions_used || 0)} rimaste)
            </Button>
          </div>
        )}
        </div>{/* end animate-fade-in-up */}

        {/* Abort button - host only, inside its own card */}
        {isHost && (
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <Button
                onClick={handleAbortMatch}
                size="lg"
                className="w-full h-12 font-bold bg-purple-600 text-white hover:bg-purple-700"
              >
                Interrompi partita e torna a impostazioni
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
    </>
  )
}
