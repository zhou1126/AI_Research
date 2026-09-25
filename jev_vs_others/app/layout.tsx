import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: 'AI / Decision Lab',
 description: 'Compare AI decisions in chess and room planning, with shared rules, visible choices and measurable outcomes.',
 openGraph: { title: 'AI / Decision Lab', description: 'Chess and room planning experiments with JEV, MCTS and language models.' },
 twitter: { card: 'summary', title: 'AI / Decision Lab' },
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
