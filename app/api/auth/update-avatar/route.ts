// @ts-nocheck
import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

const pb = getPocketBase();
// @ts-ignore - stubbed

export async function POST(request: Request) {
  try {
    const { userId, avatar, avatarUrl } = await request.json()

    if (!userId || (!avatar && !avatarUrl)) {
      return NextResponse.json(
        { error: 'ID utente e avatar/immagine sono obbligatori' },
        { status: 400 }
      )
    }

    const pb = getPocketBase()

    // Build update object - if avatarUrl is set, clear avatar and vice versa
    const updateData: { avatar?: string | null; avatar_url?: string | null } = {}
    if (avatarUrl) {
      updateData.avatar_url = avatarUrl
      updateData.avatar = null
    } else if (avatar) {
      updateData.avatar = avatar
      updateData.avatar_url = null
    }

    try {
      const updatedUser = await pb.collection('app_users').update(userId, updateData)
      
      return NextResponse.json({ 
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          avatar: updatedUser.avatar,
          avatar_url: updatedUser.avatar_url
        }
      })
    } catch (error) {
      console.error('Error updating avatar:', error)
      return NextResponse.json(
        { error: 'Errore durante l\'aggiornamento dell\'avatar' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Update avatar error:', error)
    return NextResponse.json(
      { error: 'Errore interno del server' },
      { status: 500 }
    )
  }
}
