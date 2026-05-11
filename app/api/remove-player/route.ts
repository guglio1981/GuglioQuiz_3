import { NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = searchParams.get('playerId')

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
  }

  const pb = getPocketBase();

  try {
    // Check if player is host - don't remove host
    let player;
    try {
      player = await pb.collection('players').getOne(playerId);
    } catch(e) {
      return NextResponse.json({ message: 'Player not found' });
    }

    if (player?.is_host) {
      return NextResponse.json({ message: 'Host cannot be removed' })
    }

    // Delete the player
    await pb.collection('players').delete(playerId);
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing player:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Also support POST for sendBeacon
export async function POST(request: Request) {
  return GET(request)
}
