'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html>
      <body style={{margin:0, fontFamily:'monospace', background:'#0a0a0a', color:'#fff', padding:'2rem'}}>
        <h2 style={{color:'#ef4444'}}>Errore applicazione</h2>
        <p style={{background:'#1a1a1a', padding:'1rem', borderRadius:'8px', whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:'14px'}}>
          {error?.message || 'Errore sconosciuto'}
        </p>
        {error?.stack && (
          <pre style={{background:'#1a1a1a', padding:'1rem', borderRadius:'8px', overflow:'auto', fontSize:'12px', opacity:0.7}}>
            {error.stack}
          </pre>
        )}
        <p style={{fontSize:'12px', color:'#888'}}>digest: {error?.digest}</p>
        <button onClick={reset} style={{marginTop:'1rem', padding:'0.5rem 1rem', background:'#6366f1', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer'}}>
          Riprova
        </button>
      </body>
    </html>
  )
}
