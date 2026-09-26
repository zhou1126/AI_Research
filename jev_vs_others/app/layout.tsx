import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: 'AI / Decision Lab',
 description: 'Explore Jev, compare agent components and models, and inspect chess, notebook and room decisions.',
 openGraph: { title: 'AI / Decision Lab', description: 'Jev model briefing and agent, notebook, chess and room decision labs.' },
 twitter: { card: 'summary', title: 'AI / Decision Lab' },
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
