'use client'

import { getPocketBase } from '@/lib/pocketbase'
import type { Game, Player, Question, Answer, GameSettings, GameProfile } from '@/lib/types'
import { generateGameCode, calculateCorrectPoints, calculateWrongPoints, SCORING } from '@/lib/types'

// Retry a single PocketBase call with exponential backoff on 429 errors
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 6): Promise<T> {
  let delay = 200
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const is429 = err?.status === 429 || err?.response?.code === 429 ||
                    (err?.message || '').includes('429')
      if (is429 && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay))
        delay = Math.min(delay * 2, 3000)  // 200→400→800→1600→3000→3000ms (cap 3s)
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries reached')
}

// Run async tasks in batches to avoid PocketBase 429 rate-limit errors.
// Each individual operation is wrapped with retry logic so transient 429s
// are handled automatically without propagating to the caller.
async function runInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<any>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(item => withRetry(() => fn(item))))
  }
}

// Game operations
export async function createGame(hostId: string, settings: GameSettings): Promise<Game | null> {
  const code = generateGameCode()
  const pb = getPocketBase()
  
    const record = await withRetry(() => pb.collection('games').create({
      code,
      host_id: hostId,
      topics: settings.topics,
      question_count: settings.questionCount,
      difficulty: settings.difficulty,
      max_abstentions: settings.maxAbstentions,
      game_profile: settings.gameProfile || 'timed',
      arcade_games: settings.arcadeGames || null,
      arcade_frequency: settings.arcadeFrequency || null,
      status: 'lobby',
      manche_ready: true,  // First manche is ready by default
      manche: 1,
      current_question: 0,
      questions_ready: false
    }))
    return record as unknown as Game
}

// Kept for backward compatibility — callers should prefer resetGameForNewManche
// which merges this call into the same DB write.
export async function clearGameSettingsForNewManche(gameId: string): Promise<boolean> {
  return resetGameForNewManche(gameId)
}

export async function updateGameSettings(gameId: string, settings: GameSettings): Promise<boolean> {
  const pb = getPocketBase()

  try {
    // Update game settings and atomically increment manche counter.
    // Uses PocketBase atomic increment ('manche+': 1) to avoid a read-then-write round trip.
    // questions_json / questions_ready are cleared so the game page generates fresh questions.
    // NOTE: legacy 'questions' collection cleanup removed — questions now live in questions_json.
    await withRetry(() => pb.collection('games').update(gameId, {
      topics: settings.topics,
      question_count: settings.questionCount,
      difficulty: settings.difficulty,
      max_abstentions: settings.maxAbstentions,
      game_profile: settings.gameProfile || 'timed',
      arcade_games: settings.arcadeGames || null,
      arcade_frequency: settings.arcadeFrequency || null,
      current_question: 0,
      'manche+': 1,
      questions_json: [],
      questions_ready: false,
      // topic_selection_mode intentionally NOT reset here:
      // it stays active so the lobby gate blocks start until all clients confirm
    }))

    return true
  } catch (error) {
    console.error('Error updating game settings:', error)
    return false
  }
}

export async function updateGameTopics(gameId: string, topics: string[]): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, { topics }))
    return true
  } catch (error) {
    console.error('Error updating game topics:', error)
    return false
  }
}

/**
 * Toggles a topic in the game's topic list.
 * This helper tries to minimize race conditions by fetching the latest state before update.
 */
export async function toggleGameTopic(gameId: string, topic: string, action: 'add' | 'remove'): Promise<string[] | null> {
  const pb = getPocketBase()
  try {
    // 1. Get latest game state
    const game = await withRetry(() => pb.collection('games').getOne(gameId))
    const currentTopics = (game.topics as string[]) || []
    
    let newTopics: string[]
    if (action === 'add') {
      if (currentTopics.includes(topic)) return currentTopics
      newTopics = [...currentTopics, topic]
    } else {
      if (!currentTopics.includes(topic)) return currentTopics
      newTopics = currentTopics.filter(t => t !== topic)
    }
    
    // 2. Update with new list
    await withRetry(() => pb.collection('games').update(gameId, { topics: newTopics }))
    return newTopics
  } catch (error) {
    console.error('Error toggling game topic:', error)
    return null
  }
}

export async function setPlayerTopicsConfirmed(playerId: string, confirmed: boolean): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('players').update(playerId, { topics_confirmed: confirmed }))
    return true
  } catch (error) {
    console.error('Error setting player topics_confirmed:', error)
    return false
  }
}

