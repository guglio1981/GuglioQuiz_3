// @ts-nocheck
import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'
import webpush from 'web-push'

// Configure web-push
webpush.setVapidDetails(
  'mailto:admin@guglioquiz.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(request: Request) {
  try {
    const { hostId, gameCode, hostName } = await request.json()

    if (!hostId || !gameCode) {
      return NextResponse.json(
        { error: 'Host ID e codice partita sono obbligatori' },
        { status: 400 }
      )
    }

    const pb = getPocketBase();
    
    // Get all push subscriptions for registered users (except the host)
    const filter = hostId ? `user_id != "${hostId}"` : '';
    const subscriptions = await pb.collection('push_subscriptions').getFullList({
      filter: filter
    });

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ 
        sent: 0, 
        message: 'Nessun utente registrato con notifiche attive' 
      })
    }

    const payload = JSON.stringify({
      title: 'GuglioQuiz - Nuova Partita!',
      body: `${hostName || 'Un utente'} ti ha invitato a giocare!`,
      icon: '/icon-192.png',
      badge: '/favicon.png',
      data: {
        url: `/join/${gameCode}`,
        gameCode
      }
    })

    let sent = 0
    let failed = 0

    // Send notifications to all subscribed users
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            payload
          )
          sent++
        } catch (err: any) {
          console.error('Push notification error:', err)
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
      })
    )

    return NextResponse.json({ 
      sent, 
      failed,
      total: subscriptions.length,
      message: `Notifiche inviate a ${sent} utenti` 
    })
  } catch (error) {
    console.error('Broadcast notification error:', error)
    return NextResponse.json(
      { error: 'Errore durante l\'invio delle notifiche' },
      { status: 500 }
    )
  }
}
