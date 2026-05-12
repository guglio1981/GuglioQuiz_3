// @ts-nocheck
import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

export async function GET() {
  try {
    const pb = getPocketBase();
    
    // Get all push subscriptions (bypass auth if needed, ideally admin but for now assume public read)
    // In production, you'd use a service account or admin token
    const subscriptions = await pb.collection('push_subscriptions').getFullList({
      fields: 'user_id'
    });
    
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ users: [] })
    }
    
    // Get unique user IDs
    const userIds = [...new Set(subscriptions.map(s => s.user_id).filter(Boolean))]
    
    if (userIds.length === 0) {
      return NextResponse.json({ users: [] })
    }
    
    // Get user details for those who have subscriptions
    const users = await pb.collection('app_users').getFullList({
      filter: userIds.map(id => `id="${id}"`).join(' || '),
      fields: 'id,username,avatar,avatar_url'
    });
    
    return NextResponse.json({ users: users || [] })
  } catch (error) {
    console.error('Error in notifications/users:', error)
    return NextResponse.json({ users: [] })
  }
}