export async function resetAllPlayersTopicsConfirmed(gameId: string): Promise<boolean> {
  const pb = getPocketBase()
  try {
    const players = await withRetry(() => pb.collection('players').getFullList({ filter: `game_id="${gameId}"` }))
    await runInBatches(players, 5, player => pb.collection('players').update(player.id, { topics_confirmed: false, selected_topics: [] }))
    return true
  } catch (error) {
    console.error('Error resetting players topics_confirmed:', error)
    return false
  }
}

export async function setTopicSelectionMode(gameId: string, mode: string | null): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, { topic_selection_mode: mode || '' }))
    return true
  } catch (error) {
    console.error('Error setting topic selection mode:', error)
    return false
  }
}

export async function setMancheReady(gameId: string, ready: boolean): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, { manche_ready: ready }))
    return true
  } catch (error) {
    console.error('Error setting manche_ready:', error)
    return false
  }
}

export async function getGameByCode(code: string): Promise<Game | null> {
  if (!code) return null
  const pb = getPocketBase()
  try {
    const normalizedCode = code.trim().toUpperCase()
    const record = await withRetry(() => pb.collection('games').getFirstListItem(`code="${normalizedCode}"`))
    return record as unknown as Game
  } catch (error) {
    console.error('getGameByCode error:', error)
    return null
  }
}

export async function updateGameStatus(gameId: string, status: Game['status']): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, { status }))
    return true
  } catch (error) {
    console.error('Error updating game status:', error)
    return false
  }
}

export async function updateCurrentQuestion(gameId: string, questionNumber: number, resetTopicSelectionMode: boolean = false): Promise<boolean> {
  const pb = getPocketBase()
  const updateData: any = { current_question: questionNumber }
  if (resetTopicSelectionMode) {
    updateData.topic_selection_mode = ''
  }
  try {
    await withRetry(() => pb.collection('games').update(gameId, updateData))
    return true
  } catch (error) {
    console.error('Error updating current question:', error)
    return false
  }
}

export async function updateGamePhase(gameId: string, phase: string): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, { phase }))
    return true
  } catch (error) {
    console.error('Error updating game phase:', error)
    return false
  }
}

// Resets ALL game state for a new manche in a SINGLE DB write.
// Merges the old resetGameForNewManche + clearGameSettingsForNewManche into one call
// to avoid the race condition where two parallel writes to the same record
// could overwrite each other.
// Arcade results deletion runs fire-and-forget (non-blocking).
export async function resetGameForNewManche(gameId: string): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, {
      phase: 'loading',
      status: 'lobby',
      topic_selection_mode: '',
      topics: [],
      questions_json: [],
      questions_ready: false,
      manche_ready: false,
      current_arcade_game: '',
      current_arcade_round: 0,
    }))
    // Delete arcade results in the background — no need to block the redirect
    pb.collection('arcade_results').getFullList({ filter: `game_id="${gameId}"` })
      .then(results => runInBatches(results, 5, r => pb.collection('arcade_results').delete(r.id)))
      .catch(console.error)
    return true
  } catch (error) {
    console.error('Error resetting game for new manche:', error)
    return false
  }
}

// Helper to capitalize first letter of name
function capitalizeFirstLetter(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

// Player operations
export async function addPlayer(
  gameId: string,
  name: string,
  avatar: string | null,
  avatarUrl: string | null,
  isHost: boolean
): Promise<Player | null> {
  const pb = getPocketBase()
  const safeName = (name || 'Giocatore').trim()
  const capitalizedName = capitalizeFirstLetter(safeName)

  // Deduplication: if a non-host player with the same name already exists in this game,
  // return the existing record instead of creating a duplicate.
  // This handles the case where the user closes the browser (sessionStorage cleared)
  // and rejoins via the same link.
  if (!isHost) {
    try {
      const existing = await withRetry(() =>
        pb.collection('players').getFirstListItem(
          `game_id="${gameId}" && name="${capitalizedName}" && is_host=false`
        )
      )
      if (existing) return existing as unknown as Player
    } catch {
      // Not found — proceed to create
    }
  }

  const record = await withRetry(() => pb.collection('players').create({
    game_id: gameId,
    name: capitalizedName,
    avatar,
    avatar_url: avatarUrl,
    is_host: isHost,
    score: 0,
    abstentions_used: 0,
    ready: false,
    topics_confirmed: false,
    selected_topics: []
  }))
  return record as unknown as Player
}

export async function getPlayers(gameId: string): Promise<Player[]> {
  const pb = getPocketBase()
  try {
    const records = await withRetry(() => pb.collection('players').getFullList({
      filter: `game_id="${gameId}"`
    }))
    return records as unknown as Player[]
  } catch (error) {
    console.error('Error fetching players:', error)
    return []
  }
}

export async function updatePlayerReady(playerId: string, ready: boolean): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('players').update(playerId, { ready }))
    return true
  } catch (error) {
    console.error('Error updating player ready status:', error)
    return false
  }
}

