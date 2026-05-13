export const dynamic = 'force-dynamic';
import { createGroq } from '@ai-sdk/groq'
import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { TOPIC_LABELS, type Topic, type Difficulty } from '@/lib/types'

export const maxDuration = 60; // Set Vercel timeout to maximum allowed for Hobby plan

// Lazy loader for Groq
function getGroq() {
  return createGroq({
    apiKey: process.env.GROQ_API_KEY || 'gsk_stub',
  })
}

// Mapping from our topics to Open Trivia DB categories
const TRIVIA_CATEGORY_MAP: Partial<Record<Topic, number>> = {
  storia: 23, // History
  geografia: 22, // Geography
  tecnologia: 30, // Science: Gadgets
  informatica: 18, // Science: Computers
  inglese: 10, // Books (closest to language/literature)
  serie_tv: 14, // Television
  religione: 20, // Mythology (closest)
  matematica: 19, // Science: Mathematics
  italiano: 10, // Books/Literature
  cultura_generale: 9, // General Knowledge
  cinema: 11, // Entertainment: Film
  libri: 10, // Entertainment: Books
  musica: 12, // Entertainment: Music
  televisione: 14, // Entertainment: Television
  giochi_tavolo: 16, // Entertainment: Board Games
  cartoni_animati: 32, // Entertainment: Cartoon & Animations
  scienze_natura: 17, // Science & Nature
  sport: 21, // Sports
  politica: 24, // Politics
  arte: 25, // Art
  celebrita: 26, // Celebrities
  animali: 27, // Animals
  veicoli: 28, // Vehicles
}

// Topics that need AI generation (no trivia DB equivalent)
const AI_ONLY_TOPICS: Topic[] = ['ragionamento_rapido', 'economia_diritto', 'lingue_straniere']

// Topics with images
const IMAGE_TOPICS: Topic[] = ['indovina_logo', 'indovina_bandiera', 'indovina_anno']

// Logo data — uses Simple Icons CDN (symbol/icon only, no wordmark text, very reliable)
// URL format: https://cdn.simpleicons.org/{slug}/ffffff (white icon for dark backgrounds)
const LOGO_DATA = [
  { name: 'Apple', url: 'https://cdn.simpleicons.org/apple/ffffff' },
  { name: 'Google', url: 'https://cdn.simpleicons.org/google/ffffff' },
  { name: 'Nike', url: 'https://cdn.simpleicons.org/nike/ffffff' },
  { name: 'McDonald\'s', url: 'https://cdn.simpleicons.org/mcdonalds/ffffff' },
  { name: 'Amazon', url: 'https://cdn.simpleicons.org/amazon/ffffff' },
  { name: 'Microsoft', url: 'https://cdn.simpleicons.org/microsoft/ffffff' },
  { name: 'Adidas', url: 'https://cdn.simpleicons.org/adidas/ffffff' },
  { name: 'IBM', url: 'https://cdn.simpleicons.org/ibm/ffffff' },
  { name: 'Toyota', url: 'https://cdn.simpleicons.org/toyota/ffffff' },
  { name: 'Slack', url: 'https://cdn.simpleicons.org/slack/ffffff' },
  { name: 'Android', url: 'https://cdn.simpleicons.org/android/ffffff' },
  { name: 'YouTube', url: 'https://cdn.simpleicons.org/youtube/ffffff' },
  { name: 'Instagram', url: 'https://cdn.simpleicons.org/instagram/ffffff' },
  { name: 'WhatsApp', url: 'https://cdn.simpleicons.org/whatsapp/ffffff' },
  { name: 'Telegram', url: 'https://cdn.simpleicons.org/telegram/ffffff' },
  { name: 'Spotify', url: 'https://cdn.simpleicons.org/spotify/ffffff' },
  { name: 'Netflix', url: 'https://cdn.simpleicons.org/netflix/ffffff' },
  { name: 'Twitter / X', url: 'https://cdn.simpleicons.org/x/ffffff' },
  { name: 'Firefox', url: 'https://cdn.simpleicons.org/firefox/ffffff' },
  { name: 'Chrome', url: 'https://cdn.simpleicons.org/googlechrome/ffffff' },
  { name: 'PlayStation', url: 'https://cdn.simpleicons.org/playstation/ffffff' },
  { name: 'Xbox', url: 'https://cdn.simpleicons.org/xbox/ffffff' },
  { name: 'Airbnb', url: 'https://cdn.simpleicons.org/airbnb/ffffff' },
  { name: 'Uber', url: 'https://cdn.simpleicons.org/uber/ffffff' },
  { name: 'Mastercard', url: 'https://cdn.simpleicons.org/mastercard/ffffff' },
  { name: 'Visa', url: 'https://cdn.simpleicons.org/visa/ffffff' },
  { name: 'BMW', url: 'https://cdn.simpleicons.org/bmw/ffffff' },
  { name: 'Volkswagen', url: 'https://cdn.simpleicons.org/volkswagen/ffffff' },
  { name: 'Ferrari', url: 'https://cdn.simpleicons.org/ferrari/ffffff' },
  { name: 'TikTok', url: 'https://cdn.simpleicons.org/tiktok/ffffff' },
]

