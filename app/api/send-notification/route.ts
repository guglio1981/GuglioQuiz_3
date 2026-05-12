// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import webPush from 'web-push'
import { getPocketBase } from '@/lib/pocketbase'

// Initialize web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@guglioquiz.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export async function POST(request: NextRequest) {
  try {
    const { userIds, title, body, url, gameCode } = await request.json()

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'User IDs required' }, { status: 400 })
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Push notifications not configured' }, { status: 500 })
    }

    const pb = getPocketBase();
    
    // Get subscriptions for the users
    const filter = userIds.map(id => `user_id="${id}"`).join(' || ');
    const subscriptions = await pb.collection('push_subscriptions').getFullList({
      filter: filter
    });

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No subscriptions found' })
    }

    const payload = JSON.stringify({
      title: title || 'GuglioQuiz',
      body: body || 'Nuova notifica',
      url: url || '/',
      gameCode
    })

    let sent = 0
    let failed = 0

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      }

      try {
        await webPush.sendNotification(pushSubscription, payload)
        sent++
      } catch (err: any) {
        console.error('Push failed for subscription:', err)
        failed++
        
        // Remove invalid subscriptions from PocketBase
        if (err.statusCode === 410 || err.statusCode === 404) {
          try {
            await pb.collection('push_subscriptions').delete(sub.id);
          } catch (delError) {
            console.error('Error deleting stale subscription:', delError);
          }
        }
      }
    }

    return NextResponse.json({ sent, failed })
  } catch (error) {
    console.error('Send notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
