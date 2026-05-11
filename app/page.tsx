'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ProfileDialog } from '@/components/profile-dialog'
import { RulesDialog } from '@/components/rules-dialog'
import { IOSInstallPrompt } from '@/components/ios-install-prompt'
import { createGame, addPlayer, getGameByCode, getPlayers } from '@/lib/game-store'
import type { PlayerProfile } from '@/lib/types'
import { parseAvatar, ALL_AVATAR_ICONS, ALL_AVATAR_COLORS, AVATARS } from '@/lib/types'
import { compressImage } from '@/lib/image-utils'
import { toast } from 'sonner'
import { Zap, Users, Trophy, Brain, Loader2, LogIn, Bell, BellOff, LogOut, Upload } from 'lucide-react'
import Link from 'next/link'
import { setupPushNotifications, isPushEnabled, forceUpdateServiceWorker, isNotificationDenied, unsubscribeFromPush } from '@/lib/push-notifications'

function HomePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [joinCode, setJoinCode] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [pendingGameCode, setPendingGameCode] = useState<string | null>(null)
  const [pendingGameProfile, setPendingGameProfile] = useState<'timed' | 'untimed'>('timed')
  const [isLoading, setIsLoading] = useState(false)
  const [savedProfile, setSavedProfile] = useState<PlayerProfile | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [pendingLobbyRedirect, setPendingLobbyRedirect] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; username: string; avatar: string | null; avatar_url?: string | null } | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushDenied, setPushDenied] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request')
  const [newPassword, setNewPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupAvatar, setSignupAvatar] = useState<string | null>(null)
  const [signupAvatarUrl, setSignupAvatarUrl] = useState<string | null>(null)
  const [signupAvatarFile, setSignupAvatarFile] = useState<File | null>(null)
  const signupFileInputRef = useRef<HTMLInputElement>(null)
  const [availableAvatars, setAvailableAvatars] = useState<string[]>([])
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(false)

  // Generate unique avatars for signup
  useEffect(() => {
    if (!showSignUp) {
      setAvailableAvatars([])
      return
    }
    
    // Only fetch if we haven't generated them yet
    if (availableAvatars.length > 0) return

    setIsLoadingAvatars(true)
    fetch('/api/avatars/used')
      .then(res => res.json())
      .then(data => {
        const used = new Set<string>(data.used || [])
        const generated: string[] = []
        const usedColors = new Set<string>()
        const usedIcons = new Set<string>()

        while (generated.length < 10) {
          const randomIcon = ALL_AVATAR_ICONS[Math.floor(Math.random() * ALL_AVATAR_ICONS.length)]
          const randomColor = ALL_AVATAR_COLORS[Math.floor(Math.random() * ALL_AVATAR_COLORS.length)]
          const combination = `${randomIcon}|${randomColor.bg}`

          if (!used.has(combination) && !usedIcons.has(randomIcon) && !usedColors.has(randomColor.bg)) {
            generated.push(combination)
            usedIcons.add(randomIcon)
            usedColors.add(randomColor.bg)
          }
        }
        setAvailableAvatars(generated)
        setIsLoadingAvatars(false)
      })
      .catch(err => {
        console.error('Failed to fetch used avatars:', err)
        setAvailableAvatars([...AVATARS])
        setIsLoadingAvatars(false)
      })
  }, [showSignUp, availableAvatars.length])