// Flag data - countries with flag URLs
const FLAG_DATA = [
  { name: 'Italia', url: 'https://flagcdn.com/w320/it.png' },
  { name: 'Francia', url: 'https://flagcdn.com/w320/fr.png' },
  { name: 'Germania', url: 'https://flagcdn.com/w320/de.png' },
  { name: 'Spagna', url: 'https://flagcdn.com/w320/es.png' },
  { name: 'Regno Unito', url: 'https://flagcdn.com/w320/gb.png' },
  { name: 'Stati Uniti', url: 'https://flagcdn.com/w320/us.png' },
  { name: 'Giappone', url: 'https://flagcdn.com/w320/jp.png' },
  { name: 'Cina', url: 'https://flagcdn.com/w320/cn.png' },
  { name: 'Brasile', url: 'https://flagcdn.com/w320/br.png' },
  { name: 'Argentina', url: 'https://flagcdn.com/w320/ar.png' },
  { name: 'Australia', url: 'https://flagcdn.com/w320/au.png' },
  { name: 'Canada', url: 'https://flagcdn.com/w320/ca.png' },
  { name: 'Messico', url: 'https://flagcdn.com/w320/mx.png' },
  { name: 'India', url: 'https://flagcdn.com/w320/in.png' },
  { name: 'Russia', url: 'https://flagcdn.com/w320/ru.png' },
  { name: 'Sudafrica', url: 'https://flagcdn.com/w320/za.png' },
  { name: 'Egitto', url: 'https://flagcdn.com/w320/eg.png' },
  { name: 'Grecia', url: 'https://flagcdn.com/w320/gr.png' },
  { name: 'Portogallo', url: 'https://flagcdn.com/w320/pt.png' },
  { name: 'Olanda', url: 'https://flagcdn.com/w320/nl.png' },
  { name: 'Belgio', url: 'https://flagcdn.com/w320/be.png' },
  { name: 'Svizzera', url: 'https://flagcdn.com/w320/ch.png' },
  { name: 'Austria', url: 'https://flagcdn.com/w320/at.png' },
  { name: 'Polonia', url: 'https://flagcdn.com/w320/pl.png' },
  { name: 'Svezia', url: 'https://flagcdn.com/w320/se.png' },
  { name: 'Norvegia', url: 'https://flagcdn.com/w320/no.png' },
  { name: 'Danimarca', url: 'https://flagcdn.com/w320/dk.png' },
  { name: 'Finlandia', url: 'https://flagcdn.com/w320/fi.png' },
  { name: 'Irlanda', url: 'https://flagcdn.com/w320/ie.png' },
  { name: 'Turchia', url: 'https://flagcdn.com/w320/tr.png' },
  { name: 'Sud Corea', url: 'https://flagcdn.com/w320/kr.png' },
  { name: 'Vietnam', url: 'https://flagcdn.com/w320/vn.png' },
  { name: 'Thailandia', url: 'https://flagcdn.com/w320/th.png' },
  { name: 'Israele', url: 'https://flagcdn.com/w320/il.png' },
  { name: 'Arabia Saudita', url: 'https://flagcdn.com/w320/sa.png' },
  { name: 'Marocco', url: 'https://flagcdn.com/w320/ma.png' },
  { name: 'Bhutan', url: 'https://flagcdn.com/w320/bt.png' },
  { name: 'Kirghizistan', url: 'https://flagcdn.com/w320/kg.png' },
  { name: 'Seychelles', url: 'https://flagcdn.com/w320/sc.png' },
  { name: 'Eswatini', url: 'https://flagcdn.com/w320/sz.png' },
  { name: 'Vanuatu', url: 'https://flagcdn.com/w320/vu.png' },
  { name: 'Mozambico', url: 'https://flagcdn.com/w320/mz.png' },
  { name: 'Papua Nuova Guinea', url: 'https://flagcdn.com/w320/pg.png' },
  { name: 'Cile', url: 'https://flagcdn.com/w320/cl.png' },
  { name: 'Nuova Zelanda', url: 'https://flagcdn.com/w320/nz.png' },
  { name: 'Colombia', url: 'https://flagcdn.com/w320/co.png' },
  { name: 'Nepal', url: 'https://flagcdn.com/w320/np.png' },
  { name: 'Giamaica', url: 'https://flagcdn.com/w320/jm.png' },
  { name: 'Kenya', url: 'https://flagcdn.com/w320/ke.png' },
  { name: 'Filippine', url: 'https://flagcdn.com/w320/ph.png' },
]

