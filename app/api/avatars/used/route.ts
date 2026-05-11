import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const pb = getPocketBase()
    
    // Fetch all users to get their avatars
    // For a production app with thousands of users, this should be optimized
    // or cached, but for this scale getFullList is fine.
    const users = await pb.collection('app_users').getFullList({
      fields: 'avatar'
    })
    
    const usedAvatars = users
      .map(u => u.avatar)
      .filter((a): a is string => a !== null && a !== '')

    // Remove duplicates
    const uniqueUsed = [...new Set(usedAvatars)]

    return NextResponse.json({ used: uniqueUsed })
  } catch (error) {
    console.error('Error fetching used avatars:', error)
    return NextResponse.json({ used: [] }, { status: 500 })
  }
}
