export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getPocketBase } from '@/lib/pocketbase'

export async function POST(request: Request) {
  try {
    const { username, password, email, avatar, avatarUrl } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Nome utente e password sono obbligatori' },
        { status: 400 }
      )
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Il nome utente deve avere almeno 3 caratteri' },
        { status: 400 }
      )
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'La password deve avere almeno 4 caratteri' },
        { status: 400 }
      )
    }

    const pb = getPocketBase()

    // Check if username already exists
    let existingUser;
    try {
      existingUser = await pb.collection('app_users').getFirstListItem(`username="${username.toLowerCase()}"`)
    } catch(e) {
      // not found
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'Nome utente gia in uso' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    try {
      const newUser = await pb.collection('app_users').create({
        username: username.toLowerCase(),
        password_hash: passwordHash,
        email: email || null,
        avatar: avatar || null,
        avatar_url: avatarUrl || null
      })
      
      return NextResponse.json({ user: newUser })
    } catch(error) {
      console.error('Error creating user:', error)
      return NextResponse.json(
        { error: 'Errore durante la registrazione' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Errore interno del server' },
      { status: 500 }
    )
  }
}