// Hardcoded backup questions in case everything fails
const BACKUP_QUESTIONS: GeneratedQuestion[] = [
  { topic: 'cultura_generale', question_text: 'Qual è la capitale dell\'Italia?', question_type: 'multiple', options: ['Roma', 'Milano', 'Napoli', 'Torino'], correct_answer: 'Roma' },
  { topic: 'cultura_generale', question_text: 'Quanti sono i pianeti del sistema solare?', question_type: 'multiple', options: ['7', '8', '9', '10'], correct_answer: '8' },
  { topic: 'storia', question_text: 'In che anno è finita la Seconda Guerra Mondiale?', question_type: 'multiple', options: ['1940', '1945', '1950', '1939'], correct_answer: '1945' },
  { topic: 'scienze_natura', question_text: 'Qual è l\'elemento chimico con simbolo O?', question_type: 'multiple', options: ['Oro', 'Ossigeno', 'Osmio', 'Idrogeno'], correct_answer: 'Ossigeno' },
  { topic: 'geografia', question_text: 'Qual è il fiume più lungo del mondo?', question_type: 'multiple', options: ['Nilo', 'Rio delle Amazzoni', 'Mississippi', 'Po'], correct_answer: 'Rio delle Amazzoni' },
  { topic: 'arte', question_text: 'Chi ha dipinto la Gioconda?', question_type: 'multiple', options: ['Michelangelo', 'Raffaello', 'Leonardo da Vinci', 'Donatello'], correct_answer: 'Leonardo da Vinci' },
  { topic: 'informatica', question_text: 'Cosa significa la sigla WWW?', question_type: 'multiple', options: ['World Wide Web', 'World Wide Wait', 'Web Wide World', 'Work Wide Web'], correct_answer: 'World Wide Web' },
  { topic: 'sport', question_text: 'Ogni quanti anni si svolgono le Olimpiadi?', question_type: 'multiple', options: ['2', '3', '4', '5'], correct_answer: '4' },
  { topic: 'musica', question_text: 'Quante note ci sono nella scala musicale diatonica?', question_type: 'multiple', options: ['5', '6', '7', '8'], correct_answer: '7' },
  { topic: 'cinema', question_text: 'Chi ha diretto il film "Pulp Fiction"?', question_type: 'multiple', options: ['Steven Spielberg', 'Martin Scorsese', 'Quentin Tarantino', 'Christopher Nolan'], correct_answer: 'Quentin Tarantino' }
]
const YEAR_EVENTS = [
  { year: 1969, event: 'L\'uomo sbarca sulla Luna', wrong: ['Cade il Muro di Berlino', 'Fine della Seconda Guerra Mondiale', 'Primo volo dei fratelli Wright'] },
  { year: 1989, event: 'Cade il Muro di Berlino', wrong: ['L\'uomo sbarca sulla Luna', 'Nascita dell\'Euro', 'Attentato alle Torri Gemelle'] },
  { year: 1945, event: 'Fine della Seconda Guerra Mondiale', wrong: ['Inizio della Prima Guerra Mondiale', 'Scoperta della penicillina', 'Prima trasmissione TV'] },
  { year: 2001, event: 'Attentato alle Torri Gemelle', wrong: ['Cade il Muro di Berlino', 'Nascita di Facebook', 'Primo iPhone'] },
  { year: 1492, event: 'Colombo scopre l\'America', wrong: ['Inizio del Rinascimento', 'Caduta dell\'Impero Romano', 'Invenzione della stampa'] },
  { year: 1789, event: 'Rivoluzione Francese', wrong: ['Dichiarazione d\'Indipendenza USA', 'Congresso di Vienna', 'Napoleone diventa imperatore'] },
  { year: 1914, event: 'Inizio della Prima Guerra Mondiale', wrong: ['Rivoluzione Russa', 'Fine della Seconda Guerra Mondiale', 'Crollo di Wall Street'] },
  { year: 1929, event: 'Crollo di Wall Street', wrong: ['Inizio della Prima Guerra Mondiale', 'Fine della Seconda Guerra Mondiale', 'Nascita dell\'ONU'] },
  { year: 1961, event: 'Primo uomo nello spazio (Gagarin)', wrong: ['L\'uomo sbarca sulla Luna', 'Lancio dello Sputnik', 'Fondazione NASA'] },
  { year: 2007, event: 'Lancio del primo iPhone', wrong: ['Nascita di Facebook', 'Fondazione di Google', 'Lancio di WhatsApp'] },
  { year: 2004, event: 'Nascita di Facebook', wrong: ['Lancio del primo iPhone', 'Nascita di Twitter', 'Fondazione di Amazon'] },
  { year: 1776, event: 'Dichiarazione d\'Indipendenza USA', wrong: ['Rivoluzione Francese', 'Fine della Guerra Civile Americana', 'Fondazione degli USA'] },
  { year: 1969, event: 'Woodstock Festival', wrong: ['Morte di Elvis', 'Nascita dei Beatles', 'Live Aid'] },
  { year: 1990, event: 'Nascita del World Wide Web', wrong: ['Lancio del primo iPhone', 'Fondazione di Google', 'Nascita di Facebook'] },
  { year: 1953, event: 'Scoperta del DNA', wrong: ['Scoperta della penicillina', 'Primo trapianto di cuore', 'Clonazione della pecora Dolly'] },
]

