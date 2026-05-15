import type { Question } from '@/lib/types'

interface PlayerResult {
  name: string
  score: number
  abstentions_used?: number
}

async function toBase64(url: string, useProxy = false): Promise<string | null> {
  try {
    const src = useProxy ? `/api/proxy-image?url=${encodeURIComponent(url)}` : url
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

const TOPIC_LABELS: Record<string, string> = {
  storia: 'Storia', geografia: 'Geografia', tecnologia: 'Tecnologia',
  informatica: 'Informatica', ragionamento_rapido: 'Ragionamento', inglese: 'Inglese',
  economia_diritto: 'Economia', serie_tv: 'Serie TV', religione: 'Religione',
  lingue_straniere: 'Lingue', matematica: 'Matematica', italiano: 'Italiano',
  cultura_generale: 'Cultura', cinema: 'Cinema', libri: 'Libri', musica: 'Musica',
  televisione: 'TV', giochi_tavolo: 'Giochi', cartoni_animati: 'Cartoni',
  scienze_natura: 'Scienze', sport: 'Sport', politica: 'Politica', arte: 'Arte',
  celebrita: 'Celebrità', animali: 'Animali', veicoli: 'Veicoli',
  indovina_logo: 'Logo', indovina_bandiera: 'Bandiera', indovina_anno: 'Anno',
}

const TOPIC_COLORS: Record<string, string> = {
  storia: '#92400e,#fef3c7', geografia: '#065f46,#d1fae5', tecnologia: '#1e3a8a,#dbeafe',
  informatica: '#1e3a8a,#dbeafe', musica: '#6b21a8,#f3e8ff', cinema: '#7c2d12,#ffedd5',
  sport: '#14532d,#dcfce7', scienze_natura: '#0f766e,#ccfbf1', matematica: '#1e40af,#dbeafe',
  arte: '#9d174d,#fce7f3', cultura_generale: '#374151,#f3f4f6',
}

function topicStyle(topic: string) {
  const colors = TOPIC_COLORS[topic] || '#4c1d95,#ede9fe'
  const [text, bg] = colors.split(',')
  return `background:${bg};color:${text};`
}

export async function downloadQuizPDF(questions: Question[], players: PlayerResult[]) {
  // Fetch logo (same origin, no proxy needed)
  const logoB64 = await toBase64('/logo-gq.png', false)

  // Fetch question images via proxy
  const imageMap: Record<string, string> = {}
  await Promise.all(
    questions.filter(q => q.image_url).map(async q => {
      const b64 = await toBase64(q.image_url!, true)
      if (b64) imageMap[q.image_url!] = b64
    })
  )

  const date = new Date().toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  // Awards
  const abstentionist = players.reduce((best, p) =>
    (p.abstentions_used ?? 0) > (best.abstentions_used ?? 0) ? p : best, players[0])
  const hasAbstentions = players.some(p => (p.abstentions_used ?? 0) > 0)

  // Rankings
  const rankMedals = ['🥇', '🥈', '🥉']
  const rankingsHTML = players.map((p, i) => `
    <div class="rank-row">
      <span class="rank-medal">${rankMedals[i] ?? `${i + 1}.`}</span>
      <span class="rank-name">${p.name}</span>
      <span class="rank-score">${p.score.toLocaleString('it-IT')} pt</span>
    </div>`
  ).join('')

  // Awards section
  const awardsHTML = `
    <div class="awards-section">
      <h2 class="section-title">🏅 Titoli speciali</h2>
      <div class="awards-grid">
        <div class="award-card gold">
          <div class="award-icon">🏆</div>
          <div class="award-label">Campione</div>
          <div class="award-name">${players[0]?.name ?? '—'}</div>
          <div class="award-sub">${players[0]?.score?.toLocaleString('it-IT') ?? 0} punti</div>
        </div>
        ${hasAbstentions && abstentionist ? `
        <div class="award-card purple">
          <div class="award-icon">✋</div>
          <div class="award-label">L'Astensionista</div>
          <div class="award-name">${abstentionist.name}</div>
          <div class="award-sub">${abstentionist.abstentions_used} astensioni</div>
        </div>` : ''}
      </div>
    </div>`

  // Questions
  const questionsHTML = questions.map((q, i) => {
    const imgSrc = q.image_url ? (imageMap[q.image_url] || null) : null
    const imgHTML = imgSrc
      ? `<img src="${imgSrc}" class="question-image" alt="" />`
      : ''

    const optionsHTML = q.options.map(opt => {
      const isCorrect = opt === q.correct_answer
      return `<div class="option ${isCorrect ? 'correct' : ''}">
        <span class="bullet">${isCorrect ? '✓' : '○'}</span>
        <span>${opt}</span>
      </div>`
    }).join('')

    return `
      <div class="question-block">
        <div class="question-header">
          <span class="question-number">${i + 1}</span>
          <span class="topic-badge" style="${topicStyle(q.topic)}">${TOPIC_LABELS[q.topic] ?? q.topic}</span>
        </div>
        ${imgHTML}
        <p class="question-text">${q.question_text}</p>
        <div class="options">${optionsHTML}</div>
      </div>`
  }).join('')

  const logoHTML = logoB64
    ? `<img src="${logoB64}" class="header-logo" alt="GQ" />`
    : `<div class="header-logo-text">GQ</div>`

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<title>GuglioQuiz — ${date}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Geist', 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; }

  /* ── Header ── */
  .page-header {
    background: #111827;
    color: white; padding: 24px 36px;
    display: flex; align-items: center; gap: 20px;
  }
  .header-logo { width: 60px; height: 60px; border-radius: 50%; border: 3px solid oklch(0.75 0.18 85); flex-shrink: 0; object-fit: cover; }
  .header-logo-text { width: 60px; height: 60px; border-radius: 50%; border: 3px solid oklch(0.75 0.18 85);
    display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: oklch(0.75 0.18 85); background: #1f2937; }
  .header-title { font-size: 30px; font-weight: 900; letter-spacing: -1px; line-height: 1; }
  .header-title .guglio { color: oklch(0.75 0.18 85); }
  .header-title .quiz { color: #ffffff; }
  .header-meta { font-size: 12px; color: #9ca3af; margin-top: 5px; }

  /* ── Rankings ── */
  .rankings-section { padding: 24px 36px; border-bottom: 2px solid #e5e0c8; }
  .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1.5px; color: oklch(0.75 0.18 85); margin-bottom: 14px; }
  .rank-row { display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; border-radius: 10px; margin-bottom: 6px; background: #fafaf5; }
  .rank-row:first-of-type { background: linear-gradient(90deg, #fef9c3, #fef3c7); }
  .rank-medal { font-size: 20px; width: 28px; text-align: center; flex-shrink: 0; }
  .rank-name { flex: 1; font-weight: 700; font-size: 15px; }
  .rank-score { font-weight: 800; color: oklch(0.75 0.18 85); font-size: 15px; }

  /* ── Awards ── */
  .awards-section { padding: 20px 36px; border-bottom: 2px solid #e5e0c8; background: #fafaf5; }
  .awards-grid { display: flex; gap: 14px; flex-wrap: wrap; }
  .award-card { flex: 1; min-width: 140px; border-radius: 12px; padding: 14px 16px;
    text-align: center; border: 2px solid; }
  .award-card.gold { background: #fefce8; border-color: #fbbf24; }
  .award-card.purple { background: #f5f3ff; border-color: #a78bfa; }
  .award-card.gray { background: #f9fafb; border-color: #d1d5db; }
  .award-icon { font-size: 26px; margin-bottom: 6px; }
  .award-label { font-size: 10px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1px; color: #6b7280; margin-bottom: 4px; }
  .award-name { font-size: 15px; font-weight: 800; color: #1a1a2e; }
  .award-name.award-tbd { color: #9ca3af; font-weight: 500; font-style: italic; }
  .award-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }

  /* ── Questions ── */
  .questions { padding: 24px 36px; }
  .questions-title { font-size: 12px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1.5px; color: oklch(0.75 0.18 85); margin-bottom: 18px; }
  .question-block {
    border: 1.5px solid #e5e7eb; border-radius: 12px;
    padding: 18px 20px; margin-bottom: 16px; page-break-inside: avoid;
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  }
  .question-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .question-number {
    background: linear-gradient(135deg, oklch(0.65 0.18 85), oklch(0.75 0.18 85));
    color: white; width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; flex-shrink: 0;
  }
  .topic-badge {
    font-size: 10px; font-weight: 800; padding: 3px 10px;
    border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .question-image { width: 100%; max-height: 200px; object-fit: contain;
    border-radius: 8px; margin-bottom: 12px; border: 1px solid #e5e7eb; }
  .question-text { font-size: 15px; font-weight: 600; margin-bottom: 14px; line-height: 1.55; }
  .options { display: flex; flex-direction: column; gap: 7px; }
  .option { display: flex; align-items: center; gap: 10px;
    font-size: 13px; padding: 8px 14px; border-radius: 8px;
    background: #f9fafb; border: 1.5px solid #e5e7eb; }
  .option.correct { background: #dcfce7; border-color: #16a34a; color: #15803d; font-weight: 700; }
  .bullet { font-size: 14px; flex-shrink: 0; width: 16px; text-align: center; }

  .footer { text-align: center; padding: 16px; font-size: 11px; color: #9ca3af;
    border-top: 1px solid #e5e7eb; margin-top: 8px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .question-block { page-break-inside: avoid; }
    .award-card { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="page-header">
    ${logoHTML}
    <div>
      <div class="header-title"><span class="guglio">Guglio</span><span class="quiz">Quiz</span></div>
      <div class="header-meta">${date} · ${questions.length} domande</div>
    </div>
  </div>

  <div class="rankings-section">
    <div class="section-title">🏆 Classifica finale</div>
    ${rankingsHTML}
  </div>

  ${awardsHTML}

  <div class="questions">
    <div class="questions-title">📋 Domande e risposte</div>
    ${questionsHTML}
  </div>

  <div class="footer">Generato da GuglioQuiz · guglioquiz.com</div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}
