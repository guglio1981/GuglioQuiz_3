export const dynamic = 'force-dynamic';
// @ts-nocheck
import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

const pb = getPocketBase();
// @ts-ignore - stubbed

export async function POST(request: Request) {
  try {
    const { userId, sessionToken } = await request.json()

    if (!userId || !sessionToken) {
      return NextResponse.json(
        { error: 'Parametri mancanti' },
        { status: 400 }
      )
    }

    const pb = getPocketBase()

    // Verify user and session token
    let user;
    try {
      user = await pb.collection('app_users').getOne(userId)
    } catch (e) {
      return NextResponse.json(
        { error: 'Utente non trovato' },
        { status: 404 }
      )
    }

    if (!user || user.session_token !== sessionToken) {
      return NextResponse.json(
        { error: 'Non autorizzato' },
        { status: 401 }
      )
    }

    // Delete user
    try {
      await pb.collection('app_users').delete(userId)
    } catch (error) {
      console.error('Error deleting user:', error)
      return NextResponse.json(
        { error: 'Errore durante l\'eliminazione del profilo' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete profile error:', error)
    return NextResponse.json(
      { error: 'Errore interno del server' },
      { status: 500 }
    )
  }
}

