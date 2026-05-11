import { Metadata } from 'next'

type Props = {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  
  // Definizione del dominio base (necessario per WhatsApp)
  // Se hai un dominio diverso in produzione, Next.js userà quello configurato nel deploy
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://guglioquiz.vercel.app'
  
  return {
    metadataBase: new URL(baseUrl),
    title: `GuglioQuiz - Unisciti alla partita ${code.toUpperCase()}`,
    description: 'Entra nel quiz e sfida i tuoi amici!',
    openGraph: {
      title: `GuglioQuiz - Codice: ${code.toUpperCase()}`,
      description: 'Clicca per entrare nella partita e giocare subito!',
      url: `/join/${code.toUpperCase()}`,
      siteName: 'GuglioQuiz',
      images: [
        {
          url: '/apple-icon.png',
          width: 180,
          height: 180,
          alt: 'GuglioQuiz Logo',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `GuglioQuiz - Codice: ${code.toUpperCase()}`,
      description: 'Sfida i tuoi amici a GuglioQuiz!',
      images: ['/apple-icon.png'],
    },
  }
}

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
