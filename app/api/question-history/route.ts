import { NextRequest, NextResponse } from 'next/server'
import { getPocketBase } from '@/lib/pocketbase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ hashes: [] })

  try {
    const pb = getPocketBase()
    const records = await pb.collection('user_question_history').getFullList({
      filter: `user = "${userId}"`,
      fields: 'hashes',
    })
    const hashes = records.flatMap((r: { hashes: string[] }) => r.hashes ?? [])
    return NextResponse.json({ hashes })
  } catch {
    return NextResponse.json({ hashes: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, hashes } = await request.json()
    if (!userId || !Array.isArray(hashes)) return NextResponse.json({ ok: false }, { status: 400 })

    const pb = getPocketBase()

    // Upsert: find existing record or create new
    let existing = null
    try {
      const records = await pb.collection('user_question_history').getFullList({
        filter: `user = "${userId}"`,
        fields: 'id,hashes',
      })
      if (records.length > 0) existing = records[0]
    } catch { /* none */ }

    const merged = Array.from(new Set([...(existing?.hashes ?? []), ...hashes]))

    if (existing) {
      await pb.collection('user_question_history').update(existing.id, { hashes: merged })
    } else {
      await pb.collection('user_question_history').create({ user: userId, hashes: merged })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('question-history POST error', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
