// @ts-nocheck
import { NextResponse, NextRequest } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:info@guglioquiz.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { subscriptions, gameCode, hostName } = await request.json()
    
    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna sottoscrizione fornita' },
        { status: 400 }
      )
    }
    
    if (!gameCode) {
      return NextResponse.json(
        { error: 'Codice partita mancante' },
        { status: 400 }
      )
    }
    
    const pb = getPocketBase();
    
    const payload = JSON.stringify({
      title: 'Invito a GuglioQuiz!',
      body: `${hostName} ti ha invitato a giocare! Clicca per entrare direttamente nella partita.`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        gameCode
      }
    })
    
    let successCount = 0
    let failCount = 0
    
    // Send notifications to all selected users' subscriptions
    const sendPromises = subscriptions.map(async (sub) => {
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
        successCount++
      } catch (err: unknown) {
        const error = err as { statusCode?: number }
        console.error('Error sending notification:', error)
        failCount++
        
        // Remove invalid subscriptions from PocketBase
        if (error.statusCode === 410 || error.statusCode === 404) {
          try {
            await pb.collection('push_subscriptions').delete(sub.id);
          } catch (delError) {
            console.error('Error deleting stale subscription:', delError);
          }
        }
      }
    })
    
    await Promise.all(sendPromises)
    
    if (successCount === 0) {
      return NextResponse.json(
        { error: 'Nessuna notifica inviata con successo' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      message: `Notifica inviata a ${successCount} utent${successCount === 1 ? 'e' : 'i'}`,
      success: successCount,
      failed: failCount
    })
  } catch (error) {
    console.error('Error in send-selected:', error)
    return NextResponse.json(
      { error: 'Errore nell\'invio delle notifiche' },
      { status: 500 }
    )
  }
}
