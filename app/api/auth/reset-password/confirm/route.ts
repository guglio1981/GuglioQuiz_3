export const dynamic = 'force-dynamic';
// @ts-nocheck
import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'
import bcrypt from 'bcryptjs'

const pb = getPocketBase();
// @ts-ignore - stubbed

export async function POST(request: Request) {
  try {
    const { username, code, newPassword } = await request.json()

    if (!username || !code || !newPassword) {
      return NextResponse.json(
        { error: 'Tutti i campi sono obbligatori' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'La password deve essere di almeno 6 caratteri' },
        { status: 400 }
      )
    }

    const pb = getPocketBase()

    // Find user
    let user;
    try {
      user = await pb.collection('app_users').getFirstListItem(`username="${username.toLowerCase()}"`)
    } catch (e) {
      return NextResponse.json(
        { error: 'Utente non trovato' },
        { status: 404 }
      )
    }

    // Verify reset code
    let resetData;
    try {
      resetData = await pb.collection('password_resets').getFirstListItem(
        `user_id="${user.id}" && code="${code}" && used=false && expires_at > "${new Date().toISOString().replace('T', ' ')}"`
      )
    } catch (e) {
      // not found
    }

    if (!resetData) {
      return NextResponse.json(
        { error: 'Codice non valido o scaduto' },
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10)

    // Update password
    try {
      await pb.collection('app_users').update(user.id, { password_hash: passwordHash })
    } catch (updateError) {
      return NextResponse.json(
        { error: 'Errore durante l\'aggiornamento della password' },
        { status: 500 }
      )
    }

    // Mark reset code as used
    try {
      await pb.collection('password_resets').update(resetData.id, { used: true })
    } catch (e) {
      console.error('Error marking reset as used:', e)
    }

    return NextResponse.json({ message: 'Password aggiornata con successo' })
  } catch (error) {
    console.error('Reset password confirm error:', error)
    return NextResponse.json(
      { error: 'Errore durante il reset della password' },
      { status: 500 }
    )
  }
}