interface GeneratedQuestionWithImage extends GeneratedQuestion {
  image_url?: string
}

// Generate image-based questions
function generateImageQuestions(
  topic: Topic,
  count: number,
  usedHashes: Set<string>
): GeneratedQuestionWithImage[] {
  const questions: GeneratedQuestionWithImage[] = []
  
  if (topic === 'indovina_logo') {
    const shuffledLogos = [...LOGO_DATA].sort(() => Math.random() - 0.5)
    for (let i = 0; i < Math.min(count, shuffledLogos.length); i++) {
      const correct = shuffledLogos[i]
      const hash = hashQuestion(`logo_${correct.name}`)
      if (usedHashes.has(hash)) continue
      usedHashes.add(hash)
      
      // Get 3 random wrong answers
      const wrongOptions = shuffledLogos
        .filter(l => l.name !== correct.name)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(l => l.name)
      
      const options = [correct.name, ...wrongOptions].sort(() => Math.random() - 0.5)
      
      questions.push({
        topic: 'indovina_logo',
        question_text: 'A quale azienda appartiene questo logo?',
        question_type: 'multiple',
        options,
        correct_answer: correct.name,
        image_url: correct.url,
      })
    }
  } else if (topic === 'indovina_bandiera') {
    const shuffledFlags = [...FLAG_DATA].sort(() => Math.random() - 0.5)
    for (let i = 0; i < Math.min(count, shuffledFlags.length); i++) {
      const correct = shuffledFlags[i]
      const hash = hashQuestion(`flag_${correct.name}`)
      if (usedHashes.has(hash)) continue
      usedHashes.add(hash)
      
      const wrongOptions = shuffledFlags
        .filter(f => f.name !== correct.name)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(f => f.name)
      
      const options = [correct.name, ...wrongOptions].sort(() => Math.random() - 0.5)
      
      questions.push({
        topic: 'indovina_bandiera',
        question_text: 'A quale nazione appartiene questa bandiera?',
        question_type: 'multiple',
        options,
        correct_answer: correct.name,
        image_url: correct.url,
      })
    }
  } else if (topic === 'indovina_anno') {
    const shuffledEvents = [...YEAR_EVENTS].sort(() => Math.random() - 0.5)
    for (let i = 0; i < Math.min(count, shuffledEvents.length); i++) {
      const event = shuffledEvents[i]
      const hash = hashQuestion(`year_${event.event}`)
      if (usedHashes.has(hash)) continue
      usedHashes.add(hash)
      
      // Generate wrong year options
      const yearOffsets = [-10, -5, 5, 10, -15, 15, -20, 20]
      const wrongYears = yearOffsets
        .map(offset => event.year + offset)
        .filter(y => y > 1400 && y <= 2024)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(y => y.toString())
      
      const options = [event.year.toString(), ...wrongYears].sort(() => Math.random() - 0.5)
      
      questions.push({
        topic: 'indovina_anno',
        question_text: `In che anno e successo: "${event.event}"?`,
        question_type: 'multiple',
        options,
        correct_answer: event.year.toString(),
      })
    }
  }
  
  return questions
}

