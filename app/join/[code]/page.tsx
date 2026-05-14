'use client'
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { getGameByCode, addPlayer } from '@/lib/game-store'
import { ProfileDialog } from '@/components/profile-dialog'
import { RulesDialog } from '@/components/rules-dialog'
import { type PlayerProfile, type Game } from '@/lib/types'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [showProfile, setShowProfile] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [savedProfile, setSavedProfile] = useState<PlayerProfile | null>(null)
  const [user, setUser] = useState<{ username: string; avatar?: string; avatar_url?: string } | null>(null)
  const playerPromiseRef = useRef<Promise<import('@/lib/types').Player | null> | null>(null)

  useEffect(() => {
    // Check if user already has a playerId for this game
    const existingPlayerId = sessionStorage.getItem('guglioquiz_playerId')
    const existingGameCode = sessionStorage.getItem('guglioquiz_gameCode')
    
    if (existingPlayerId && existingGameCode === code.toUpperCase()) {
      // Already joined this game, go directly to lobby
      router.push(`/lobby/${code}`)
      return
    } else if (existingGameCode && existingGameCode !== code.toUpperCase()) {
      // Joining a DIFFERENT game - clear old session to avoid conflicts
      sessionStorage.removeItem('guglioquiz_playerId')
      sessionStorage.removeItem('guglioquiz_gameCode')
    }

    // Load profile from user data if logged in
    const storedUser = localStorage.getItem('guglioquiz_user')
    let userData = null
    if (storedUser) {
      try {
        userData = JSON.parse(storedUser)
        setUser(userData)
        const capitalizedName = userData.username.charAt(0).toUpperCase() + userData.username.slice(1)
        setSavedProfile({
          name: capitalizedName,
          avatar: userData.avatar as any,
          avatarUrl: userData.avatar_url || null
        })
      } catch {
        // Invalid JSON
      }
    } else {
      // Guest -> No memory
      setSavedProfile(null)
      setUser(null)
      localStorage.removeItem('guglioquiz_saved_profile')
    }

    // Load game — retry up to 8 times with growing delay to handle 429s
    const loadGame = async () => {
      let gameData = null
      let retries = 8
      while (retries > 0 && !gameData) {
        try {
          gameData = await getGameByCode(code.toUpperCase())
        } catch {
          // getGameByCode already retries internally; if it throws, wait and try again
        }
        if (!gameData) {
          retries--
          if (retries > 0) await new Promise(r => setTimeout(r, 800))
        }
      }

      if (!gameData) {
        toast.error('Partita non trovata. Controlla il codice e riprova.')
        router.push('/')
        return
      }

      if (gameData.status !== 'lobby') {
        toast.error('La partita è già iniziata')
        router.push('/')
        return
      }

      setGame(gameData)
      setLoading(false)
      setShowProfile(true)
    }

    loadGame()
  }, [code, router])

  const handleProfileSubmit = (profile: PlayerProfile) => {
    if (!game) return

    // For logged-in users, use their profile avatar
    const finalProfile = user ? {
      name: user.username,
      avatar: user.avatar as import('@/lib/types').AvatarId || profile.avatar,
      avatarUrl: user.avatar_url || profile.avatarUrl
    } : profile

    setSavedProfile(finalProfile)

    // Start addPlayer in background — don't await, so rules dialog shows immediately
    playerPromiseRef.current = addPlayer(game.id, finalProfile.name, finalProfile.avatar, finalProfile.avatarUrl || null, false)

    // Show rules dialog right away without waiting for the server
    setShowProfile(false)
    setShowRules(true)
  }

  const handleAcceptRules = async () => {
    if (!game || !savedProfile) return
    setShowRules(false)
    try {
      // By now addPlayer has had the entire rules-reading time to complete
      const player = await playerPromiseRef.current
      if (!player) {
        toast.error('Errore durante l\'accesso alla partita')
        return
      }
      sessionStorage.setItem('guglioquiz_playerId', player.id)
      sessionStorage.setItem('guglioquiz_profile', JSON.stringify(savedProfile))
      sessionStorage.setItem('guglioquiz_isHost', 'false')
      sessionStorage.setItem('guglioquiz_gameCode', game.code)
      router.push(`/lobby/${code}`)
    } catch (error) {
      console.error('Error joining game:', error)
      toast.error('Errore durante l\'accesso alla partita')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-48 h-48 flex items-center justify-center mx-auto">
            <div className="absolute inset-0 rounded-full border-[8px] border-primary border-t-transparent animate-spin" />
            <img src="/logo-gq.png" alt="GQ" className="w-44 h-44 rounded-full" />
          </div>
          <p className="text-muted-foreground">Caricamento partita...</p>
        </div>
      </div>
    )
  }

  const profileForDialog = user ? {
    name: user.username,
    avatar: user.avatar as import('@/lib/types').AvatarId || null,
    avatarUrl: user.avatar_url || null
  } : savedProfile

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <ProfileDialog
        open={showProfile}
        onClose={() => router.push('/')}
        onSubmit={handleProfileSubmit}
        title="Unisciti alla partita"
        description={user ? 'Conferma il tuo profilo per giocare' : 'Scegli un nome e un avatar per giocare'}
        initialProfile={profileForDialog}
        lockedName={user?.username || null}
        lockedAvatar={!!user && !!(user.avatar || user.avatar_url)}
      />
      
      <RulesDialog open={showRules} onAccept={handleAcceptRules} gameProfile={(game?.game_profile as 'timed' | 'untimed') || 'timed'} />
    </div>
  )
}
