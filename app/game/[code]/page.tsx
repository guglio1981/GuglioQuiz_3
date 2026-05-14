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
  updateCurrentQuestion,
  updateGameStatus,
  updateGamePhase,
  resetGameForNewManche,
  resetPlayersForNewManche,
  syncLeaderboardPhase,
  clearGameSettingsForNewManche,
  clearAnswersForGame,
  submitArcadeResult,
  getArcadeResults,
  processArcadeResults,
  subscribeToArcadeResults,
  setCurrentArcadeGameInDb,
  clearCurrentArcadeGame,
  type ArcadeResult,
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
} from '@/lib/types'
import { ArcadeGameWrapper } from '@/components/arcade/arcade-game-wrapper'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { RotateCcw, Home, Loader2, HandHelping } from 'lucide-react'


type GamePhase = 'loading' | 'question' | 'reveal' | 'leaderboard' | 'arcade' | 'arcade_results' | 'finished'

export default function GamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()

  // State
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
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
  const [isAnimatingReset, setIsAnimatingReset] = useState(false)
  const [hostDisconnected, setHostDisconnected] = useState(false)
  
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
  })
  // Sync on every render (no useEffect needed — this runs synchronously)
  latestRef.current = {
    selectedAnswer, myResponseTime, answers, currentPlayerId,
    currentQuestionIndex, players, phase, isHost:
      players.find(p => p.id === currentPlayerId)?.is_host || false,
    game, questions,
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

      // Check if questions already exist
      let questionsData = await getQuestions(gameData.id)
      
      if (questionsData.length === 0 && currentPlayerData?.is_host) {
        setIsGenerating(true)
        try {
          const usedHashesKey = 'guglioquiz_used_question_hashes'
          const usedTextsKey = 'guglioquiz_used_question_texts'
          const storedHashes = localStorage.getItem(usedHashesKey)
          const storedTexts = localStorage.getItem(usedTextsKey)
          const usedQuestionHashes = storedHashes ? JSON.parse(storedHashes) : []
          const usedQuestionTexts: string[] = storedTexts ? JSON.parse(storedTexts) : []

          const totalRequested = gameData.question_count || 10
          // Generate 40% extra as buffer to compensate for any broken image questions
          // that will be dropped during validation. Ensures we always hit totalRequested.
          const totalToGenerate = Math.ceil(totalRequested * 1.4)
          const chunkSize = 5
          const chunks = Math.ceil(totalToGenerate / chunkSize)
          const allQuestions: any[] = []
          const allHashes: string[] = []
          const allTexts: string[] = []

          for (let i = 0; i < chunks; i++) {
            const countForThisChunk = Math.min(chunkSize, totalToGenerate - allQuestions.length)
            if (countForThisChunk <= 0) break

            const response = await fetch('/api/generate-questions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topics: gameData.topics,
                count: countForThisChunk,
                difficulty: gameData.difficulty,
                usedQuestionHashes: [...usedQuestionHashes, ...allHashes],
                usedQuestionTexts: [...usedQuestionTexts, ...allTexts].slice(-30),
              }),
            })

            const responseData = await response.json()
            if (!response.ok) throw new Error(responseData.details || responseData.error || 'Failed to generate questions')

            const chunkQs = responseData.questions || []
            const chunkHashes = responseData.hashes || []
            allQuestions.push(...chunkQs)
            allHashes.push(...chunkHashes)
            allTexts.push(...chunkQs.map((q: any) => q.question_text as string))
          }

          if (allQuestions.length === 0) throw new Error('No questions generated')

          // Pre-validate image URLs — done once by the host at generation time.
          // Questions with broken images are dropped; the 40% buffer ensures we
          // still have enough valid questions to reach totalRequested.
          const validateImageUrl = (url: string): Promise<boolean> =>
            new Promise((resolve) => {
              const img = new window.Image()
              const timer = setTimeout(() => { img.src = ''; resolve(false) }, 8000)
              img.onload = () => { clearTimeout(timer); resolve(true) }
              img.onerror = () => { clearTimeout(timer); resolve(false) }
              img.src = url
            })

          const validationResults = await Promise.all(
            allQuestions.map(async (q: any) => {
              if (!q.image_url) return q      // text question — always keep
              const ok = await validateImageUrl(q.image_url)
              return ok ? q : null            // null = broken image → drop
            })
          )
          // Slice to exactly totalRequested after filtering broken images
          const validatedQuestions = validationResults.filter(Boolean).slice(0, totalRequested)

          // Save new hashes and texts to localStorage
          const trimmedHashes = [...usedQuestionHashes, ...allHashes].slice(-500)
          localStorage.setItem(usedHashesKey, JSON.stringify(trimmedHashes))
          const trimmedTexts = [...usedQuestionTexts, ...allTexts].slice(-200)
          localStorage.setItem(usedTextsKey, JSON.stringify(trimmedTexts))

          questionsData = await saveQuestions(gameData.id, validatedQuestions, gameData.manche || 1)

          // After generation, directly initialize game for the host — don't wait for SSE
          // because gameData.questions_ready is stale (was false when loadGame started).
          setIsGenerating(false)
          setQuestions(questionsData)
          setCurrentQuestionIndex(0)
          setPhase('question')
          setIsTimerActive(true)
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
          setIsTimerActive(initialPhase === 'question')
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
      // Use the phase the host already set. If phase is 'loading' or empty it means
      // questions are freshly generated and the game hasn't started yet → treat as 'question'.
      const dbPhase = game.phase as GamePhase
      const targetPhase = (dbPhase && dbPhase !== 'loading') ? dbPhase : 'question'
      setPhase(targetPhase)
      if (targetPhase === 'question') {
        setIsTimerActive(true)
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
      
      // If game status changed to lobby, redirect to lobby (only for non-host players)
      if (updatedGame.status === 'lobby' && !latestIsHost) {
        sessionStorage.setItem('guglioquiz_redirecting', 'true')
        window.location.href = `/lobby/${updatedGame.code}`
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
          setIsTimerActive(true)
          setQuestionStartTime(Date.now())
          setQuestionScore(null)
          setMyResponseTime(null)
          isRevealingRef.current = false
        }
      }

      // Sync phase (for non-host players)
      if (!latestIsHost && updatedGame.phase && updatedGame.phase !== latestRef.current.phase) {
        const newPhase = updatedGame.phase as GamePhase

        // Don't switch to 'question' phase if questions haven't been loaded yet —
        // the questions_ready useEffect will handle that once questions are fetched.
        if (newPhase === 'question' && latestQuestions.length === 0) {
          // questions_ready useEffect will fire shortly and load questions + set phase
        } else {
          setPhase(newPhase)
        }

        // Handle specific logic when entering a phase
        if (newPhase === 'question' && latestQuestions.length > 0) {
          setIsTimerActive(true)
          setQuestionStartTime(Date.now())
          setHasAnswered(false)
          setSelectedAnswer(null)
          setAnswers([])
        } else if (newPhase === 'reveal') {
          setIsTimerActive(false)
          // Trigger local reveal for clients to show their score
          handleReveal()
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
        window.location.href = `/lobby/${updatedGame.code}`
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
    const isAbstention = currentPlayer.abstentions_used < game.max_abstentions

    await submitAnswerV3(
      currentQuestion.id,
      currentPlayerId,
      "", // Usa stringa vuota per evitare errori del database
      isAbstention,
      SCORING.TIME_LIMIT_MS
    )
  }, [hasAnswered, currentQuestion, currentPlayerId, currentPlayer, game])

  const handleManualAbstain = async () => {
    if (phase !== 'question' || hasAnswered || !currentPlayer || !game) return
    
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
      await updateCurrentQuestion(game.id, nextIndex + 1, true)
      await updateGamePhase(game.id, 'question')
      await syncLeaderboardPhase(game.id, '')
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
    const isUntimed = latestGame.game_profile === 'untimed'

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

    const processNextPhase = () => {
      const { isHost: nowIsHost, game: nowGame } = latestRef.current
      const questionNum = latestQIdx + 1
      const isLastQuestion = questionNum === latestQuestions.length
      const showLeaderboard = questionNum % 5 === 0 || isLastQuestion

      if (isLastQuestion) {
        if (nowIsHost && nowGame) {
          syncLeaderboardPhase(nowGame.id, 'finished').catch(console.error)
          updateGamePhase(nowGame.id, 'finished').catch(console.error)
        }
        setPhase('finished')
      } else if (showLeaderboard) {
        if (nowIsHost && nowGame) {
          syncLeaderboardPhase(nowGame.id, 'leaderboard').catch(console.error)
          updateGamePhase(nowGame.id, 'leaderboard').catch(console.error)
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
      await Promise.all([
        new Promise(resolve => setTimeout(resolve, 400)),
        (async () => {
          await processAnswers(
            latestGame.id,
            latestQuestion.id,
            latestQuestion.correct_answer,
            latestGame.max_abstentions,
            latestQIdx === 0,
            latestGame.game_profile || 'timed'
          )
          const updatedPlayers = await getPlayers(latestGame.id)
          setPlayers(updatedPlayers)
        })(),
      ])
      processNextPhase()
      isRevealingRef.current = false
    } else {
      // Il client rilascia il lock e aspetta l'evento SSE dell'host
      isRevealingRef.current = false
    }
  // Minimal deps — actual values are read from latestRef
  }, [goToNextQuestion])

  // Check if all players answered
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) return
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
    const timeout = game.game_profile === 'untimed' ? 60000 : SCORING.TIME_LIMIT_MS + 4000
    const fallbackTimer = setTimeout(() => {
      handleReveal()
    }, timeout)

    return () => clearTimeout(fallbackTimer)
  }, [phase, isHost, game, currentQuestionIndex, handleReveal])

  // Client-side fallback: Smart Fallback Timer (Zero Polling)
  useEffect(() => {
    if (isHost || !game) return

    let fallbackTimer: NodeJS.Timeout
    const isUntimed = game.game_profile === 'untimed'

    if (phase === 'question') {
      const timeout = isUntimed ? 70000 : SCORING.TIME_LIMIT_MS + 10000
      fallbackTimer = setTimeout(async () => {
        const updatedGame = await getGameByCode(game.code)
        if (updatedGame && updatedGame.phase && updatedGame.phase !== 'question') {
          setGame(updatedGame)
        }
      }, timeout)
    } else if (phase === 'reveal') {
      fallbackTimer = setTimeout(async () => {
        const updatedGame = await getGameByCode(game.code)
        if (updatedGame && (updatedGame.current_question > currentQuestionIndex + 1 || updatedGame.phase !== 'reveal')) {
          setGame(updatedGame)
        }
      }, 20000)
    }

    return () => clearTimeout(fallbackTimer)
  }, [phase, isHost, game?.code, currentQuestionIndex])

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

    if (resetScores) {
      // 1. Zero scores in DB first — subscription updates leaderboard on ALL clients
      await resetPlayersForNewManche(game.id, true)
      // 2. Show zeroed leaderboard for 1.5s so everyone sees it
      setIsAnimatingReset(true)
      await new Promise(resolve => setTimeout(resolve, 1500))
      setIsAnimatingReset(false)
    }

    // 3. Fire game reset + player reset together — resetGameForNewManche now handles
    // everything (merged with clearGameSettingsForNewManche) in a single DB write.
    // clearAnswersForGame runs fire-and-forget — no need to block the redirect.
    await Promise.all([
      resetGameForNewManche(game.id),
      resetScores ? Promise.resolve() : resetPlayersForNewManche(game.id, false),
    ])
    clearAnswersForGame(game.id) // fire-and-forget

    sessionStorage.setItem('guglioquiz_redirecting', 'true')
    if (isHost) {
      window.location.href = `/settings?code=${game.code}&manche=true`
    } else {
      window.location.href = `/lobby/${game.code}`
    }
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

      // Only update live results if not yet finalized
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
            // Clients wait for host to process
            await new Promise(resolve => setTimeout(resolve, 3000))
            const updatedPlayers = await getPlayers(game!.id)
            if (isMounted) setPlayers(updatedPlayers)
          }
        } catch (error) {
          console.error("Error processing arcade results:", error)
        }

        // Final single fetch after processing — freeze display
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

    // Poll every 8 seconds as fallback (subscription handles real-time)
    const pollInterval = setInterval(fetchAndCheckResults, 8000)

    // Subscribe to realtime — only update results before finalization to prevent flicker
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
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
        </div>
        <p className="text-muted-foreground">
          {isGenerating ? 'Generazione domande in corso...' : 'Caricamento partita...'}
        </p>
        {!currentPlayerId && (
          <Button variant="outline" onClick={() => router.push('/')} className="mt-4">
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
        />
        {isHost && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive text-xs"
            onClick={handleAbortMatch}
          >
            Termina partita e torna a impostazioni
          </Button>
        )}
      </main>
    )
  }

  // Leaderboard phase
  if (phase === 'leaderboard' && currentPlayerId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        <Leaderboard
          players={sortedPlayers}
          currentPlayerId={currentPlayerId}
          questionNumber={currentQuestionIndex + 1}
          totalQuestions={questions.length}
          isHost={isHost}
          maxAbstentions={game?.max_abstentions}
          onContinue={handleNextFromLeaderboard}
        />
        {isHost && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive text-xs"
            onClick={handleAbortMatch}
          >
            Termina partita e torna a impostazioni
          </Button>
        )}
      </main>
    )
  }

  // Finished phase
  if (phase === 'finished' && currentPlayerId) {
    const winner = sortedPlayers[0]
    const isWinner = winner?.id === currentPlayerId

    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">
            {isWinner ? 'Hai vinto!' : 'Fine Partita!'}
          </h1>
          <p className="text-xl text-muted-foreground">
            Vincitore: {winner?.name} con {winner?.score} punti
          </p>
        </div>

        <Leaderboard
          players={sortedPlayers}
          currentPlayerId={currentPlayerId}
          questionNumber={questions.length}
          totalQuestions={questions.length}
          maxAbstentions={game?.max_abstentions}
        >
          {isAnimatingReset ? (
            <div className="flex flex-col items-center gap-3 py-4 animate-in fade-in duration-300">
              <Loader2 className="h-8 w-8 animate-spin text-destructive" />
              <p className="text-lg font-bold text-destructive">Azzeramento punteggi...</p>
              <p className="text-sm text-muted-foreground">Preparazione nuova manche</p>
            </div>
          ) : isHost ? (
            <>
              <Button
                onClick={() => handleNewManche(false)}
                disabled={isKeepingScores || isResettingScores}
                size="lg"
                className="w-full h-14 text-sm md:text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 whitespace-normal"
              >
                {isKeepingScores ? <Loader2 className="mr-2 h-5 w-5 animate-spin flex-shrink-0" /> : <RotateCcw className="mr-2 h-5 w-5 flex-shrink-0" />}
                <span>Nuova Manche (mantieni punteggi)</span>
              </Button>
              <Button
                onClick={() => handleNewManche(true)}
                disabled={isKeepingScores || isResettingScores}
                size="lg"
                className="w-full h-14 text-sm md:text-lg font-bold whitespace-normal"
                variant="secondary"
              >
                {isResettingScores ? <Loader2 className="mr-2 h-5 w-5 animate-spin flex-shrink-0" /> : <RotateCcw className="mr-2 h-5 w-5 flex-shrink-0" />}
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
        </Leaderboard>
      </main>
    )
  }

  // Question/Reveal phase — if question data isn't ready yet, show a spinner
  // instead of a blank screen (prevents black screen during phase transitions)
  if (!currentQuestion || !game || !currentPlayer) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
        </div>
        <p className="text-muted-foreground">Caricamento...</p>
      </main>
    )
  }

  const correctAnswer = currentQuestion.correct_answer

  return (
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

          <AbstentionDots
            total={game.max_abstentions}
            used={currentPlayer.abstentions_used}
          />
        </div>

        {/* Timer always centered with score positioned to its right */}
        <div className="relative flex justify-center items-center">
          {/* Timer - always centered, hidden if untimed */}
          {game.game_profile !== 'untimed' ? (
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

        {/* Question */}
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

            return (
              <button
                key={`${currentQuestionIndex}-${index}`}
                onClick={() => handleAnswerSelect(option)}
                disabled={hasAnswered || !isClickable}
                className={cn(
                  'w-full p-4 md:p-5 rounded-xl text-left font-medium transition-all border-2 focus:outline-none',
                  'text-foreground',
                  // Default state
                  !hasAnswered &&
                    !isSelected &&
                    'bg-muted border-border hover:border-primary/50 hover:bg-muted/80',
                  // Selected (before reveal)
                  isSelected &&
                    phase !== 'reveal' &&
                    'bg-quiz-selected border-quiz-selected text-primary-foreground',
                  // Correct answer (reveal)
                  showCorrect &&
                    'bg-quiz-correct border-quiz-correct text-white animate-pulse-correct',
                  // Wrong answer selected (reveal)
                  showWrong && 'bg-quiz-selected border-quiz-selected text-primary-foreground',
                  // Non-selected answers stay the same (no visual change)
                  hasAnswered && !isSelected && !showCorrect && 'bg-muted border-border'
                )}
              >
                <span className="flex-1">{option}</span>
              </button>
            )
          })}
        </div>

        {/* Answer status indicator - no card wrapper */}
        {phase === 'reveal' && (
          <div className="text-center py-2">
            {selectedAnswer === correctAnswer ? (
              <p className="text-accent font-bold text-lg">Risposta corretta!</p>
            ) : selectedAnswer ? (
              <p className="text-destructive font-bold text-lg">Risposta sbagliata!</p>
            ) : game.game_profile === 'untimed' ? (
              <p className="text-muted-foreground font-bold text-lg">Astenuto!</p>
            ) : (
              <p className="text-muted-foreground font-bold text-lg">Tempo scaduto!</p>
            )}
          </div>
        )}

        {/* Abstain Button (Only in untimed mode and before answering) */}
        {game.game_profile === 'untimed' && phase === 'question' && !hasAnswered && (
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={handleManualAbstain}
              disabled={currentPlayer?.abstentions_used >= game.max_abstentions}
              className="w-full p-4 md:p-5 rounded-xl font-medium border-2 border-purple-600 bg-purple-600 text-white hover:bg-purple-700 gap-2"
            >
              <HandHelping className="h-5 w-5" />
              Astieniti ({game.max_abstentions - (currentPlayer?.abstentions_used || 0)} rimaste)
            </Button>
          </div>
        )}


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
  )
}
