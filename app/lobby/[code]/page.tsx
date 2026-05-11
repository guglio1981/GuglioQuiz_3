'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getGameByCode, getPlayers, updatePlayerReady, subscribeToGame, subscribeToPlayers, unsubscribe, updateGameStatus, deletePlayer, clearGameSettingsForNewManche, updateGameTopics, setPlayerTopicsConfirmed, toggleGameTopic, updatePlayerTopics } from '@/lib/game-store'
import { TOPIC_LABELS, parseAvatar, ARCADE_GAME_LABELS, TOPICS, type Game, type Player, type AvatarId, type ArcadeGame, type Topic } from '@/lib/types'
import { toast } from 'sonner'
import { 
  Copy, Check, Users, Play, Crown, MessageCircle, X, Bell, Loader2, Settings2, Gamepad2,
  History, Globe, Cpu, Laptop, Zap, Languages, Scale, Tv, Church, Flag, Calculator,
  FileText, BookOpen, Clapperboard, Library, Music, MonitorPlay, Dices, Smile,
  FlaskConical, Trophy, Landmark, Palette, Star, Cat, Car, Image as ImageIcon,
  FlagTriangleRight, Calendar
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

export default function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null)
  const [hasAcceptedRules, setHasAcceptedRules] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [showNotificationModal, setShowNotificationModal] = useState(false)
  const [notifiableUsers, setNotifiableUsers] = useState<Array<{id: string, username: string, avatar: string | null, avatar_url: string | null}>>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [isSendingNotifications, setIsSendingNotifications] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [showTopicSelectionModal, setShowTopicSelectionModal] = useState(false)
  const [mySelectedTopics, setMySelectedTopics] = useState<Topic[]>([])
  const [hasSubmittedTopics, setHasSubmittedTopics] = useState(false)
  const isHostRef = useRef(false)
  const hasSubmittedTopicsRef = useRef(false)

  useEffect(() => {
    const playerId = sessionStorage.getItem('guglioquiz_playerId')
    if (!playerId) {
      router.push('/')
      return
    }
    setCurrentPlayerId(playerId)

    const loadGame = async () => {
      // Small random stagger to prevent simultaneous requests
      const randomStagger = Math.random() * 300
      await new Promise(resolve => setTimeout(resolve, 200 + randomStagger))
      
      // Retry logic for slow connections
      let retries = 5
      let gameData = null
      
      while (retries > 0 && !gameData) {
        gameData = await getGameByCode(code)
        if (!gameData) {
          retries--
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }
      
      if (!gameData) {
        console.log('[v0] Game not found after retries')
        toast.error('Partita non trovata')
        router.push('/')
        return
      }
      let playersData = await getPlayers(gameData.id)
      
      // Check if current player exists in the list
      let currentPlayer = playersData.find(p => p.id === playerId)
      
      // Retry fetching players if current player is not found (PocketBase consistency delay)
      let playerRetries = 5
      while (!currentPlayer && playerRetries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500))
        playersData = await getPlayers(gameData.id)
        currentPlayer = playersData.find(p => p.id === playerId)
        playerRetries--
      }

      if (!currentPlayer) {
        toast.error('Errore: non sei stato registrato correttamente in questa partita')
        router.push('/')
        return
      }

      // Update both states together
      setPlayers(playersData)
      setGame(gameData)
      if (currentPlayer) {
        if (currentPlayer.ready) {
          setHasAcceptedRules(true)
        }
        if (currentPlayer.selected_topics) {
          setMySelectedTopics(currentPlayer.selected_topics as Topic[])
        }
      }
    }

    loadGame()
  }, [code, router])

  // Subscribe to realtime updates
  useEffect(() => {
    if (!game) return

    let pollInterval: NodeJS.Timeout | null = null
    let isRedirecting = false

    // Handler for browser close - only remove player if not navigating to game
    const handleBeforeUnload = () => {
      if (isRedirecting) return // Don't remove player when navigating to game
      const url = `/api/remove-player?playerId=${currentPlayerId}`
      navigator.sendBeacon(url)
    }

    if (currentPlayerId) {
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    // PWA/mobile: force refresh when app comes back to foreground
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && !isRedirecting) {
        // Immediate refresh when user returns to app
        const updatedGame = await getGameByCode(code)
        if (updatedGame) {
          setGame(updatedGame)
          if (updatedGame.status === 'playing') {
            isRedirecting = true
            window.location.href = `/game/${updatedGame.code}`
            return
          }
        }
        const updatedPlayers = await getPlayers(game.id)
        setPlayers(updatedPlayers)
      }
    }
    
    // We don't need to poll players anymore since we have realtime subscriptions,
    // but we might need to refresh occasionally just to be safe
    pollInterval = setInterval(async () => {
      // Just refresh players every 30 seconds as a fallback
      const updatedPlayers = await getPlayers(game.id)
      if (updatedPlayers && updatedPlayers.length > 0) {
        setPlayers(updatedPlayers)
      }
    }, 30000)
    
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const gameChannel = subscribeToGame(game.id, (updatedGame) => {
      setGame(updatedGame)
      
      // If topics were cleared (host interrupted), reset ready state for clients
      if (updatedGame.topics.length === 0) {
        setHasAcceptedRules(false)
      }
      
      if (updatedGame.status === 'playing') {
        // Stop polling and remove beforeunload handler before redirect
        isRedirecting = true
        if (pollInterval) clearInterval(pollInterval)
        window.removeEventListener('beforeunload', handleBeforeUnload)
        // Use window.location for hard navigation to ensure page loads
        window.location.href = `/game/${game.code}`
      }
      
      // Show topic selection modal for non-host players when collaborative selection is active
      // Only show if player hasn't already confirmed their topics
      if (updatedGame.topic_selection_mode && !isHostRef.current && !hasSubmittedTopicsRef.current) {
        setShowTopicSelectionModal(true)
      }
      
      // Hide modal and reset state if collaborative selection was deactivated by host
      if (!updatedGame.topic_selection_mode) {
        setShowTopicSelectionModal(false)
        setMySelectedTopics([])
        setHasSubmittedTopics(false)
        hasSubmittedTopicsRef.current = false
      }
    })

    const playersChannel = subscribeToPlayers(game.id, (updatedPlayers) => {
      setPlayers(updatedPlayers)
      const me = updatedPlayers.find(p => p.id === currentPlayerId)
      if (me && me.selected_topics) {
        setMySelectedTopics(me.selected_topics as Topic[])
      }
    })

    // Poll to check if current player still exists (fallback since DELETE events don't work)
    let disconnectRetries = 0
    const MAX_DISCONNECT_RETRIES = 3
    
    pollInterval = setInterval(async () => {
      // Don't check if we're redirecting to game or coming from new manche
      if (isRedirecting) return
      if (sessionStorage.getItem('guglioquiz_redirecting') === 'true') {
        // Clear the flag now that we're in lobby
        sessionStorage.removeItem('guglioquiz_redirecting')
        return
      }
      
      // Fallback polling for game state (helps mobile clients that miss realtime updates)
      const updatedGame = await getGameByCode(code)
      if (updatedGame) {
        setGame(updatedGame)
        
        // Check if game started (fallback for mobile that missed realtime)
        if (updatedGame.status === 'playing') {
          isRedirecting = true
          if (pollInterval) clearInterval(pollInterval)
          window.removeEventListener('beforeunload', handleBeforeUnload)
          window.location.href = `/game/${updatedGame.code}`
          return
        }
        
        // Handle topic selection modal — only reopen if not yet submitted
        if (updatedGame.topic_selection_mode && !isHostRef.current && !hasSubmittedTopicsRef.current) {
          setShowTopicSelectionModal(true)
        }
        if (!updatedGame.topic_selection_mode) {
          setShowTopicSelectionModal(false)
          hasSubmittedTopicsRef.current = false
        }
      }
      
      const updatedPlayers = await getPlayers(game.id)
      setPlayers(updatedPlayers)
      
      // Check if current player was removed
      const stillExists = updatedPlayers.some(p => p.id === currentPlayerId)
      if (!stillExists && currentPlayerId) {
        // Double-check the redirecting flag before removing
        if (sessionStorage.getItem('guglioquiz_redirecting') === 'true') {
          disconnectRetries = 0
          return
        }
        
        // Increment retry counter - only disconnect after multiple consecutive failures
        disconnectRetries++
        if (disconnectRetries < MAX_DISCONNECT_RETRIES) {
          return
        }
        
        if (pollInterval) clearInterval(pollInterval)
        sessionStorage.clear()
        toast.error('Sei stato rimosso dalla partita')
        // Delay redirect to show toast
        setTimeout(() => {
          window.location.href = '/'
        }, 1500)
      } else {
        // Reset counter if player exists
        disconnectRetries = 0
      }
    }, 1500)

    return () => {
      unsubscribe(gameChannel)
      unsubscribe(playersChannel)
      if (pollInterval) clearInterval(pollInterval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [game?.id, currentPlayerId])

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    toast.success('Codice copiato!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareWhatsApp = () => {
    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${code.toUpperCase()}` : ''
    const message = `Vieni a giocare a GuglioQuiz!\n\nCodice partita: *${code.toUpperCase()}*\n\nClicca qui per entrare:\n${joinUrl}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }
  
  const loadNotifiableUsers = async () => {
    setIsLoadingUsers(true)
    try {
      const res = await fetch('/api/notifications/users')
      const data = await res.json()
      if (res.ok) {
        setNotifiableUsers(data.users || [])
      }
    } catch {
      toast.error('Errore nel caricamento utenti')
    }
    setIsLoadingUsers(false)
  }
  
  const handleOpenNotificationModal = () => {
    setShowNotificationModal(true)
    setSelectedUsers([])
    loadNotifiableUsers()
  }
  
  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }
  
  // Topic selection handlers - real-time sync to DB
  const handleToggleMyTopic = async (topic: Topic, callerIsHost: boolean) => {
    if (!game) return

    const isInGame = game.topics.includes(topic)
    const isMine = mySelectedTopics.includes(topic)
    
    // Find who else (non-host) selected this topic
    const othersWithThisTopic = players.filter(p => !p.is_host && p.id !== currentPlayerId && p.selected_topics?.includes(topic))
    const isHostTopic = isInGame && !isMine && othersWithThisTopic.length === 0

    // If client tries to toggle a host-selected topic, reject
    if (!callerIsHost && isHostTopic) {
      toast.error('Questo argomento è stato scelto dall\'host e non può essere modificato.')
      return
    }

    if (isMine) {
      // Remove from my list
      const newMyTopics = mySelectedTopics.filter(t => t !== topic)
      const success = await updatePlayerTopics(currentPlayerId!, newMyTopics)
      if (success) {
        setMySelectedTopics(newMyTopics)
        // Only remove from global list if NO ONE ELSE has it (including host, but host has no selected_topics. Wait, host topics are just in game.topics. If host selected it, othersWithThisTopic is 0. But wait, if host selected it, we shouldn't let clients modify it anyway, which we checked above! So if we are here, it's NOT a host topic.)
        if (othersWithThisTopic.length === 0) {
          await toggleGameTopic(game.id, topic, 'remove')
        }
      }
    } else if (isInGame && !isMine) {
      // It's selected by someone else (another client or host)
      toast.error('Questo argomento è già stato scelto e non è più disponibile.')
      return
    } else {
      // Not in game at all
      if (!callerIsHost) {
        const maxTopics = parseInt(game.topic_selection_mode || '1')
        if (mySelectedTopics.length >= maxTopics) {
          toast.error(`Puoi selezionare massimo ${maxTopics} argomento/i`)
          return
        }
        const newMyTopics = [...mySelectedTopics, topic]
        const success = await updatePlayerTopics(currentPlayerId!, newMyTopics)
        if (success) setMySelectedTopics(newMyTopics)
      }
      // Always add to global list
      await toggleGameTopic(game.id, topic, 'add')
    }
  }

  const handleCloseTopicModal = async () => {
    if (!currentPlayerId) return
    
    // Mark as submitted in ref immediately to prevent poll from reopening
    hasSubmittedTopicsRef.current = true
    
    // Mark this player as having confirmed their topics
    await setPlayerTopicsConfirmed(currentPlayerId, true)
    
    setHasSubmittedTopics(true)
    setShowTopicSelectionModal(false)
    toast.success('Selezione completata!')
  }
  
  const selectAllUsers = () => {
    if (selectedUsers.length === notifiableUsers.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(notifiableUsers.map(u => u.id))
    }
  }
  
  const handleSendNotifications = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Seleziona almeno un utente')
      return
    }
    
    setIsSendingNotifications(true)
    try {
      const currentPlayer = players.find(p => p.id === currentPlayerId)
      const res = await fetch('/api/notifications/send-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selectedUsers,
          gameCode: code,
          hostName: currentPlayer?.name || 'Un utente'
        })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Notifiche inviate!')
        setShowNotificationModal(false)
      } else {
        toast.error(data.error || 'Errore nell\'invio delle notifiche')
      }
    } catch {
      toast.error('Errore di connessione')
    }
    setIsSendingNotifications(false)
  }

  const handleAcceptRules = async () => {
    if (!currentPlayerId) return
    
    await updatePlayerReady(currentPlayerId, true)
    setHasAcceptedRules(true)
  }

  const handleRemovePlayer = async (playerId: string) => {
    if (!game) return
    const success = await deletePlayer(playerId, game.id)
    if (success) {
      toast.success('Giocatore rimosso')
      // Refresh the list immediately
      const updatedPlayers = await getPlayers(game.id)
      setPlayers(updatedPlayers)
    } else {
      toast.error('Errore nella rimozione del giocatore')
    }
  }

  const handleAbortAndGoToSettings = async () => {
    if (!game) return
    
    // Clear settings so clients see "waiting for host"
    await clearGameSettingsForNewManche(game.id)
    
    // Host goes to settings
    window.location.href = `/settings?code=${game.code}&manche=true`
  }

  const handleStartGame = async () => {
    if (!game) return
    
    const allReady = players.every(p => p.is_host || p.ready)
    if (!allReady) {
      toast.error('Tutti i giocatori devono accettare le regole')
      return
    }

    if (players.length < 1) {
      toast.error('Serve almeno 1 giocatore')
      return
    }

setIsStarting(true)
    await updateGameStatus(game.id, 'playing')
    // Use window.location for hard navigation to ensure page loads
    window.location.href = `/game/${game.code}`
  }

  const currentPlayer = players.find(p => p.id === currentPlayerId)
  const isHost = currentPlayer?.is_host || false
  isHostRef.current = isHost
  const allPlayersReady = players.every(p => p.is_host || p.ready)

  if (!game || !currentPlayerId || players.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-lg">Caricamento lobby...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header with code - only for host */}
        {isHost && (
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader className="pb-1">
              <CardTitle className="text-foreground flex items-center justify-center gap-2">
                <Copy className="h-5 w-5 text-primary" />
                Codice partita
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pt-0 pb-3 text-center">
              <div className="space-y-3">
                <span className="text-4xl font-mono font-bold tracking-widest text-primary block">
                  {code}
                </span>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyCode}
                    className="shrink-0"
                    title="Copia codice"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-accent" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleShareWhatsApp}
                    className="shrink-0"
                    title="Condividi su WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleOpenNotificationModal}
                    className="shrink-0"
                    title="Invia notifica agli utenti"
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Condividi questo codice con i tuoi amici
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game settings summary */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Regole e argomenti
            </CardTitle>
          </CardHeader>
          {isHost && !game.manche_ready ? (
            /* Host waiting view - new manche being configured */
            <CardContent className="p-6">
              <div className="text-center space-y-3">
                <div className="animate-pulse">
                  <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                    <Crown className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <p className="text-muted-foreground">
                  In attesa che l&apos;host configuri la nuova manche...
                </p>
              </div>
            </CardContent>
          ) : !isHost && !game.manche_ready ? (
            /* Client waiting for host to click "avvia nuova manche" */
            <CardContent className="p-6">
              <div className="text-center space-y-3">
                <div className="animate-pulse">
                  <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                    <Crown className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <p className="text-muted-foreground">
                  {game.topic_selection_mode 
                    ? 'Selezione argomenti in corso...'
                    : 'In attesa che l\'host configuri la nuova manche...'}
                </p>
              </div>
            </CardContent>
          ) : game.topics.length === 0 && isHost ? (
            /* Host view when no topics selected yet */
            <CardContent className="p-6">
              <div className="text-center space-y-3">
                <p className="text-muted-foreground">
                  Nessun argomento selezionato
                </p>
              </div>
            </CardContent>
          ) : (
            /* Show rules when topics are set */
            <CardContent className="space-y-4 pt-0">

              {/* Paragrafo 1: Domande — giallo */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Domande</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-foreground">
                    {game.question_count} domande
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-foreground">
                    {game.difficulty === 'difficile' ? 'Difficile' : 'Intermedia'}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-foreground">
                    {game.max_abstentions} {game.max_abstentions === 1 ? 'astensione' : 'astensioni'}
                  </Badge>
                </div>
              </div>
              {/* Paragrafo 1.5: Profilo — viola */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#a855f7' }}>Profilo</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-foreground">
                    {game.game_profile === 'untimed' ? 'Senza Tempo' : 'A Tempo'}
                  </Badge>
                </div>
              </div>

              {/* Paragrafo 2: Argomenti — verde */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-500">Argomenti</p>
                  {game.topic_selection_mode && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 border-green-500/30 animate-pulse">
                      Live
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {game.topics.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Nessun argomento selezionato</span>
                  ) : game.topics.map((topic) => (
                    <Badge key={topic} variant="outline" className="text-xs bg-green-500/10 border-green-500/30 text-foreground">
                      {TOPIC_LABELS[topic as keyof typeof TOPIC_LABELS]}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Paragrafo 3: Arcade — viola */}
              {game.arcade_games && (game.arcade_games as ArcadeGame[]).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-purple-400">Arcade</p>
                    <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-400/30 text-foreground">
                      ogni {game.arcade_frequency || 5} domande
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(game.arcade_games as ArcadeGame[]).map((arcadeGame) => (
                      <Badge key={arcadeGame} variant="outline" className="text-xs bg-purple-500/10 border-purple-400/30 text-foreground">
                        {ARCADE_GAME_LABELS[arcadeGame]}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Accept button for non-host players */}
              {!isHost && !hasAcceptedRules && (
                <Button
                  onClick={handleAcceptRules}
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Check className="mr-2 h-5 w-5" />
                  Accetto le regole
                </Button>
              )}
            </CardContent>
          )}
        </Card>

        {/* Ready message for host - only show when at least 1 client has joined */}
        {isHost && game.manche_ready && players.filter(p => !p.is_host).length > 0 && (
          <div className={`text-center py-4 px-6 rounded-xl ${allPlayersReady ? 'bg-green-500' : 'bg-destructive'}`}>
            <p className="text-white font-semibold text-lg">
              {allPlayersReady
                ? 'Tutti pronti! Clicca "Inizia Partita" per avviare.'
                : 'In attesa che tutti i giocatori accettino le regole...'}
            </p>
          </div>
        )}

        {/* Ready message for non-host players */}
        {!isHost && hasAcceptedRules && game.manche_ready && (
          <div className={`text-center py-4 px-6 rounded-xl ${allPlayersReady ? 'bg-green-500' : 'bg-destructive'}`}>
            <p className="text-white font-semibold text-lg">
              {allPlayersReady
                ? 'In attesa che l\'host avvii la manche...'
                : 'In attesa che tutti i giocatori accettino le regole...'}
            </p>
          </div>
        )}

        {/* Players list */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Giocatori ({players.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={cn(
                    'flex items-center gap-4 p-3 rounded-xl transition-colors',
                    player.id === currentPlayerId ? 'bg-primary/10' : 'bg-muted'
                  )}
                >
                  {/* Avatar */}
                    <div
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center text-4xl font-black shrink-0',
                        player.avatar_url ? 'bg-transparent' : (player.avatar ? parseAvatar(player.avatar)?.bg || 'bg-muted' : 'bg-muted'),
                        player.avatar && parseAvatar(player.avatar)?.text
                      )}
                    >
                    {player.avatar_url ? (
                      <img src={player.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : player.avatar ? (
                      parseAvatar(player.avatar)?.icon
                    ) : (
                      '?'
                    )}
                  </div>

                  {/* Name and status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">
                        {player.name}
                      </span>
                      {player.is_host && (
                        <Crown className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {player.is_host ? 'Host' : player.ready ? 'Pronto' : 'In attesa'}
                    </span>
                  </div>

                  {/* Ready indicator */}
                  {(player.ready || player.is_host) && (
                    <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0">
                      <Check className="h-4 w-4 text-accent-foreground" />
                    </div>
                  )}

                  {/* Remove button (host only, can't remove self) */}
                  {isHost && !player.is_host && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePlayer(player.id)}
                      className="shrink-0 h-8 w-8 text-destructive hover:bg-destructive/20 hover:text-destructive"
                      title="Rimuovi giocatore"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Start button (host only) */}
            {isHost && (
              <div className="space-y-3 pt-2">
                <Button
                  onClick={handleStartGame}
                  disabled={isStarting || !allPlayersReady || players.length < 2}
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="mr-2 h-5 w-5" />
                  {isStarting ? 'Avvio in corso...' : 'Inizia Partita'}
                </Button>
                <Button
                  onClick={handleAbortAndGoToSettings}
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-purple-600 text-white hover:bg-purple-700"
                >
                  Torna a impostazioni
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Notification User Selection Modal */}
      {showNotificationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md max-h-[80vh] flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Invia notifica</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNotificationModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                Seleziona gli utenti a cui inviare l&apos;invito
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notifiableUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nessun utente ha attivato le notifiche
                </p>
              ) : (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllUsers}
                    className="w-full mb-3"
                  >
                    {selectedUsers.length === notifiableUsers.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                  </Button>
                  {notifiableUsers.map(user => (
                    <div
                      key={user.id}
                      onClick={() => toggleUserSelection(user.id)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                        selectedUsers.includes(user.id)
                          ? 'bg-primary/20 border border-primary'
                          : 'bg-muted/50 hover:bg-muted'
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-sm transition-transform group-hover:scale-110',
                          user.avatar_url ? 'bg-transparent' : (user.avatar ? parseAvatar(user.avatar)?.bg || 'bg-muted' : 'bg-muted')
                        )}
                      >
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                        ) : user.avatar ? (
                          parseAvatar(user.avatar)?.icon
                        ) : (
                          <Users className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <span className="font-medium flex-1">{user.username}</span>
                      {selectedUsers.includes(user.id) && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            {notifiableUsers.length > 0 && (
              <div className="p-4 border-t">
                <Button
                  onClick={handleSendNotifications}
                  disabled={isSendingNotifications || selectedUsers.length === 0}
                  className="w-full"
                >
                  {isSendingNotifications ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Bell className="h-4 w-4 mr-2" />
                  )}
                  Invia a {selectedUsers.length} utent{selectedUsers.length === 1 ? 'e' : 'i'}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
      
      {/* Topic Selection Modal for collaborative selection */}
      {showTopicSelectionModal && game?.topic_selection_mode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden animate-in zoom-in-95 duration-300">
            <CardHeader className="pb-4 bg-gradient-to-r from-primary/10 via-background to-primary/10 border-b border-primary/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Settings2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">Scegli i tuoi argomenti</CardTitle>
                    <CardDescription className="text-sm">
                      Seleziona {game.topic_selection_mode} argomento/i per questa manche
                    </CardDescription>
                  </div>
                </div>
                {isHost && (
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                    Host Mode
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-6">
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 mb-6 p-3 rounded-xl bg-muted/30 border border-border/50 text-xs font-medium">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]"></div>
                  <span>I tuoi</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                  <span>Scelti dagli altri</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30"></div>
                  <span>Disponibili</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {TOPICS.map((topic) => {
                  const isInGame = game.topics.includes(topic)
                  const isMine = mySelectedTopics.includes(topic)
                  // Find who else selected this topic (clients only)
                  const othersWithThisTopic = players.filter(p => !p.is_host && p.id !== currentPlayerId && p.selected_topics?.includes(topic))
                  const isOthers = othersWithThisTopic.length > 0
                  
                  // Topic is unavailable if it's already in the game and not mine
                  const isUnavailable = isInGame && !isMine
                  
                  // Clients cannot click unavailable topics
                  const isClickable = !isUnavailable
                  const Icon = TOPIC_ICONS[topic] || BookOpen

                  return (
                    <button
                      key={topic}
                      onClick={() => isClickable && handleToggleMyTopic(topic, isHost)}
                      disabled={!isClickable}
                      style={isUnavailable ? { borderWidth: '2px', borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)', boxShadow: '0 0 20px rgba(34,197,94,0.4)' } : {}}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border-2 transition-all relative text-left',
                        isClickable ? 'cursor-pointer hover:border-primary/50' : 'cursor-not-allowed',
                        isMine
                          ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]'
                          : isUnavailable
                            ? '' // Styles applied via style prop to bypass JIT compilation issues
                            : 'bg-card border-border hover:border-primary/40'
                      )}
                    >
                      <Icon className={cn(
                        'h-4 w-4 shrink-0',
                        isMine 
                          ? 'text-primary' 
                          : isUnavailable 
                            ? 'text-green-500' 
                            : 'text-muted-foreground'
                      )} />
                      <span className="text-sm font-medium text-foreground">
                        {TOPIC_LABELS[topic]}
                      </span>
                      
                      {/* Show avatars or count of others who picked this */}
                      {isOthers && !isMine && (
                        <div className="absolute top-1 right-1 flex -space-x-1">
                          {othersWithThisTopic.slice(0, 2).map(p => (
                            <div key={p.id} className="w-4 h-4 rounded-full bg-green-500 border border-background flex items-center justify-center text-[8px] text-white font-bold" title={p.name}>
                              {p.name.charAt(0)}
                            </div>
                          ))}
                          {othersWithThisTopic.length > 2 && (
                            <div className="w-4 h-4 rounded-full bg-green-500 border border-background flex items-center justify-center text-[8px] text-white font-bold">
                              +{othersWithThisTopic.length - 2}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {isUnavailable && !isOthers && (
                        <div className="absolute top-1 right-1">
                          <div className="bg-green-500 text-white rounded-full p-0.5 shadow-[0_0_10px_rgba(34,197,94,0.8)]">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </div>
                        </div>
                      )}

                      {isMine && (
                        <div className="absolute top-1 right-1">
                          <div className="bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="h-3 w-3" />
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>

            <div className="p-6 border-t bg-muted/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">I tuoi argomenti</span>
                  <span className="text-lg font-bold">
                    {mySelectedTopics.length} <span className="text-muted-foreground font-normal">/ {game.topic_selection_mode}</span>
                  </span>
                </div>
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden border border-border">
                  <div 
                    className="h-full bg-primary transition-all duration-500 ease-out" 
                    style={{ width: `${(mySelectedTopics.length / parseInt(game.topic_selection_mode || '1')) * 100}%` }}
                  ></div>
                </div>
              </div>

              <Button
                onClick={handleCloseTopicModal}
                disabled={mySelectedTopics.length < parseInt(game.topic_selection_mode || '1')}
                size="lg"
                className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {mySelectedTopics.length < parseInt(game.topic_selection_mode || '1') 
                  ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Seleziona ancora {parseInt(game.topic_selection_mode || '1') - mySelectedTopics.length}</span>
                    </div>
                  )
                  : (
                    <div className="flex items-center gap-2">
                      <Check className="h-6 w-6" />
                      <span>Conferma e Chiudi</span>
                    </div>
                  )
                }
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  )
}
