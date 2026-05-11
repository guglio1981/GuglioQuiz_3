// @ts-nocheck
import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

const pb = getPocketBase();
// @ts-ignore - stubbed

export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'ID utente obbligatorio' },
        { status: 400 }
      )
    }

    const pb = getPocketBase()

    // Update user email
    try {
      const updatedUser = await pb.collection('app_users').update(userId, { email: email || null })
      
      return NextResponse.json({ 
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          avatar: updatedUser.avatar,
          avatar_url: updatedUser.avatar_url,
          email: updatedUser.email
        }
      })
    } catch (error) {
      console.error('Update email error:', error)
      return NextResponse.json(
        { error: 'Errore durante l\'aggiornamento' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Update email error:', error)
    return NextResponse.json(
      { error: 'Errore del server' },
      { status: 500 }
    )
  }
}