export async function updatePlayerTopics(playerId: string, topics: string[]): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('players').update(playerId, { selected_topics: topics }))
    return true
  } catch (error) {
    console.error('Error updating player topics:', error)
    return false
  }
}

export async function updatePlayerScore(playerId: string, scoreChange: number): Promise<boolean> {
  const pb = getPocketBase()
  try {
    // PocketBase allows atomic increments using the "fieldName+" syntax
    await withRetry(() => pb.collection('players').update(playerId, {
      "score+": scoreChange
    }))
    return true
  } catch (error) {
    console.error('Error updating player score:', error)
    return false
  }
}

export async function updatePlayerAbstentions(playerId: string): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('players').update(playerId, {
      "abstentions_used+": 1
    }))
    return true
  } catch (error) {
    console.error('Error updating player abstentions:', error)
    return false
  }
}

export async function deletePlayer(playerId: string, gameId?: string): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('players').delete(playerId))
    return true
  } catch (error) {
    console.error('Error deleting player:', error)
    return false
  }
}

export async function resetPlayersForNewManche(gameId: string, resetScores: boolean): Promise<boolean> {
  const pb = getPocketBase()
  try {
    const players = await withRetry(() => pb.collection('players').getFullList({ filter: `game_id="${gameId}"` }))

    const updates: any = {
      abstentions_used: 0,
      ready: false,
      topics_confirmed: false,
      selected_topics: []
    }
    if (resetScores) {
      updates.score = 0
    }
    await runInBatches(players, 5, player => pb.collection('players').update(player.id, updates))
    return true
  } catch (error) {
    console.error('Error resetting players:', error)
    return false
  }
}

// Question operations
export async function saveQuestions(gameId: string, questions: Omit<Question, 'id' | 'game_id' | 'created_at'>[], manche: number = 1): Promise<Question[]> {
  const pb = getPocketBase()
  
  // Create a structured list with unique IDs for this specific game and manche
  const questionsWithIds = questions.map((q, i) => ({
    ...q,
    id: `${gameId}_m${manche}_q_${i}`,
    game_id: gameId,
    question_number: i + 1,
    created_at: new Date().toISOString()
  }))

  try {
    // Save ALL questions in a single update request to the game record
    await withRetry(() => pb.collection('games').update(gameId, {
      questions_json: questionsWithIds,
      questions_ready: true
    }))
    return questionsWithIds as unknown as Question[]
  } catch (error) {
    console.error('Error saving questions to JSON:', error)
    // Fallback: if JSON fails, try to return the objects anyway so the host can start
    return questionsWithIds as unknown as Question[]
  }
}

export async function getQuestions(gameId: string): Promise<Question[]> {
  const pb = getPocketBase()
  try {
    // 1. Try to get questions from the game's JSON field first (fastest)
    const game = await withRetry(() => pb.collection('games').getOne(gameId))
    if (game.questions_json && Array.isArray(game.questions_json) && game.questions_json.length > 0) {
      return game.questions_json as unknown as Question[]
    }

    // 2. Fallback to questions collection (legacy)
    const records = await withRetry(() => pb.collection('questions').getFullList({
      filter: `game_id="${gameId}"`,
      sort: 'question_number'
    }))
    return records as unknown as Question[]
  } catch (error) {
    console.error('Error fetching questions:', error)
    return []
  }
}

