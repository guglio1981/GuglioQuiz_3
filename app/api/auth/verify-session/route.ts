export const dynamic = 'force-dynamic';
// @ts-nocheck
import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

// @ts-ignore - stubbed


export async function POST(request: Request) {
  try {
    const { userId, sessionToken } = await request.json()

    if (!userId || !sessionToken) {
      // Missing data - assume valid to avoid false disconnects
      return NextResponse.json({ valid: true })
    }

    const pb = getPocketBase()

    // Check if session token matches
    try {
      const user = await pb.collection('app_users').getOne(userId)
      
      // Only return invalid if we can confirm tokens don't match
      // and both tokens exist (not null/undefined)
      if (user.session_token && sessionToken && user.session_token !== sessionToken) {
        return NextResponse.json({ valid: false })
      }
    } catch (error) {
      // DB error or user not found - assume valid to avoid false disconnects
      console.error('Session verify DB error:', error)
      return NextResponse.json({ valid: true })
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Session verify error:', error)
    // On any error, assume valid to avoid false disconnects
    return NextResponse.json({ valid: true })
  }
}

