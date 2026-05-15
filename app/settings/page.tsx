'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'

import { createGame, addPlayer, getGameByCode, updateGameSettings, updateGameStatus, resetPlayersForNewManche, subscribeToGame, unsubscribe, updateGameTopics, getPlayers, subscribeToPlayers, setTopicSelectionMode as setTopicSelectionModeInDb, resetAllPlayersTopicsConfirmed, setMancheReady, updatePlayerTopics } from '@/lib/game-store'
import { TOPICS, TOPIC_LABELS, ARCADE_GAMES, ARCADE_GAME_LABELS, ARCADE_GAME_DESCRIPTIONS, parseAvatar, type Topic, type Difficulty, type GameProfile, type GameSettings, type PlayerProfile, type ArcadeGame, type Game, type Player } from '@/lib/types'
import { toast } from 'sonner'
import { 
  ArrowLeft, Shuffle, Settings2, Loader2, Hash, Gauge, HandHelping, Gamepad2, Users, X, Check,
  History, Globe, Cpu, Laptop, Zap, Languages, Scale, Tv, Church, Flag, Calculator,
  FileText, BookOpen, Clapperboard, Library, Music, MonitorPlay, Dices, Smile,
  FlaskConical, Trophy, Landmark, Palette, Star, Cat, Car, Image as ImageIcon,
  FlagTriangleRight, Calendar, ChevronDown, ChevronUp, Volume2, VolumeX
} from 'lucide-react'

const TOPIC_ICONS: Record<Topic, any> = {
  storia: History,
  geografia: Globe,
  tecnologia: Cpu,
  informatica: Laptop,
  ragionamento_rapido: Zap,
  inglese: Languages,
  economia_diritto: Scale,
  serie_tv: Tv,
  religione: Church,
  lingue_straniere: Flag,
  matematica: Calculator,
  italiano: FileText,
  cultura_generale: BookOpen,
  cinema: Clapperboard,
  libri: Library,
  musica: Music,
  televisione: MonitorPlay,
  giochi_tavolo: Dices,
  cartoni_animati: Smile,
  scienze_natura: FlaskConical,
  sport: Trophy,
  politica: Landmark,
  arte: Palette,
  celebrita: Star,
  animali: Cat,
  veicoli: Car,
  indovina_logo: ImageIcon,
  indovina_bandiera: FlagTriangleRight,
  indovina_anno: Calendar,
}

function SettingsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [existingGameCode, setExistingGameCode] = useState<string | null>(null)
  const [isMancheMode, setIsMancheMode] = useState(false)
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  
  // Settings state
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>([])
  const [mixMode, setMixMode] = useState(false)
  const [questionCount, setQuestionCount] = useState<number>(10)
  const [difficulty, setDifficulty] = useState<Difficulty>('intermedia')
  const [maxAbstentions, setMaxAbstentions] = useState<number>(3)
  const [arcadeEnabled, setArcadeEnabled] = useState<boolean>(false)
  const [selectedArcadeGames, setSelectedArcadeGames] = useState<ArcadeGame[]>([])
  const [arcadeFrequency, setArcadeFrequency] = useState<number>(5)
  const [gameProfile, setGameProfile] = useState<GameProfile>('timed')
  const [enableAudioQuestions, setEnableAudioQuestions] = useState(true)

  
  // Collaborative topic selection
  const [topicSelectionMode, setTopicSelectionMode] = useState<'off' | '1' | '2'>('off')
  const [isTopicSelectionActive, setIsTopicSelectionActive] = useState(false)
  const [isCollaborativeSectionOpen, setIsCollaborativeSectionOpen] = useState(false)
  
  // Refs to avoid stale closures in realtime subscriptions without causing re-subscriptions
  const isTopicSelectionActiveRef = useRef(isTopicSelectionActive)
  const gameRef = useRef(game)
  
  useEffect(() => {
    isTopicSelectionActiveRef.current = isTopicSelectionActive
  }, [isTopicSelectionActive])
  
  useEffect(() => {
    gameRef.current = game
  }, [game])

  // Calculate max arcade games based on questionCount and frequency
  // No arcade after last 5 questions (final leaderboard)
  const calculateMaxArcadeGames = useCallback((qCount: number, freq: number) => {
    // Arcade can appear after every `freq` questions, but NOT in the last 5 questions before final leaderboard.
    // So available arcade positions are at question multiples of freq, up to (qCount - 5).
    return Math.max(0, Math.floor((qCount - 5) / freq))
  }, [])

  const maxArcadeGames = calculateMaxArcadeGames(questionCount, arcadeFrequency)

  useEffect(() => {
    const storedProfile = sessionStorage.getItem('guglioquiz_profile')
    const isHostStored = sessionStorage.getItem('guglioquiz_isHost')
    const savedProfile = localStorage.getItem('guglioquiz_saved_profile')
    
    // Check if this is a new manche
    const codeParam = searchParams.get('code')
    const mancheParam = searchParams.get('manche')
    
    // In manche mode, we don't require stored profile/isHost because they should already exist
    if (codeParam && mancheParam === 'true') {
      setExistingGameCode(codeParam)
      setIsMancheMode(true)
      
      // Ensure isHost is set for manche mode
      sessionStorage.setItem('guglioquiz_isHost', 'true')
      
      // Reset all players' ready state immediately when host enters settings
      // Explicitly clear topics so host starts with a blank slate (not old manche topics)
      setSelectedTopics([])
      setMixMode(false)

      getGameByCode(codeParam).then(game => {
        if (game) {
          setGame(game)
          resetPlayersForNewManche(game.id, false)
          getPlayers(game.id).then(setPlayers)
        }
      })
      
      // Try to load profile from sessionStorage (must exist for host)
      if (storedProfile) {
        setProfile(JSON.parse(storedProfile))
      } else {
        router.push('/')
        return
      }
    } else {
      // Normal mode - require profile and host status
      if (!storedProfile || isHostStored !== 'true') {
        router.push('/')
        return
      }
      setProfile(JSON.parse(storedProfile))
    }
  }, [router, searchParams])

  // Subscribe to game updates for collaborative topic selection
  useEffect(() => {
    if (!game?.id) return
    
    const channel = subscribeToGame(game.id, (updatedGame) => {
      setGame(updatedGame)
      // Sync topics from DB when in collaborative mode (update regardless of length)
      if (isTopicSelectionActiveRef.current) {
        setSelectedTopics(updatedGame.topics as Topic[])
      }
    })
    
    const playersChannel = subscribeToPlayers(game.id, (updatedPlayers) => {
      setPlayers(updatedPlayers)
      
      // Check if all non-host players have confirmed their topics during collaborative selection
      if (isTopicSelectionActiveRef.current && gameRef.current?.topic_selection_mode) {
        const nonHostPlayers = updatedPlayers.filter(p => !p.is_host)
        const allConfirmed = nonHostPlayers.length > 0 && nonHostPlayers.every(p => p.topics_confirmed)
        
        if (allConfirmed) {
          // Auto-close collaborative selection
          setIsTopicSelectionActive(false)
          setTopicSelectionModeInDb(game.id, null)
          toast.success('Tutti i giocatori hanno confermato i loro argomenti!')
        }
      }
    })
    
    return () => {
      unsubscribe(channel)
      unsubscribe(playersChannel)
    }
  }, [game?.id])

  // Limit arcade games when max changes
  useEffect(() => {
    if (selectedArcadeGames.length > maxArcadeGames) {
      setSelectedArcadeGames(prev => prev.slice(0, maxArcadeGames))
    }
  }, [maxArcadeGames, selectedArcadeGames.length])

  const handleTopicToggle = async (topic: Topic) => {
    if (mixMode) return
    
    // If collaborative selection is closed, and the host clicks a client-selected topic,
    // they want to deselect it. Remove it from any client's DB record.
    if (!isTopicSelectionActive) {
      const clientsWithTopic = players.filter(p => !p.is_host && p.selected_topics?.includes(topic))
      if (clientsWithTopic.length > 0) {
        for (const client of clientsWithTopic) {
          const newClientTopics = client.selected_topics!.filter(t => t !== topic)
          await updatePlayerTopics(client.id, newClientTopics)
        }
        setPlayers(prev => prev.map(p => 
          clientsWithTopic.some(c => c.id === p.id)
            ? { ...p, selected_topics: p.selected_topics!.filter(t => t !== topic) }
            : p
        ))
        return
      }
    }

    const newTopics = selectedTopics.includes(topic)
      ? selectedTopics.filter(t => t !== topic)
      : [...selectedTopics, topic]
    
    setSelectedTopics(newTopics)
    
    // If in manche mode with active collaborative selection, sync to DB
    if (isMancheMode && game && isTopicSelectionActive) {
      await updateGameTopics(game.id, newTopics)
    }
  }

  const handleMixToggle = async () => {
    const newMixMode = !mixMode
    setMixMode(newMixMode)
    
    const newTopics = newMixMode ? [...TOPICS] : []
    setSelectedTopics(newTopics)
    
    if (isMancheMode && game && isTopicSelectionActive) {
      await updateGameTopics(game.id, newTopics)
    }
  }

  const handleArcadeToggle = (game: ArcadeGame) => {
    setSelectedArcadeGames(prev => {
      if (prev.includes(game)) {
        return prev.filter(g => g !== game)
      } else {
        // Only add if under max limit
        if (prev.length < maxArcadeGames) {
          return [...prev, game]
        }
        toast.error(`Puoi selezionare massimo ${maxArcadeGames} giochi arcade con ${questionCount} domande`)
        return prev
      }
    })
  }

  const handleStartCollaborativeSelection = async (mode: '1' | '2') => {
    if (!game) return
    
    setIsTopicSelectionActive(true)
    // Clear current topics and sync to DB so clients see empty state
    setSelectedTopics([])
    setMixMode(false)
    await updateGameTopics(game.id, [])
    await setTopicSelectionModeInDb(game.id, mode)
    // Reset all players' topics_confirmed status and manche_ready
    await resetAllPlayersTopicsConfirmed(game.id)
    await setMancheReady(game.id, false)
    
    toast.success(`Selezione collaborativa attivata! Ogni giocatore può scegliere ${mode} argomento/i`)
  }

  const handleStopCollaborativeSelection = async () => {
    if (!game) return
    setIsTopicSelectionActive(false)
    await setTopicSelectionModeInDb(game.id, null)
  }

  const handleToggleCollaborative = async (mode: '1' | '2') => {
    if (isTopicSelectionActive && topicSelectionMode === mode) {
       // Stop
       setTopicSelectionMode('off')
       await handleStopCollaborativeSelection()
    } else {
       // Start or Switch
       if (isTopicSelectionActive) {
         await handleStopCollaborativeSelection()
       }
       setTopicSelectionMode(mode)
       await handleStartCollaborativeSelection(mode)
    }
  }

  const handleCreateGame = async () => {
    if (!profile) return
    if (!mixMode && selectedTopics.length === 0) {
      toast.error('Seleziona almeno un argomento')
      return
    }

    setIsLoading(true)

    const settings: GameSettings = {
      topics: selectedTopics,
      questionCount,
      difficulty,
      maxAbstentions,
      gameProfile,
      arcadeGames: arcadeEnabled && selectedArcadeGames.length > 0 ? selectedArcadeGames : undefined,
      arcadeFrequency: arcadeEnabled && selectedArcadeGames.length > 0 ? arcadeFrequency : undefined,
      enableAudioQuestions,
    }

    const generateUUID = () => {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID()
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    }

    setIsLoading(true)

    try {
      if (isMancheMode && existingGameCode) {
        // Update existing game for new manche
        const existingGame = await getGameByCode(existingGameCode)
        if (!existingGame) {
          toast.error('Partita esistente non trovata')
          setIsLoading(false)
          return
        }

        await updateGameSettings(existingGame.id, settings)
        await updateGameStatus(existingGame.id, 'lobby')
        await setMancheReady(existingGame.id, true)
        
        sessionStorage.setItem('guglioquiz_gameCode', existingGameCode)
        router.push(`/lobby/${existingGameCode}`)
      } else {
        // Create new game - generate a unique host ID
        const hostId = generateUUID()
        const newGame = await createGame(hostId, settings)
        if (!newGame) {
          toast.error('Errore nella creazione della partita (nessun oggetto restituito)')
          setIsLoading(false)
          return
        }

        // Add host as first player
        const player = await addPlayer(
          newGame.id,
          profile.name,
          profile.avatar,
          profile.avatarUrl || null,
          true
        )

        if (player) {
          sessionStorage.setItem('guglioquiz_playerId', player.id)
          sessionStorage.setItem('guglioquiz_gameCode', newGame.code)
          router.push(`/lobby/${newGame.code}`)
        } else {
          toast.error('Errore durante la creazione del giocatore host (nessun giocatore restituito)')
          setIsLoading(false)
          return
        }
      }
    } catch (error: any) {
      console.error('[v0] Error creating game:', error)
      const errorName = error?.name || 'Error'
      const errorMsg = error?.message || (typeof error === 'string' ? error : 'Errore sconosciuto')
      toast.error(`Errore (${errorName}): ${errorMsg}`)
      setIsLoading(false)
    }
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </main>
    )
  }

  // Full-screen loading while creating/updating the manche
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
          <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
        </div>
        <p className="text-muted-foreground text-lg">
          {isMancheMode ? 'Aggiornamento manche...' : 'Creazione manche in corso...'}
        </p>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/')}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isMancheMode ? 'Nuova Manche' : 'Impostazioni Partita'}
            </h1>
            <p className="text-muted-foreground">
              {isMancheMode ? 'Configura le impostazioni per la nuova manche' : 'Configura le regole del quiz'}
            </p>
          </div>
        </div>

        {/* Game Profile */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Profilo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={gameProfile}
              onValueChange={(v) => setGameProfile(v as GameProfile)}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="timed" id="profile-timed" className="peer sr-only" />
                <Label
                  htmlFor="profile-timed"
                  className="flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all peer-data-[state=checked]:bg-primary peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary-foreground bg-muted border-border text-foreground hover:border-primary/50"
                >
                  <span className="font-bold">A Tempo</span>
                  <span className="text-[10px] opacity-70 text-center">15s, Punteggio dinamico</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="untimed" id="profile-untimed" className="peer sr-only" />
                <Label
                  htmlFor="profile-untimed"
                  className="flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all peer-data-[state=checked]:bg-primary peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary-foreground bg-muted border-border text-foreground hover:border-primary/50"
                >
                  <span className="font-bold">Senza Tempo</span>
                  <span className="text-[10px] opacity-70 text-center">+300/-150 fisso</span>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Topics */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Settings2 className="h-5 w-5 text-primary" />
              Argomenti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">


            {/* Mix mode toggle */}
            <Button
              onClick={handleMixToggle}
              variant="outline"
              className={`w-full justify-start ${mixMode ? 'border-primary text-primary' : ''}`}
            >
              <Shuffle className="mr-2 h-4 w-4" />
              Mix - Tutti gli argomenti
            </Button>

            {/* Individual topics */}
            <div className="grid grid-cols-2 gap-3">
              {TOPICS.map((topic) => {
                const Icon = TOPIC_ICONS[topic] || BookOpen
                // Find if any client has selected this topic
                const clientSelections = players.filter(p => !p.is_host && p.selected_topics?.includes(topic))
                const isClientSelected = clientSelections.length > 0
                
                return (
                  <div
                    key={topic}
                    onClick={() => {
                      if (mixMode) return;
                      // Host cannot toggle topics selected by clients during active selection
                      if (isTopicSelectionActive && isClientSelected) return;
                      handleTopicToggle(topic);
                    }}
                    style={isClientSelected ? { borderWidth: '2px', borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)', boxShadow: '0 0 20px rgba(34,197,94,0.4)' } : {}}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border-2 transition-all relative
                      ${mixMode ? 'cursor-not-allowed opacity-50' : (isTopicSelectionActive && isClientSelected) ? 'cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'}
                      ${isClientSelected
                        ? '' // Styles applied via style prop to bypass JIT compilation issues
                        : (selectedTopics.includes(topic) || mixMode)
                          ? 'bg-primary/20 border-primary shadow-[0_0_10px_rgba(var(--primary),0.1)]'
                          : 'bg-muted/50 border-border'
                      }
                    `}
                  >
                    <Icon className={`h-4 w-4 ${isClientSelected ? 'text-green-500' : (selectedTopics.includes(topic) || mixMode) ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-sm ${(isClientSelected || selectedTopics.includes(topic) || mixMode) ? 'text-foreground font-medium' : 'text-foreground'}`}>{TOPIC_LABELS[topic]}</span>
                    
                    {isClientSelected && (
                      <div className="absolute top-1 right-1 flex -space-x-1">
                        {clientSelections.slice(0, 2).map(p => (
                          <div key={p.id} className={`w-5 h-5 rounded-full border border-background overflow-hidden flex items-center justify-center text-[9px] font-bold shadow-[0_0_6px_rgba(34,197,94,0.8)] ${p.avatar_url ? 'bg-transparent' : (p.avatar ? parseAvatar(p.avatar)?.bg || 'bg-green-500' : 'bg-green-500')}`} title={p.name}>
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : p.avatar ? (
                              <span className={p.avatar.startsWith('initial:') ? 'text-[8px] font-black' : 'text-[10px]'}>{parseAvatar(p.avatar)?.icon}</span>
                            ) : (
                              <span className="text-white">{p.name.charAt(0)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Collaborative topic selection (only in manche mode) */}
            {isMancheMode && (
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Selezione collaborativa
                    </Label>
                    <p className="text-xs text-muted-foreground mt-4">
                      Permetti ai giocatori di scegliere gli argomenti in tempo reale
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {isTopicSelectionActive && (
                      <Badge className="bg-primary text-primary-foreground animate-pulse">LIVE</Badge>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const willBeOpen = !isCollaborativeSectionOpen;
                        setIsCollaborativeSectionOpen(willBeOpen);
                        if (!willBeOpen && isTopicSelectionActive) {
                          await handleStopCollaborativeSelection();
                          setTopicSelectionMode('off');
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        isCollaborativeSectionOpen ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          isCollaborativeSectionOpen ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                
                {isCollaborativeSectionOpen && (
                  <div className="pt-2 space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        onClick={() => handleToggleCollaborative('1')}
                        className={`
                          p-4 rounded-xl border-2 cursor-pointer transition-all relative
                          ${isTopicSelectionActive && topicSelectionMode === '1'
                            ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.1)]' 
                            : 'border-border bg-card hover:border-primary/50'
                          }
                        `}
                      >
                        <div className="flex flex-col items-center justify-center gap-1 text-center">
                          <span className="font-bold text-lg">1 a testa</span>
                          <span className="text-xs text-muted-foreground">I giocatori scelgono 1 argomento</span>
                        </div>
                      </div>

                      <div
                        onClick={() => handleToggleCollaborative('2')}
                        className={`
                          p-4 rounded-xl border-2 cursor-pointer transition-all relative
                          ${isTopicSelectionActive && topicSelectionMode === '2'
                            ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.1)]' 
                            : 'border-border bg-card hover:border-primary/50'
                          }
                        `}
                      >
                        <div className="flex flex-col items-center justify-center gap-1 text-center">
                          <span className="font-bold text-lg">2 a testa</span>
                          <span className="text-xs text-muted-foreground">I giocatori scelgono 2 argomenti</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Always show counters if a mode was selected or active */}
                    {topicSelectionMode !== 'off' && (
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Client Pronti</span>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="text-lg font-bold">
                              {players.filter(p => !p.is_host && p.topics_confirmed).length} 
                              <span className="text-muted-foreground font-normal"> / {players.filter(p => !p.is_host).length}</span>
                            </span>
                          </div>
                        </div>
                        
                        <div className="space-y-1 border-l pl-4 border-border">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Totale Argomenti Client</span>
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-primary" />
                            <span className="text-lg font-bold text-foreground">
                              {players.filter(p => !p.is_host).reduce((acc, p) => acc + (p.selected_topics?.length || 0), 0)}
                              <span className="text-muted-foreground font-normal"> / {players.filter(p => !p.is_host).length * parseInt(topicSelectionMode)}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Question count - moved below topics */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Numero di domande
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={questionCount.toString()}
              onValueChange={(v) => setQuestionCount(parseInt(v))}
              className="flex flex-wrap gap-3"
            >
              {[5, 10, 15, 20, 25].map((count) => (
                <div key={count} className="flex items-center">
                  <RadioGroupItem
                    value={count.toString()}
                    id={`count-${count}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`count-${count}`}
                    className="flex items-center justify-center w-14 h-14 rounded-xl border-2 cursor-pointer transition-all peer-data-[state=checked]:bg-primary peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary-foreground bg-muted border-border text-foreground hover:border-primary/50"
                  >
                    {count}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Arcade Games */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center justify-between text-foreground">
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-primary" />
                Mini-giochi Arcade
                {arcadeEnabled && maxArcadeGames > 0 && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    max {maxArcadeGames}
                  </Badge>
                )}
              </div>
              <button
                type="button"
                onClick={() => setArcadeEnabled(!arcadeEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  arcadeEnabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    arcadeEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {!arcadeEnabled ? (
              <p className="text-sm text-muted-foreground">
                Attiva il toggle per configurare i mini-giochi arcade
              </p>
            ) : questionCount < 10 ? (
              <p className="text-sm text-muted-foreground">
                Seleziona almeno 10 domande per abilitare i mini-giochi arcade
              </p>
            ) : (
              <>
                {/* Frequency selector - always visible when questionCount >= 10 */}
                <div className="pb-3 border-b border-border">
                  <Label className="text-sm text-muted-foreground mb-3 block">
                    Gioca un mini-gioco ogni:
                  </Label>
                  <RadioGroup
                    value={arcadeFrequency.toString()}
                    onValueChange={(v) => setArcadeFrequency(parseInt(v))}
                    className="flex gap-4"
                  >
                    {[5, 10].map((freq) => (
                      <div key={freq} className="flex-1">
                        <RadioGroupItem
                          value={freq.toString()}
                          id={`freq-${freq}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`freq-${freq}`}
                          className="flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer peer-data-[state=checked]:bg-primary peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary-foreground bg-muted border-border text-foreground"
                        >
                          <span className="font-bold">{freq}</span>
                          <span className="text-xs opacity-70">domande</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {maxArcadeGames > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Seleziona fino a {maxArcadeGames} mini-giochi ({selectedArcadeGames.length}/{maxArcadeGames} selezionati)
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Con {questionCount} domande e arcade ogni {arcadeFrequency}, non ci sono slot disponibili per i mini-giochi.
                  </p>
                )}
                
                {/* Arcade games grid - only show when slots available */}
                {maxArcadeGames > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {ARCADE_GAMES.map((arcadeGame) => {
                      const isSelected = selectedArcadeGames.includes(arcadeGame)
                      const isDisabled = !isSelected && selectedArcadeGames.length >= maxArcadeGames
                      
                      return (
                        <div
                          key={arcadeGame}
                          onClick={() => !isDisabled && handleArcadeToggle(arcadeGame)}
                          className={`
                            flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer
                            ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}
                            ${isSelected
                              ? 'bg-primary/20 border-primary'
                              : 'bg-muted/50 border-border'
                            }
                          `}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {ARCADE_GAME_LABELS[arcadeGame]}
                          </span>
                          <span className="text-xs mt-1 text-center text-muted-foreground">
                            {ARCADE_GAME_DESCRIPTIONS[arcadeGame]}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Audio Questions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center justify-between text-foreground">
              <div className="flex items-center gap-2">
                {enableAudioQuestions ? <Volume2 className="h-5 w-5 text-primary" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
                Domande Audio
              </div>
              <button
                type="button"
                onClick={() => setEnableAudioQuestions(!enableAudioQuestions)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enableAudioQuestions ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enableAudioQuestions ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <p className="text-sm text-muted-foreground">
              {enableAudioQuestions
                ? 'Includi clip musicali da riconoscere (topic Musica)'
                : 'Nessuna domanda audio — utile in ambienti rumorosi'}
            </p>
          </CardContent>
        </Card>

        {/* Difficulty */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Difficolta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
              className="flex gap-4"
            >
              <div className="flex-1">
                <RadioGroupItem
                  value="intermedia"
                  id="diff-intermedia"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="diff-intermedia"
                  className="flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all peer-data-[state=checked]:bg-primary peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary-foreground bg-muted border-border text-foreground hover:border-primary/50"
                >
                  <span className="font-bold">Intermedia</span>
                  <span className="text-xs opacity-70">Per tutti</span>
                </Label>
              </div>
              <div className="flex-1">
                <RadioGroupItem
                  value="difficile"
                  id="diff-difficile"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="diff-difficile"
                  className="flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all peer-data-[state=checked]:bg-primary peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary-foreground bg-muted border-border text-foreground hover:border-primary/50"
                >
                  <span className="font-bold">Difficile</span>
                  <span className="text-xs opacity-70">Per esperti</span>
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Abstentions */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <HandHelping className="h-5 w-5 text-primary" />
              Astensioni consentite
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={maxAbstentions.toString()}
              onValueChange={(v) => setMaxAbstentions(parseInt(v))}
              className="flex gap-4"
            >
              {[0, 3, 5].map((count) => (
                <div key={count} className="flex-1">
                  <RadioGroupItem
                    value={count.toString()}
                    id={`abs-${count}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`abs-${count}`}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all peer-data-[state=checked]:bg-primary peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary-foreground bg-muted border-border text-foreground hover:border-primary/50"
                  >
                    <span className="font-bold">{count}</span>
                    <span className="text-xs opacity-70">
                      {count === 0 ? 'Nessuna' : `Max ${count}`}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground mt-3">
              Dopo le astensioni consentite, ogni astensione conta come risposta errata
            </p>
          </CardContent>
        </Card>

        {/* Create button */}
        <Button
          onClick={handleCreateGame}
          disabled={isLoading || (!mixMode && selectedTopics.length === 0)}
          size="lg"
          className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isLoading 
            ? (isMancheMode ? 'Aggiornamento...' : 'Creazione in corso...') 
            : (isMancheMode ? 'Avvia Nuova Manche' : 'Crea Manche')
          }
        </Button>
      </div>
    </main>
  )
}

function LoadingFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-primary animate-spin" />
    </main>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SettingsPageContent />
    </Suspense>
  )
}