// Answer operations
export async function submitAnswerV3(
  questionId: string,
  playerId: string,
  answer: string | null,
  isAbstention: boolean,
  responseTimeMs: number | null
): Promise<Answer | null> {
  const pb = getPocketBase()
  try {
    // Check if answer already exists (PocketBase doesn't have upsert out of the box based on two columns)
    let existingAnswer = null;
    try {
      existingAnswer = await pb.collection('answers').getFirstListItem(`question_id="${questionId}" && player_id="${playerId}"`)
    } catch (e) {
      // not found, which is fine
    }

    const payload = {
      question_id: questionId,
      player_id: playerId,
      answer: answer || '',
      is_abstention: isAbstention,
      response_time_ms: responseTimeMs,
    };

    let record;
    if (existingAnswer) {
      record = await withRetry(() => pb.collection('answers').update(existingAnswer.id, payload))
    } else {
      record = await withRetry(() => pb.collection('answers').create(payload))
    }

    return record as unknown as Answer
  } catch (error) {
    console.error('Error submitting answer:', error)
    return null
  }
}

export async function clearAnswersForGame(gameId: string): Promise<void> {
  const pb = getPocketBase()
  try {
    const answers = await withRetry(() => pb.collection('answers').getFullList({
      filter: `question_id ~ "${gameId}_"`
    }))
    await runInBatches(answers, 5, answer => pb.collection('answers').delete(answer.id))
  } catch (error) {
    console.error('Error clearing answers:', error)
  }
}

export async function getAnswersForQuestion(questionId: string): Promise<Answer[]> {
  const pb = getPocketBase()
  try {
    const records = await withRetry(() => pb.collection('answers').getFullList({
      filter: `question_id="${questionId}"`
    }))
    return records as unknown as Answer[]
  } catch (error) {
    console.error('Error fetching answers:', error)
    return []
  }
}

export async function processAnswers(
  gameId: string,
  questionId: string,
  correctAnswer: string,
  maxAbstentions: number,
  isFirstQuestion: boolean,
  gameProfile: GameProfile = 'timed'
): Promise<void> {

  const pb = getPocketBase()
  const [answers, players] = await Promise.all([
    getAnswersForQuestion(questionId),
    getPlayers(gameId),
  ])
  
  // Sort players by score for position calculation
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const normalizedCorrect = correctAnswer.trim().toLowerCase()

  // Build a list of all update operations to run in parallel
  const ops: Promise<unknown>[] = []

  for (const answer of answers) {
    // Skip answers already processed
    if ((answer as any).points_processed) continue

    const player = players.find(p => p.id === answer.player_id)
    if (!player) continue

    const position = sortedPlayers.findIndex(p => p.id === player.id) + 1
    let points = 0
    let isCorrect = false
    let needsAbstentionIncrement = false

    const playerAnswer = (answer.answer || '').trim().toLowerCase()

    if (playerAnswer === normalizedCorrect) {
      isCorrect = true
      points = gameProfile === 'untimed'
        ? SCORING.CORRECT_UNTIMED
        : calculateCorrectPoints(answer.response_time_ms || 15000)
    } else if (answer.is_abstention || !answer.answer) {
      if (player.abstentions_used >= maxAbstentions) {
        points = gameProfile === 'untimed'
          ? SCORING.WRONG_UNTIMED
          : calculateWrongPoints(position, players.length, isFirstQuestion, answer.response_time_ms ?? undefined)
      }
      needsAbstentionIncrement = true
    } else {
      points = gameProfile === 'untimed'
        ? SCORING.WRONG_UNTIMED
        : calculateWrongPoints(position, players.length, isFirstQuestion, answer.response_time_ms ?? undefined)
    }

    // Each answer's writes are grouped and will be processed sequentially
    ops.push({ answer, player, isCorrect, points, needsAbstentionIncrement })
  }

  // Process answers in batches of 3 (was sequential) — ~3× faster for 4-6 players.
  // Each batch item runs its own writes in parallel (answer update + score + abstention).
  // withRetry handles any 429s automatically.
  await runInBatches(ops as any[], 3, async (op: any) => {
    const { answer: ans, player: pl, isCorrect: ic, points: pts, needsAbstentionIncrement: nai } = op
    const writes: Promise<unknown>[] = [
      withRetry(() => pb.collection('answers').update(ans.id, {
        is_correct: ic,
        points_earned: pts,
        points_processed: true,
      })).catch(e => console.error('Error updating answer:', e)),
    ]
    if (pts !== 0) writes.push(updatePlayerScore(pl.id, pts))
    if (nai) writes.push(updatePlayerAbstentions(pl.id))
    await Promise.all(writes)
  })
}

// Realtime subscriptions

