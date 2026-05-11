import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username) {
      return NextResponse.json({ exists: false })
    }

    // Check if username exists in app_users table
    const pb = getPocketBase()
    let exists = false;
    try {
      await pb.collection('app_users').getFirstListItem(`username="${username.toLowerCase().trim()}"`)
      exists = true;
    } catch(e) {
      exists = false;
    }

    return NextResponse.json({ exists })
  } catch (error) {
    console.error('Check username error:', error)
    return NextResponse.json({ exists: false })
  }
}