interface TriviaQuestion {
  category: string
  type: string
  difficulty: string
  question: string
  correct_answer: string
  incorrect_answers: string[]
}

interface GeneratedQuestion {
  topic: string
  question_text: string
  question_type: 'multiple' | 'true_false'
  options: string[]
  correct_answer: string
}

// Decode HTML entities
function decodeHTML(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/g, 'é')
    .replace(/&agrave;/g, 'à')
    .replace(/&egrave;/g, 'è')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
}

// Generate a hash of a question for deduplication (use full normalized text)
function hashQuestion(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 120)
}

// Fetch questions from Open Trivia DB with token for no repeats
async function fetchTriviaQuestions(
  category: number,
  count: number,
  difficulty: Difficulty,
  usedHashes: Set<string>
): Promise<TriviaQuestion[]> {
  const difficultyParam = difficulty === 'difficile' ? 'hard' : 'medium'
  
  // Request more questions than needed to filter out duplicates
  const requestCount = Math.min(count * 2, 50)
  const url = `https://opentdb.com/api.php?amount=${requestCount}&category=${category}&difficulty=${difficultyParam}&type=multiple`
  
  try {
    const response = await fetch(url, { cache: 'no-store' })
    const data = await response.json()
    
    if (data.response_code === 0 && data.results) {
      // Filter out questions we've already used
      const newQuestions = data.results.filter((q: TriviaQuestion) => {
        const hash = hashQuestion(q.question)
        if (usedHashes.has(hash)) return false
        usedHashes.add(hash)
        return true
      })
      return newQuestions.slice(0, count)
    }
    return []
  } catch {
    return []
  }
}