export function subscribeToGame(gameId: string, callback: (game: Game) => void) {
  const pb = getPocketBase()
  pb.collection('games').subscribe(gameId, (e) => {
    callback(e.record as unknown as Game)
  }).catch(err => console.error('subscribeToGame error:', err))
  return () => pb.collection('games').unsubscribe(gameId)
}

export function subscribeToPlayers(gameId: string, callback: (players: Player[]) => void) {
  const pb = getPocketBase()

  // Local map — SSE events update the player list WITHOUT an extra HTTP round-trip.
  const localPlayers = new Map<string, Player>()

  // Initial fetch — populate map once
  getPlayers(gameId).then(players => {
    players.forEach(p => localPlayers.set(p.id, p))
    callback([...localPlayers.values()])
  })

  let unsubFn: (() => void) | null = null
  pb.collection('players').subscribe('*', (e) => {
    if (e.record.game_id !== gameId) return
    if (e.action === 'delete') {
      localPlayers.delete(e.record.id)
    } else {
      localPlayers.set(e.record.id, e.record as unknown as Player)
    }
    callback([...localPlayers.values()])
  }, {
    filter: `game_id = "${gameId}"`
  }).then(fn => { unsubFn = fn }).catch(err => {
    console.error('Subscription error:', err)
  })

  return () => {
    if (unsubFn) unsubFn()
    else pb.collection('players').unsubscribe('*')
  }
}

export function subscribeToAnswers(questionId: string, callback: (answers: Answer[]) => void) {
  const pb = getPocketBase()

  // Local map so SSE events update the answer list WITHOUT an extra HTTP round-trip.
  // Key = player_id to handle create/update/delete idempotently.
  const localAnswers = new Map<string, Answer>()

  // Initial fetch — populate the local map once
  getAnswersForQuestion(questionId).then(answers => {
    answers.forEach(a => localAnswers.set(a.player_id, a))
    callback([...localAnswers.values()])
  })

  let unsubFn: (() => void) | null = null
  pb.collection('answers').subscribe('*', (e) => {
    if (e.record.question_id !== questionId) return
    if (e.action === 'delete') {
      localAnswers.delete(e.record.player_id)
    } else {
      // create or update — upsert by player_id
      localAnswers.set(e.record.player_id, e.record as unknown as Answer)
    }
    // Fire callback immediately from the SSE event — no extra HTTP request needed
    callback([...localAnswers.values()])
  }, {
    filter: `question_id = "${questionId}"`
  }).then(fn => { unsubFn = fn }).catch(err => console.error('Answer sub error:', err))

  return () => {
    if (unsubFn) unsubFn()
    else pb.collection('answers').unsubscribe('*')
  }
}

// Unsubscribe is handled directly by returning the unsub function in the new design,
// but for backward compatibility with the components:
export function unsubscribe(unsubscribeFunc: any) {
  if (typeof unsubscribeFunc === 'function') {
    unsubscribeFunc()
  } else if (unsubscribeFunc && typeof unsubscribeFunc.unsubscribe === 'function') {
    unsubscribeFunc.unsubscribe()
  }
}

// Arcade game sync functions
export async function setCurrentArcadeGameInDb(
  gameId: string,
  arcadeGame: string,
  arcadeRound: number
): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, {
      current_arcade_game: arcadeGame,
      current_arcade_round: arcadeRound,
      topic_selection_mode: '',
    }))
    return true
  } catch (error) {
    console.error('Error setting current arcade game:', error)
    return false
  }
}

export async function clearCurrentArcadeGame(gameId: string): Promise<boolean> {
  const pb = getPocketBase()
  try {
    await withRetry(() => pb.collection('games').update(gameId, {
      current_arcade_game: null,
      current_arcade_round: 0,
    }))
    return true
  } catch (error) {
    console.error('Error clearing current arcade game:', error)
    return false
  }
}

// Arcade game functions
export interface ArcadeResult {
  id: string
  game_id: string
  player_id: string
  game_type: string
  arcade_round: number
  raw_score: number
  points_earned: number
  position: number | null
  completed_at: string
}

export async function submitArcadeResult(
  gameId: string,
  playerId: string,
  gameType: string,
  arcadeRound: number,
  rawScore: number
): Promise<ArcadeResult | null> {
  const pb = getPocketBase()
  try {
    const record = await withRetry(() => pb.collection('arcade_results').create({
      game_id: gameId,
      player_id: playerId,
      game_type: gameType,
      arcade_round: arcadeRound,
      raw_score: rawScore,
    }))
    return record as unknown as ArcadeResult
  } catch (error) {
    console.error('Error submitting arcade result:', error)
    return null
  }
}

