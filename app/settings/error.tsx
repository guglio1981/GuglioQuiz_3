'use client'

import { useEffect } from 'react'

export default function SettingsError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error('Settings page error:', error)
  }, [error])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <h2 className="text-xl font-bold text-destructive">Errore nella pagina impostazioni</h2>
      <pre className="text-xs bg-muted p-4 rounded max-w-lg overflow-auto whitespace-pre-wrap">{error?.message || 'Errore sconosciuto'}</pre>
      {error?.stack && <pre className="text-xs bg-muted p-4 rounded max-w-lg overflow-auto whitespace-pre-wrap opacity-60">{error.stack}</pre>}
      <button onClick={reset} className="px-4 py-2 bg-primary text-white rounded">Riprova</button>
    </main>
  )
}