// Translate questions using Groq
async function translateQuestions(questions: GeneratedQuestion[]): Promise<GeneratedQuestion[]> {
  if (questions.length === 0) return []
  
  const prompt = `Traduci le seguenti domande quiz dall'inglese all'italiano.
REGOLE FONDAMENTALI:
1. Usa un italiano naturale e corretto — non una traduzione letterale
2. Mantieni ESATTAMENTE la stessa struttura JSON
3. La risposta corretta tradotta deve essere IDENTICA (parola per parola) a una delle opzioni tradotte
4. Non aggiungere note, commenti o testo fuori dal JSON
5. Adatta nomi di luoghi/persone/unità di misura in italiano dove appropriato (es. "United States" → "Stati Uniti")

DOMANDE DA TRADURRE:
${JSON.stringify(questions, null, 2)}

RISPONDI SOLO CON L'ARRAY JSON TRADOTTO (inizia con [ e finisci con ]):`

  try {
    const { text } = await generateText({
      model: getGroq()('llama-3.1-8b-instant'),
      prompt,
    })
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return [] // Return empty array to force AI generation fallback
    const translated: GeneratedQuestion[] = JSON.parse(jsonMatch[0])
    return translated.filter(q => q.options && q.correct_answer && q.options.includes(q.correct_answer))
  } catch (e) {
    console.error('Translation failed, discarding questions to fallback to AI:', e)
    return [] // Discard english questions so we fallback to generating native italian ones
  }
}