export async function getArcadeResults(gameId: string, arcadeRound: number): Promise<ArcadeResult[]> {
  const pb = getPocketBase()
  try {
    const records = await withRetry(() => pb.collection('arcade_results').getFullList({
      filter: `game_id="${gameId}" && arcade_round=${arcadeRound}`,
      sort: 'raw_score'
    }))
    return records as unknown as ArcadeResult[]
  } catch (error) {
    console.error('Error getting arcade results:', error)
    return []
  }
}

export async function processArcadeResults(
  gameId: string,
  arcadeRound: number,
  gameType: string,
  isLowerBetter: boolean = true
): Promise<void> {
  const pb = getPocketBase()
  
  // Get all results for this round
  const results = await getArcadeResults(gameId, arcadeRound)
  if (results.length === 0) return

  // Sort by score (lower better for time-based, higher better for level-based)
  const sorted = [...results].sort((a, b) => 
    isLowerBetter ? a.raw_score - b.raw_score : b.raw_score - a.raw_score
  )

  // Max points per game (scaled by difficulty)
  const MAX_POINTS: Record<string, number> = {
    puzzle_slider: 1000,
    memory_cards: 700,
    simon_says: 700,
    speed_typing: 500,
    sequenza_numerica: 400,
    reaction_time: 300,
  }

  const maxPoints = MAX_POINTS[gameType] || 500
  const validResults = sorted.filter(r => r.raw_score !== 999999 && r.raw_score !== -1)
  const bestScore = validResults.length > 0 ? validResults[0].raw_score : 0

  // Update each result with position and points (percentage-based)
  for (let i = 0; i < sorted.length; i++) {
    const position = i + 1
    let pointsEarned = 0

    // Only process if points_earned is 0 (prevents double scoring)
    if (sorted[i].points_earned > 0) {
      continue
    }

    // Check if the player abstained
    if (sorted[i].raw_score === 999999 || sorted[i].raw_score === -1) {
      pointsEarned = 0
    }
    else if (bestScore > 0) {
      const performanceRatio = isLowerBetter 
        ? bestScore / sorted[i].raw_score  
        : sorted[i].raw_score / bestScore  
      
      pointsEarned = Math.round(maxPoints * performanceRatio)
    }

    try {
      await withRetry(() => pb.collection('arcade_results').update(sorted[i].id, { position, points_earned: pointsEarned }))
      await updatePlayerScore(sorted[i].player_id, pointsEarned)
    } catch(e) {
      console.error("Error updating arcade result", e)
    }
  }
}

export function subscribeToArcadeResults(gameId: string, arcadeRound: number, callback: (results: ArcadeResult[]) => void) {
  const pb = getPocketBase()

  // Local map — no extra HTTP call per SSE event
  const localResults = new Map<string, ArcadeResult>()

  // Initial fetch — populate map once
  getArcadeResults(gameId, arcadeRound).then(results => {
    results.forEach(r => localResults.set(r.id, r))
    callback([...localResults.values()])
  })

  let unsubFn: (() => void) | null = null
  pb.collection('arcade_results').subscribe('*', (e) => {
    if (e.record.game_id !== gameId || e.record.arcade_round !== arcadeRound) return
    if (e.action === 'delete') {
      localResults.delete(e.record.id)
    } else {
      localResults.set(e.record.id, e.record as unknown as ArcadeResult)
    }
    callback([...localResults.values()])
  }, {
    filter: `game_id = "${gameId}" && arcade_round = ${arcadeRound}`
  }).then(fn => { unsubFn = fn }).catch(err => console.error('Arcade sub error:', err))

  return () => {
    if (unsubFn) unsubFn()
    else pb.collection('arcade_results').unsubscribe('*')
  }
}

export async function syncLeaderboardPhase(gameId: string, isLeaderboard: boolean | string): Promise<void> {
  const pb = getPocketBase()
  const state = typeof isLeaderboard === 'string' ? isLeaderboard : (isLeaderboard ? 'leaderboard' : '')
  try {
    await withRetry(() => pb.collection('games').update(gameId, { topic_selection_mode: state }))
  } catch(e) {
     console.error("Error syncing leaderboard phase", e)
  }
}