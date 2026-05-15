import { NextRequest, NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  try {
    const pb = getPocketBase()
    const records = await pb.collection('game_history').getFullList({
      filter: `user = "${userId}"`,
      sort: '-game_number',
    })
    return NextResponse.json({ games: records })
  } catch {
    return NextResponse.json({ games: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, game_code, score, total, questions_json, players_json } = body
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const pb = getPocketBase()

    // Get next game number for this user
    let game_number = 1
    try {
      const existing = await pb.collection('game_history').getFullList({
        filter: `user = "${userId}"`,
        sort: '-game_number',
        fields: 'game_number',
      })
      if (existing.length > 0) game_number = (existing[0].game_number as number) + 1
    } catch { /* first game */ }

    const record = await pb.collection('game_history').create({
      user: userId,
      game_number,
      game_code: game_code ?? '',
      played_at: new Date().toISOString(),
      score: score ?? 0,
      total: total ?? 0,
      questions_json,
      players_json,
    })

    return NextResponse.json({ id: record.id, game_number })
  } catch (e) {
    console.error('game-history POST error', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