// Generate AI-only questions
async function generateAIQuestions(
  topics: Topic[],
  count: number,
  difficulty: Difficulty,
  usedHashes: Set<string>,
  seed?: number,
  usedTexts?: string[]
): Promise<GeneratedQuestion[]> {
  const topicsList = topics.map(t => TOPIC_LABELS[t] || t).join(', ')
  const difficultyText = difficulty === 'difficile' ? 'difficili e sfidanti' : 'di media difficoltà'
  const randomSeed = seed || Date.now()

  // Style variations to force different question types each call
  const styleVariants = [
    'Preferisci domande su eventi recenti (ultimi 20 anni), personaggi contemporanei e fatti moderni.',
    'Preferisci domande su storia antica, origini, record mondiali e curiosità scientifiche.',
    'Preferisci domande su numeri, date, misure, quantità e statistiche.',
    'Preferisci domande su personaggi famosi, premi, primati e record.',
    'Preferisci domande su luoghi geografici, paesi, città e cultura locale.',
    'Preferisci domande su processi, meccanismi, "come funziona", scoperte e invenzioni.',
  ]
  const styleHint = styleVariants[Math.floor(randomSeed) % styleVariants.length]

  // Include a sample of used questions to avoid repeats
  const avoidSection = usedTexts && usedTexts.length > 0
    ? `\nNON GENERARE domande simili o identiche a queste già usate:\n${usedTexts.slice(0, 20).map(t => `- "${t}"`).join('\n')}\n`
    : ''

  const prompt = `Genera esattamente ${count} domande quiz ORIGINALI e UNICHE TASSATIVAMENTE IN LINGUA ITALIANA per un gioco a quiz multiplayer. È ASSOLUTAMENTE VIETATO USARE L'INGLESE. Tutte le domande e le opzioni devono essere in un italiano perfetto.
Usa questo seed per variare le domande: ${randomSeed}
Stile richiesto per questa sessione: ${styleHint}
${avoidSection}

ARGOMENTI: ${topicsList}
DIFFICOLTÀ: ${difficultyText}

REGOLE SPECIFICHE PER ARGOMENTO:
- "ragionamento_rapido": includi calcoli mentali veloci, sequenze logiche o indovinelli (4 opzioni)
- "economia_diritto": domande su economia, finanza o diritto base (4 opzioni)
- "lingue_straniere": domande su traduzioni o grammatica di lingue (4 opzioni)
- "storia": domande su eventi storici, personaggi storici, date importanti
- "geografia": domande su capitali, nazioni, fiumi, montagne, continenti
- "tecnologia": domande su invenzioni, dispositivi, innovazioni tecnologiche
- "informatica": domande su programmazione, hardware, software, internet
- "matematica": domande su formule, teoremi, calcoli, geometria
- "italiano": domande su grammatica italiana, letteratura italiana, autori italiani
- "inglese": domande su grammatica inglese, letteratura inglese, autori inglesi
- "serie_tv": domande su serie TV famose, attori, trame, personaggi
- "religione": domande su religioni del mondo, testi sacri, figure religiose
- "cultura_generale": domande di cultura generale varia
- "cinema": domande su film, registi, attori, premi Oscar
- "libri": domande su libri famosi, autori, letteratura mondiale
- "musica": domande su cantanti, band, canzoni, generi musicali
- "televisione": domande su programmi TV, conduttori, show televisivi
- "giochi_tavolo": domande su giochi da tavolo famosi, regole, strategie
- "cartoni_animati": domande su cartoni animati, anime, personaggi animati
- "scienze_natura": domande su biologia, fisica, chimica, natura
- "sport": domande su sport, atleti, record, competizioni
- "politica": domande su politica, leader mondiali, eventi politici
- "arte": domande su artisti, opere d'arte, movimenti artistici
- "celebrita": domande su personaggi famosi, gossip, vita delle star
- "animali": domande su animali, specie, habitat, comportamenti
- "veicoli": domande su auto, moto, aerei, navi, trasporti

REGOLE GENERALI:
1. Ogni domanda DEVE avere esattamente 4 opzioni DIVERSE tra loro
2. La risposta corretta deve essere ESATTAMENTE uguale a una delle opzioni
3. Le domande devono essere VERIFICABILI e CORRETTE (non inventare fatti)
4. Distribuisci equamente tra gli argomenti richiesti
5. NON ripetere mai la stessa domanda

RISPONDI SOLO CON UN ARRAY JSON VALIDO (inizia con [ e finisci con ]):
[
  {
    "topic": "nome_argomento",
    "question_text": "testo della domanda",
    "question_type": "multiple",
    "options": ["opzione1", "opzione2", "opzione3", "opzione4"],
    "correct_answer": "risposta corretta esatta"
  }
]`

  const { text } = await generateText({
    model: getGroq()('llama-3.1-8b-instant'),
    prompt,
  })

  // Extract JSON array robustly
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('No JSON array in AI response')
  }
  const questions: GeneratedQuestion[] = JSON.parse(jsonMatch[0])

  
  // Filter out duplicates
  const uniqueQuestions = questions.filter(q => {
    const hash = hashQuestion(q.question_text)
    if (usedHashes.has(hash)) return false
    usedHashes.add(hash)
    return true
  })
  
  // Validate each question
  return uniqueQuestions.filter(q => 
    q.options && 
    q.correct_answer && 
    q.options.length === 4 &&
    q.options.includes(q.correct_answer)
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { topics, count, difficulty, usedQuestionHashes = [], usedQuestionTexts = [] } = body as {
      topics: Topic[]
      count: number
      difficulty: Difficulty
      usedQuestionHashes?: string[]
      usedQuestionTexts?: string[]
    }

    if (!topics || !count || !difficulty) {
      return NextResponse.json(
        { error: 'Missing required fields: topics, count, difficulty' },
        { status: 400 }
      )
    }

    // Track used questions to avoid duplicates
    const usedHashes = new Set<string>(usedQuestionHashes)
    
    // Generate a unique seed for this request
    const seed = Date.now() + Math.random() * 1000000

    // Separate topics into categories
    const triviaTopics = topics.filter(t => TRIVIA_CATEGORY_MAP[t] !== undefined)
    const aiTopics = topics.filter(t => AI_ONLY_TOPICS.includes(t))
    const imageTopics = topics.filter(t => IMAGE_TOPICS.includes(t))
    const otherTopics = topics.filter(t => !TRIVIA_CATEGORY_MAP[t] && !AI_ONLY_TOPICS.includes(t) && !IMAGE_TOPICS.includes(t))
    
    // Calculate how many questions per topic - request 20% more to handle validation failures
    const questionsPerTopic = Math.ceil((count * 1.2) / topics.length)
    
    const allQuestions: GeneratedQuestion[] = []

    // ── Run everything in parallel ──────────────────────────────────────────
    const parallelTasks: Promise<GeneratedQuestion[]>[] = []

    // 1. Trivia DB topics — fetch all topics in parallel, then translate ALL in ONE Groq call
    //    (avoids N simultaneous Groq requests which would trigger 429 rate-limit errors)
    if (triviaTopics.length > 0) {
      const triviaFetches = triviaTopics.map(topic => {
        const categoryId = TRIVIA_CATEGORY_MAP[topic]
        if (!categoryId) return Promise.resolve([] as GeneratedQuestion[])
        return fetchTriviaQuestions(categoryId, questionsPerTopic, difficulty, usedHashes).then(triviaQs =>
          triviaQs.map(q => {
            const options = [...q.incorrect_answers, q.correct_answer]
              .map(decodeHTML)
              .sort(() => Math.random() - 0.5)
            return {
              topic,
              question_text: decodeHTML(q.question),
              question_type: 'multiple' as const,
              options,
              correct_answer: decodeHTML(q.correct_answer),
            } as GeneratedQuestion
          })
        )
      })
      // Single translation call for all trivia questions combined
      parallelTasks.push(
        Promise.all(triviaFetches)
          .then(arrays => arrays.flat())
          .then(all => all.length > 0 ? translateQuestions(all) : [])
          .catch(() => [])
      )
    }

    // 2. Image-based questions (synchronous, wrap in resolved promise)
    for (const topic of imageTopics) {
      parallelTasks.push(
        Promise.resolve(generateImageQuestions(topic, questionsPerTopic, usedHashes))
      )
    }

    // 3. AI-only topics
    if (aiTopics.length > 0) {
      const aiCount = Math.max(questionsPerTopic * aiTopics.length, 1)
      parallelTasks.push(
        generateAIQuestions(aiTopics, aiCount, difficulty, usedHashes, seed, usedQuestionTexts)
          .catch(e => { console.error('AI topic generation failed:', e); return [] })
      )
    }

    // 4. Other topics (AI-generated, run alongside the above)
    if (otherTopics.length > 0) {
      parallelTasks.push(
        generateAIQuestions(otherTopics, questionsPerTopic * otherTopics.length, difficulty, usedHashes, seed + 1, usedQuestionTexts)
          .catch(e => { console.error('Other topic generation failed:', e); return [] })
      )
    }

    // Wait for everything
    const results = await Promise.all(parallelTasks)
    results.forEach(qs => allQuestions.push(...qs))

    // Fill up with AI if we don't have enough (single attempt, all-topics)
    // Final attempt if still short (up to 5 retries for the whole batch)
    let fillAttempts = 0
    while (allQuestions.length < count && fillAttempts < 5) {
      const remaining = count - allQuestions.length
      console.log(`[API] Short by ${remaining} questions. Fill attempt ${fillAttempts + 1}...`)
      try {
        // Request 50% more than needed to be sure
        const requestCount = Math.max(remaining + 2, Math.ceil(remaining * 1.5))
        const fillQs = await generateAIQuestions(topics, requestCount, difficulty, usedHashes, seed + 100 + fillAttempts, usedQuestionTexts)
        console.log(`[API] Generated ${fillQs.length} filling questions.`)
        allQuestions.push(...fillQs)
      } catch (e) {
        console.error(`[API] Fill attempt ${fillAttempts} failed:`, e)
      }
      fillAttempts++
    }

    // EMERGENCY FALLBACK: if we still don't have enough, use hardcoded backup questions
    if (allQuestions.length < count) {
      const remaining = count - allQuestions.length
      const backups = BACKUP_QUESTIONS
        .filter(q => !usedHashes.has(hashQuestion(q.question_text)))
        .slice(0, remaining)
      allQuestions.push(...backups)
    }

    
    // Shuffle and limit to requested count
    const shuffled = allQuestions.sort(() => Math.random() - 0.5)
    const finalQuestions = shuffled.slice(0, count)
    
    // Return questions along with their hashes for future deduplication
    const questionHashes = finalQuestions.map(q => hashQuestion(q.question_text))
    
    return NextResponse.json({
      questions: finalQuestions,
      hashes: questionHashes
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to generate questions', details: errorMessage },
      { status: 500 }
    )
  }
}

