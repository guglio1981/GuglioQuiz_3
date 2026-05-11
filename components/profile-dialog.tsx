'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AVATARS, AVATAR_COLORS, AVATAR_ICONS, ALL_AVATAR_ICONS, ALL_AVATAR_COLORS, parseAvatar, type AvatarId, type PlayerProfile } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Upload, User, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { compressImage } from '@/lib/image-utils'

interface ProfileDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (profile: PlayerProfile) => void
  title?: string
  description?: string
  initialProfile?: PlayerProfile | null
  lockedName?: string | null // If set, name is not editable (for logged-in users)
  lockedAvatar?: boolean // If true, avatar is not editable (for logged-in users)
}

export function ProfileDialog({
  open,
  onClose,
  onSubmit,
  title = 'Crea il tuo profilo',
  description = 'Scegli un nome e un avatar per giocare',
  initialProfile,
  lockedName,
  lockedAvatar = false,
}: ProfileDialogProps) {
  const formatName = (n: string) => n.charAt(0).toUpperCase() + n.slice(1)
  const [name, setName] = useState(lockedName ? formatName(lockedName) : (initialProfile?.name || ''))
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(initialProfile?.avatar || null)
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(initialProfile?.avatarUrl || null)
  const [isChecking, setIsChecking] = useState(false)
  const [availableAvatars, setAvailableAvatars] = useState<string[]>([])
  const [isLoadingAvatars, setIsLoadingAvatars] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Generate unique avatars
  useEffect(() => {
    if (!open || lockedAvatar) {
      if (!open) setAvailableAvatars([])
      return
    }
    
    // Only fetch if we haven't generated them yet for this dialog open
    if (availableAvatars.length > 0) return

    setIsLoadingAvatars(true)
    fetch('/api/avatars/used')
      .then(res => res.json())
      .then(data => {
        const used = new Set<string>(data.used || [])
        const generated: string[] = []
        const usedColors = new Set<string>()
        const usedIcons = new Set<string>()

        // Generate 10 unique avatars
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
        // Fallback to static if error
        setAvailableAvatars([...AVATARS])
        setIsLoadingAvatars(false)
      })
  }, [open, lockedAvatar, availableAvatars.length])

  useEffect(() => {
    if (lockedName) {
      setName(formatName(lockedName))
    } else if (initialProfile) {
      setName(initialProfile.name || '')
    }
    if (initialProfile) {
      setSelectedAvatar(initialProfile.avatar || null)
      setCustomAvatarUrl(initialProfile.avatarUrl || null)
    }
  }, [initialProfile, lockedName])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("L'immagine deve essere inferiore a 10MB")
        return
      }
      try {
        const compressedBase64 = await compressImage(file, 400, 400, 0.7)
        setCustomAvatarUrl(compressedBase64)
        setSelectedAvatar(null)
      } catch (error) {
        console.error('Error compressing image:', error)
        toast.error("Errore durante l'elaborazione dell'immagine")
      }
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    if (!selectedAvatar && !customAvatarUrl) return

    // If user is not logged in (no lockedName), check if username is already taken
    if (!lockedName) {
      setIsChecking(true)
      try {
        const response = await fetch('/api/auth/check-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name.trim() })
        })
        const data = await response.json()
        
        if (data.exists) {
          toast.error('Questo nome utente e gia registrato. Scegli un altro nome o effettua il login.')
          setIsChecking(false)
          return
        }
      } catch (error) {
        // If check fails, proceed anyway
        console.error('Username check failed:', error)
      }
      setIsChecking(false)
    }

    onSubmit({
      name: name.trim(),
      avatar: selectedAvatar,
      avatarUrl: customAvatarUrl,
    })
  }

  const isValid = name.trim().length > 0 && (selectedAvatar || customAvatarUrl)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-foreground">Nome utente</Label>
            {lockedName ? (
              <div className="space-y-1">
                <p className="text-foreground font-medium text-lg">{name}</p>
                <p className="text-xs text-muted-foreground">Nome utente associato al tuo account</p>
              </div>
            ) : (
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Inserisci il tuo nome utente..."
                maxLength={20}
                className="bg-input border-border text-foreground placeholder:text-muted-foreground"
              />
            )}
          </div>

          {/* Avatar selection */}
          <div className="space-y-3">
            <Label className="text-foreground">
              {lockedAvatar ? 'Il tuo avatar' : 'Scegli un avatar'}
            </Label>
            {lockedAvatar && (initialProfile?.avatar || initialProfile?.avatarUrl) ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center text-5xl font-black',
                    initialProfile?.avatar ? parseAvatar(initialProfile.avatar)?.bg : 'bg-border',
                    initialProfile?.avatar ? parseAvatar(initialProfile.avatar)?.text : 'text-foreground'
                  )}
                >
                  {initialProfile?.avatarUrl ? (
                    <img
                      src={initialProfile.avatarUrl}
                      alt="Avatar"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : initialProfile?.avatar ? (
                    <span className={cn(initialProfile.avatar.startsWith('initial:') ? 'text-6xl font-black leading-none' : 'text-3xl')}>
                      {parseAvatar(initialProfile.avatar)?.icon}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Puoi modificare l&apos;avatar nella tua area privata
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {isLoadingAvatars ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="w-12 h-12 rounded-full bg-muted animate-pulse" />
                  ))
                ) : (
                  availableAvatars.map((avatarStr) => {
                    const parsed = parseAvatar(avatarStr)
                    return (
                      <button
                        key={avatarStr}
                        type="button"
                        onClick={() => {
                          if (!lockedAvatar) {
                            setSelectedAvatar(avatarStr)
                            setCustomAvatarUrl(null)
                          }
                        }}
                        disabled={lockedAvatar}
                        className={cn(
                          'w-12 h-12 rounded-full flex items-center justify-center text-4xl font-black transition-all',
                          parsed?.bg,
                          parsed?.text,
                          selectedAvatar === avatarStr
                            ? 'ring-4 ring-primary ring-offset-2 ring-offset-card scale-110'
                            : 'hover:scale-105',
                          lockedAvatar && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        {parsed?.icon}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Initial-based avatar section */}
          {!lockedAvatar && (
            <div className="space-y-3">
              <Label className="text-foreground">Oppure usa la tua iniziale</Label>
              <div className="grid grid-cols-5 gap-3">
                {ALL_AVATAR_COLORS.slice(0, 10).map((colorObj, idx) => {
                  const initial = name.trim() ? name.trim().charAt(0).toUpperCase() : '?'
                  const avatarStr = `initial:${initial}|${colorObj.bg}`
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedAvatar(avatarStr)
                        setCustomAvatarUrl(null)
                      }}
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center text-3xl font-black transition-all',
                        colorObj.bg,
                        colorObj.text,
                        selectedAvatar === avatarStr
                          ? 'ring-4 ring-primary ring-offset-2 ring-offset-card scale-110'
                          : 'hover:scale-110'
                      )}
                    >
                      {initial}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Custom photo upload - hidden if avatar is locked */}
          {!lockedAvatar && (
            <div className="space-y-3">
              <Label className="text-foreground">Oppure carica una foto</Label>
              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Carica foto
                </Button>
                {customAvatarUrl && (
                  <div className="w-12 h-12 rounded-full overflow-hidden ring-4 ring-primary ring-offset-2 ring-offset-card">
                    <img
                      src={customAvatarUrl}
                      alt="Avatar personalizzato"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-xl">
            <div
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center',
                selectedAvatar ? parseAvatar(selectedAvatar)?.bg : 'bg-border',
                selectedAvatar ? parseAvatar(selectedAvatar)?.text : 'text-foreground'
              )}
            >
              {customAvatarUrl ? (
                <img
                  src={customAvatarUrl}
                  alt="Avatar"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : selectedAvatar ? (
                <span className={cn(selectedAvatar.startsWith('initial:') ? 'text-6xl font-black leading-none' : 'text-3xl')}>
                  {parseAvatar(selectedAvatar)?.icon}
                </span>
              ) : (
                <User className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div className="text-left">
              <p className="font-semibold text-foreground">
                {name || 'Il tuo nome'}
              </p>
              <p className="text-sm text-muted-foreground">Pronto a giocare!</p>
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!isValid || isChecking}
          size="lg"
          className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Verifica...
            </>
          ) : (
            'Continua'
          )}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
