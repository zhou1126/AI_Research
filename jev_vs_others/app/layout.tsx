import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: 'AI / Decision Lab',
 description: 'Explore Jev decisions, compare models in the notebook, chess and room labs, and inspect measured outcomes.',
 openGraph: { title: 'AI / Decision Lab', description: 'Jev model briefing and decision labs for notebook, chess and room experiments.' },
 twitter: { card: 'summary', title: 'AI / Decision Lab' },
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
