export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getPocketBase } from '@/lib/pocketbase'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Nome utente e password sono obbligatori' },
        { status: 400 }
      )
    }

    const pb = getPocketBase()
    let user;
    try {
      user = await pb.collection('app_users').getFirstListItem(`username="${username.toLowerCase()}"`)
    } catch(e) {
      return NextResponse.json(
        { error: 'Nome utente o password errati' },
        { status: 401 }
      )
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash)

    if (!validPassword) {
      return NextResponse.json(
        { error: 'Nome utente o password errati' },
        { status: 401 }
      )
    }

    // Generate new session token - this invalidates previous sessions
    const sessionToken = crypto.randomUUID()
    
    // Update user with new session token
    await pb.collection('app_users').update(user.id, { session_token: sessionToken })

    // Return user without password hash, with session token
    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        avatar_url: user.avatar_url,
        email: user.email,
        session_token: sessionToken
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Errore interno del server' },
      { status: 500 }
    )
  }
}