// Read code from URL when searchParams changes
  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    if (codeFromUrl) {
      setJoinCode(codeFromUrl.toUpperCase())
    }
  }, [searchParams])
  
  // Listen for window focus to detect navigation from service worker
  useEffect(() => {
    const checkUrlForCode = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const codeFromUrl = urlParams.get('code')
      if (codeFromUrl && codeFromUrl.toUpperCase() !== joinCode) {
        setJoinCode(codeFromUrl.toUpperCase())
      }
    }
    
    // Check on focus (when coming from notification click)
    window.addEventListener('focus', checkUrlForCode)
    
    // Also check on visibilitychange (for mobile)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkUrlForCode()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Check immediately on mount
    checkUrlForCode()
    
    return () => {
      window.removeEventListener('focus', checkUrlForCode)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [joinCode])
  
  // Load profile / auth
  useEffect(() => {
    // Check auth status from localStorage
    const storedUser = localStorage.getItem('guglioquiz_user')
    if (!storedUser) {
      // Clear any legacy saved profile for guests
      localStorage.removeItem('guglioquiz_saved_profile')
      setSavedProfile(null)
      setUser(null)
      return
    }

    try {
        const userData = JSON.parse(storedUser)
        
        // Set user immediately
        setUser(userData)
        // Combine user data with saved profile
        const capitalizedName = userData.username.charAt(0).toUpperCase() + userData.username.slice(1)
        setSavedProfile({
          name: capitalizedName,
          avatar: userData.avatar as any,
          avatarUrl: userData.avatar_url || null
        })
        
        // Force update service worker and check push status
        forceUpdateServiceWorker().then(() => {
          isPushEnabled().then(setPushEnabled).catch(() => setPushEnabled(false))
          setPushDenied(isNotificationDenied())
        })
        
        // Verify session is still valid (not logged in elsewhere) - async check
        if (userData.id && userData.session_token) {
          const checkSession = () => {
            const currentStoredUser = localStorage.getItem('guglioquiz_user')
            if (!currentStoredUser) return // Already logged out locally or via another tab
            
            let currentUserData;
            try {
              currentUserData = JSON.parse(currentStoredUser)
            } catch {
              return
            }

            fetch('/api/auth/verify-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                userId: currentUserData.id, 
                sessionToken: currentUserData.session_token 
              })
            })
            .then(res => res.json())
            .then(data => {
              if (!data.valid) {
                // Session invalid - user logged in elsewhere
                localStorage.removeItem('guglioquiz_user')
                setUser(null)
                setSavedProfile(null)
                setPushEnabled(false)
                toast.error('Sei stato disconnesso perché hai effettuato l\'accesso su un altro dispositivo')
              }
            })
            .catch(() => {
              // Network error, keep user logged in
            })
          }
          
          // Check immediately
          checkSession()
          
          // Then check every 10 seconds for real-time logout
          const sessionInterval = setInterval(checkSession, 10000)
          return () => clearInterval(sessionInterval)
        }
      } catch {
        // Invalid JSON, ignore
      }
  }, [])

  const handleCreateGame = () => {
    setIsHost(true)
    setShowProfile(true)
  }

  const handleLogout = async () => {
    // Disable push notifications on logout
    if (pushEnabled) {
      await unsubscribeFromPush()
      setPushEnabled(false)
    }
    // Clear all user data including saved profile for logged users
    localStorage.removeItem('guglioquiz_user')
    localStorage.removeItem('guglioquiz_profile')
    setUser(null)
    setSavedProfile(null)
    toast.success('Disconnesso')
  }

  const handleTogglePush = async () => {
    if (pushEnabled) {
      // Disable notifications
      const success = await unsubscribeFromPush()
      if (success) {
        setPushEnabled(false)
        toast.success('Notifiche disattivate')
      } else {
        toast.error('Errore nella disattivazione delle notifiche')
      }
    } else {
      // Enable notifications
      const result = await setupPushNotifications()
      if (result.success) {
        setPushEnabled(true)
        toast.success('Notifiche attivate!')
      } else if (result.error === 'denied') {
        toast.error(
          'Le notifiche sono state bloccate dalle impostazioni del dispositivo. Per attivarle, vai nelle Impostazioni del browser o del telefono e consenti le notifiche per questo sito.',
          { duration: 8000 }
        )
      } else if (result.error === 'not_logged_in') {
        toast.error('Devi effettuare il login per attivare le notifiche di invito alle partite')
        setShowSignUp(true)
      } else {
        toast.error('Non è stato possibile attivare le notifiche')
      }
    }
  }

  const handleAcceptRules = () => {
    setShowRules(false)
    if (pendingLobbyRedirect) {
      router.push(pendingLobbyRedirect)
      setPendingLobbyRedirect(null)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginUsername || !loginPassword) return

    setLoginLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Errore durante il login')
        setLoginLoading(false)
        return
      }

      // Save user to localStorage
      localStorage.setItem('guglioquiz_user', JSON.stringify(data.user))
      setUser(data.user)
      setSavedProfile({
        name: data.user.username,
        avatar: data.user.avatar as any,
        avatarUrl: data.user.avatar_url || null
      })
      toast.success('Accesso effettuato!')
      setLoginUsername('')
      setLoginPassword('')
    } catch {
      toast.error('Errore di connessione')
    }
    setLoginLoading(false)
  }

  const handleSignupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('L\'immagine deve essere inferiore a 10MB')
        return
      }
      setSignupAvatarFile(file)
      setSignupAvatar(null) // Clear emoji avatar
      try {
        const compressedBase64 = await compressImage(file, 400, 400, 0.7)
        setSignupAvatarUrl(compressedBase64)
      } catch (error) {
        console.error('Error compressing image:', error)
        toast.error("Errore durante l'elaborazione dell'immagine")
      }
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginUsername.trim() || !loginPassword) return
    if (!signupAvatar && !signupAvatarFile) {
      toast.error('Seleziona un avatar o carica una foto profilo')
      return
    }

    setLoginLoading(true)
    try {
      let avatarUrl = null
      
      // Use the pre-compressed base64 URL directly
      if (signupAvatarFile && signupAvatarUrl) {
        avatarUrl = signupAvatarUrl
      }
      
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: loginUsername, 
          password: loginPassword, 
          email: signupEmail || null,
          avatar: signupAvatar,
          avatarUrl: avatarUrl
        })
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Errore durante la registrazione')
        setLoginLoading(false)
        return
      }

      // Save user to localStorage and auto-login
      localStorage.setItem('guglioquiz_user', JSON.stringify(data.user))
      setUser(data.user)
      setSavedProfile({
        name: data.user.username,
        avatar: data.user.avatar as any,
        avatarUrl: data.user.avatar_url || null
      })
      toast.success('Registrazione completata!')
      setShowSignUp(false)
      setLoginUsername('')
      setLoginPassword('')
      setSignupEmail('')
      setSignupAvatar(null)
      setSignupAvatarUrl(null)
      setSignupAvatarFile(null)
    } catch {
      toast.error('Errore di connessione')
    }
    setLoginLoading(false)
  }

  const handleRequestReset = async () => {
    if (!loginUsername.trim()) {
      toast.error('Inserisci il tuo nome utente')
      return
    }
    setLoginLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername })
      })
      const data = await res.json()
      if (res.ok) {
        // Show message and proceed to code entry
        if (data.code) {
          // No email configured - show code directly
          toast.success(`Codice di reset: ${data.code}`)
        } else {
          // Email sent
          toast.success(data.message || 'Codice inviato! Controlla la tua email')
        }
        setResetStep('confirm')
      } else {
        toast.info(data.message || 'Se l\'utente esiste, riceverai un codice')
      }
    } catch {
      toast.error('Errore di connessione')
    }
    setLoginLoading(false)
  }

  const handleConfirmReset = async () => {
    if (!loginUsername.trim() || !resetCode.trim() || !newPassword.trim()) {
      toast.error('Compila tutti i campi')
      return
    }
    if (newPassword.length < 6) {
      toast.error('La password deve essere di almeno 6 caratteri')
      return
    }
    setLoginLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, code: resetCode, newPassword })
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Password aggiornata! Ora puoi accedere')
        setShowResetPassword(false)
        setResetStep('request')
        setResetCode('')
        setNewPassword('')
      } else {
        toast.error(data.error || 'Errore durante il reset')
      }
    } catch {
      toast.error('Errore di connessione')
    }
    setLoginLoading(false)
  }

  const handleJoinGame = async () => {
    if (!joinCode.trim()) {
      toast.error('Inserisci un codice partita')
      return
    }

    setIsLoading(true)
    const game = await getGameByCode(joinCode.trim())
    setIsLoading(false)

    if (!game) {
      toast.error('Partita non trovata')
      return
    }

    if (game.status !== 'lobby') {
      toast.error('La partita e gia iniziata')
      return
    }

    setPendingGameCode(game.code)
    setPendingGameProfile((game.game_profile as 'timed' | 'untimed') || 'timed')
    setIsHost(false)
    
    if (user) {
      // Just auto-fill the profile dialog by opening it
      setShowProfile(true)
    } else {
      setShowProfile(true)
    }
  }

  const handleProfileSubmit = async (profile: PlayerProfile) => {
    setIsLoading(true)

    // Set the profile in state for the current session
    setSavedProfile(profile)
    
    // Also update avatar in user record if logged in
    if (user) {
      const updatedUser = { ...user, avatar: profile.avatar }
      localStorage.setItem('guglioquiz_user', JSON.stringify(updatedUser))
      setUser(updatedUser)
    }

    try {
      if (isHost) {
        // Store profile in session and redirect to settings
        sessionStorage.setItem('guglioquiz_profile', JSON.stringify(profile))
        sessionStorage.setItem('guglioquiz_isHost', 'true')
        router.push('/settings')
      } else if (pendingGameCode) {
        // Join existing game
        const game = await getGameByCode(pendingGameCode)
        if (!game) {
          toast.error('Partita non trovata')
          setIsLoading(false)
          return
        }

        // Double-check that game is still in lobby (not started)
        if (game.status !== 'lobby') {
          toast.error('La partita è già in corso, non puoi unirti')
          setIsLoading(false)
          setShowProfile(false)
          return
        }

        // Check for duplicate name, avatar or photo
        const existingPlayers = await getPlayers(game.id)
        const duplicateName = existingPlayers.some(p => p.name.toLowerCase() === profile.name.toLowerCase())
        if (duplicateName) {
          toast.error('Esiste già un giocatore con questo nome. Scegline un altro.')
          setIsLoading(false)
          return
        }
        
        if (profile.avatar) {
          const duplicateAvatar = existingPlayers.some(p => p.avatar === profile.avatar)
          if (duplicateAvatar) {
            toast.error('Esiste già un giocatore con questo avatar. Scegline un altro.')
            setIsLoading(false)
            return
          }
        }

        if (profile.avatarUrl) {
          const duplicatePhoto = existingPlayers.some(p => p.avatar_url === profile.avatarUrl)
          if (duplicatePhoto) {
            toast.error('Esiste già un giocatore con questa foto. Scegline un\'altra.')
            setIsLoading(false)
            return
          }
        }

        const player = await addPlayer(
          game.id,
          profile.name,
          profile.avatar,
          profile.avatarUrl,
          false
        )

        if (!player) {
          toast.error('Errore durante la registrazione')
          setIsLoading(false)
          return
        }

        sessionStorage.setItem('guglioquiz_playerId', player.id)
        sessionStorage.setItem('guglioquiz_gameId', game.id)
        sessionStorage.setItem('guglioquiz_profile', JSON.stringify(profile))
        
        // Show rules popup before going to lobby
        setPendingLobbyRedirect(`/lobby/${game.code}`)
        setShowRules(true)
      }
    } catch {
      toast.error('Si e verificato un errore')
    }

    setIsLoading(false)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md space-y-4 relative z-10">
        {/* Logo and tagline */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-balance">
            <span className="text-primary">Guglio</span>
            <span className="text-foreground">Quiz</span>
          </h1>
          <p className="text-xl text-muted-foreground font-medium text-pretty">
            Rispondi veloce. Vinci tutto.
          </p>
        </div>

        {/* Feature badges */}
        <div className="flex flex-wrap justify-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-full border border-border">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">29 Argomenti</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-full border border-border">
            <Users className="w-4 h-4 text-secondary" />
            <span className="text-sm text-foreground">Multiplayer</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-full border border-border">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-sm text-foreground">15 Secondi</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-card rounded-full border border-border">
            <Trophy className="w-4 h-4 text-chart-4" />
            <span className="text-sm text-foreground">Classifiche</span>
          </div>
        </div>

        {/* Action cards */}
        <div className="space-y-4">
          {/* Create game */}
          <Card className="bg-card border-border overflow-hidden">
            <CardContent className="p-6">
              <Button
                onClick={handleCreateGame}
                disabled={isLoading}
                size="lg"
                className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Crea Partita
              </Button>
              <p className="text-center text-sm text-muted-foreground mt-3">
                Sei l&apos;host? Crea una nuova partita e invita i tuoi amici
              </p>
            </CardContent>
          </Card>

          {/* Join game */}
          <Card className="bg-card border-border overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex gap-3">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Codice partita"
                  maxLength={6}
                  className="flex-1 h-14 text-lg text-center font-mono tracking-widest uppercase bg-input border-border text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  onClick={handleJoinGame}
                  disabled={isLoading || !joinCode.trim()}
                  size="lg"
                  className="h-14 px-8 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Entra
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Hai ricevuto un codice? Inseriscilo qui per unirti alla partita
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Auth section */}
        <Card className="bg-card/50 border-border">
          <CardContent className="p-6">
            {user ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-3">Sei loggato come:</p>
                  <div className="flex flex-col items-center gap-2">
                    {user.avatar_url ? (
                      <div className="w-16 h-16 rounded-full overflow-hidden">
                        <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                      </div>
                    ) : user.avatar ? (
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-5xl font-black ${parseAvatar(user.avatar)?.bg} ${parseAvatar(user.avatar)?.text}`}>
                        {parseAvatar(user.avatar)?.icon}
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <Users className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <span className="text-lg font-semibold text-foreground">
                      {user.username}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Link href="/friends">
                    <Button variant="outline" size="sm">
                      <Users className="h-4 w-4 mr-1" />
                      Profilo
                    </Button>
                  </Link>
<Button
                  variant={pushEnabled ? "default" : pushDenied ? "destructive" : "outline"}
                  size="sm"
                  onClick={handleTogglePush}
                  title={pushEnabled ? "Notifiche attive" : pushDenied ? "Notifiche bloccate - clicca per info" : "Attiva notifiche"}
                  >
                  {pushDenied ? (
                    <BellOff className="h-4 w-4" />
                  ) : (
                    <Bell className={`h-4 w-4 ${pushEnabled ? "text-primary-foreground" : ""}`} />
                  )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={showSignUp ? handleSignUp : handleLogin} className="space-y-4">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-foreground">
                    {showSignUp ? 'Registrati' : 'Accedi'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {showSignUp ? 'Crea il tuo account GuglioQuiz' : 'Accedi al tuo account GuglioQuiz'}
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Nome utente</label>
                    <Input
                      type="text"
                      placeholder="Il tuo nome utente"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="mt-1 h-12 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Password</label>
                    <Input
                      type="password"
                      placeholder="La tua password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="mt-1 h-12 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                  
                  {/* Email field - only shown during signup */}
                  {showSignUp && (
                    <div>
                      <label className="text-sm font-medium text-foreground">Email (per recupero password)</label>
                      <Input
                        type="email"
                        placeholder="La tua email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="mt-1 h-12 text-base bg-input border-border text-foreground placeholder:text-muted-foreground"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Opzionale - usata solo per recuperare la password</p>
                    </div>
                  )}
                  
                  {/* Avatar selection - only shown during signup */}
                  {showSignUp && (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-foreground">
                          Scegli il tuo avatar <span className="text-destructive">*</span>
                        </label>
                        <div className="grid grid-cols-5 gap-2 mt-3">
                          {isLoadingAvatars ? (
                            Array.from({ length: 10 }).map((_, i) => (
                              <div key={i} className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                            ))
                          ) : (
                            availableAvatars.map((avatarStr) => {
                              const parsed = parseAvatar(avatarStr)
                              return (
                                <button
                                  key={avatarStr}
                                  type="button"
                                  onClick={() => {
                                    setSignupAvatar(avatarStr)
                                    setSignupAvatarUrl(null)
                                    setSignupAvatarFile(null)
                                  }}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${parsed?.bg} ${
                                    signupAvatar === avatarStr && !signupAvatarUrl
                                      ? 'ring-2 ring-primary ring-offset-1 ring-offset-card scale-110'
                                      : 'hover:scale-105'
                                  }`}
                                >
                                  {parsed?.icon}
                                </button>
                              )
                            })
                          )}
                        </div>
                        
                        <div className="mt-4">
                          <label className="text-sm font-medium text-foreground">Oppure usa la tua iniziale</label>
                          <div className="grid grid-cols-10 gap-1.5 mt-2">
                            {ALL_AVATAR_COLORS.slice(0, 10).map((colorObj, idx) => {
                              const initial = loginUsername.trim() ? loginUsername.trim().charAt(0).toUpperCase() : '?'
                              const avatarStr = `initial:${initial}|${colorObj.bg}`
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setSignupAvatar(avatarStr)
                                    setSignupAvatarUrl(null)
                                    setSignupAvatarFile(null)
                                  }}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-lg font-black transition-all ${colorObj.bg} ${colorObj.text} ${
                                    signupAvatar === avatarStr && !signupAvatarUrl
                                      ? 'ring-2 ring-primary ring-offset-1 ring-offset-card scale-110'
                                      : 'hover:scale-110'
                                  }`}
                                >
                                  {initial}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 pt-2">
                        <span className="text-sm text-muted-foreground">oppure</span>
                        <input
                          ref={signupFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSignupFileChange}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => signupFileInputRef.current?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Carica foto
                        </Button>
                        {signupAvatarUrl && (
                          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary">
                            <img
                              src={signupAvatarUrl}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90" 
                  disabled={loginLoading || !loginUsername.trim() || !loginPassword}
                >
                  {loginLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <LogIn className="h-5 w-5 mr-2" />
                  )}
                  {showSignUp ? 'Registrati' : 'Accedi'}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  {showSignUp ? 'Hai gia un account? ' : 'Non hai un account? '}
                  <button
                    type="button"
                    onClick={() => setShowSignUp(!showSignUp)}
                    className="text-primary hover:underline font-medium"
                  >
                    {showSignUp ? 'Accedi' : 'Registrati'}
                  </button>
                </p>
                {!showSignUp && (
                  <p className="text-center text-sm">
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(true)}
                      className="text-muted-foreground hover:text-primary hover:underline"
                    >
                      Password dimenticata?
                    </button>
                  </p>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profile dialog */}
      <ProfileDialog
        open={showProfile}
        onClose={() => setShowProfile(false)}
        onSubmit={handleProfileSubmit}
        title={isHost ? 'Crea il tuo profilo Host' : 'Unisciti alla partita'}
        description={
          isHost
            ? user ? 'Conferma il tuo profilo per iniziare' : 'Come host potrai configurare la partita'
            : user ? 'Conferma il tuo profilo per giocare' : 'Scegli un nome e un avatar per giocare'
        }
        initialProfile={user ? {
          name: user.username,
          avatar: (user.avatar as AvatarId) || null,
          avatarUrl: user.avatar_url || null
        } : savedProfile}
        lockedName={user?.username || null}
        lockedAvatar={!!user}
      />

      {/* Rules dialog for clients */}
      <RulesDialog open={showRules} onAccept={handleAcceptRules} gameProfile={pendingGameProfile} />
      
      {/* iOS PWA install prompt for push notifications */}
      <IOSInstallPrompt />
      
      {/* Password Reset Dialog */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-bold text-foreground">
                  {resetStep === 'request' ? 'Recupera Password' : 'Inserisci Codice'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {resetStep === 'request' 
                    ? 'Inserisci il tuo nome utente per ricevere un codice di reset'
                    : 'Inserisci il codice ricevuto e la nuova password'
                  }
                </p>
              </div>
              
              {resetStep === 'request' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Nome utente</label>
                    <Input
                      type="text"
                      placeholder="Il tuo nome utente"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button onClick={handleRequestReset} className="w-full" disabled={loginLoading}>
                    {loginLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Richiedi Codice
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground">Codice di reset</label>
                    <Input
                      type="text"
                      placeholder="123456"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Nuova password</label>
                    <Input
                      type="password"
                      placeholder="Almeno 6 caratteri"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button onClick={handleConfirmReset} className="w-full" disabled={loginLoading}>
                    {loginLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Cambia Password
                  </Button>
                </div>
              )}
              
              <div className="flex justify-between">
                {resetStep === 'confirm' && (
                  <Button variant="ghost" size="sm" onClick={() => setResetStep('request')}>
                    Indietro
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setShowResetPassword(false)
                    setResetStep('request')
                    setResetCode('')
                    setNewPassword('')
                  }}
                  className="ml-auto"
                >
                  Annulla
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function LoadingFallback() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <Loader2 className="w-12 h-12 text-primary animate-spin" />
    </main>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <HomePageContent />
    </Suspense>
  )
}
