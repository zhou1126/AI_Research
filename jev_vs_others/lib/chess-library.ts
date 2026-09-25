// Original concise study notes; factual move sequences transcribed to modern SAN.
// See data/chess-library.md for provenance and extension instructions.
export const LIBRARY_VERSION = 'classic-chess-1';
export type Feature = 'opening' | 'middlegame' | 'endgame' | 'undeveloped' | 'captures' | 'in_check' | 'pawn_ending' | 'bare_king' | 'material_ahead';
export type Source = { book: string; author: string; section: string; url: string };
const capablanca = (section: string): Source => ({ book: 'Chess Fundamentals', author: 'José Raúl Capablanca', section, url: 'https://www.gutenberg.org/cache/epub/33870/pg33870-images.html' });
const lasker = (section: string): Source => ({ book: 'Chess Strategy', author: 'Edward Lasker', section, url: 'https://www.gutenberg.org/cache/epub/5614/pg5614-images.html' });

export const STUDY_NOTES: { id: string; title: string; source: Source; tags: Feature[]; text: string }[] = [
  { id: 'development', title: 'Develop a coordinated force', source: capablanca('Part I, §6: General Strategy of the Opening'), tags: ['opening', 'undeveloped'], text: 'Develop minor pieces promptly, contest the centre, and prepare safe castling. Prefer development that also attacks or defends something useful.' },
  { id: 'opposition', title: 'King activity and opposition', source: capablanca('Part I, §§2–3 and §13: Pawn endings and opposition'), tags: ['pawn_ending'], text: 'In pawn endings, coordinate king and pawn advances. Opposition and move order can decide whether the king penetrates or the defender holds.' },
  { id: 'simple-mates', title: 'Coordinate king and major piece', source: capablanca('Part I, §1: Some Simple Mates'), tags: ['bare_king'], text: 'Against a lone king, use your king with the rook or queen to restrict escape squares. Preserve the mating piece and avoid stalemate.' },
  { id: 'endgame-king', title: 'Activate the king in the ending', source: capablanca('Part I, §5: Relative Value of the Pieces'), tags: ['endgame'], text: 'As attacking pieces disappear, the king can become an active force. Bring it toward useful squares while checking remaining enemy threats.' },
  { id: 'calculate-exchanges', title: 'Calculate the full exchange', source: lasker('Part I, Chapter II: Hints for Beginners — Simple Calculation'), tags: ['captures', 'in_check'], text: 'Count captures and recaptures for both players. Check legal defensive resources before assuming that an attacked or apparently defended piece is safe.' },
  { id: 'mobility', title: 'Balance activity and defence', source: lasker('Part I, Chapter III: General Principles of Chess Strategy'), tags: ['middlegame', 'undeveloped'], text: 'Improve mobility without abandoning defensive duties. Coordinate forces against a target and account for the opposing pieces that can defend or counterattack.' },
  { id: 'conversion', title: 'Convert an advantage carefully', source: lasker('Part I, Chapter VI: The Middle Game'), tags: ['material_ahead'], text: 'Consider exchanges that lead to a favorable ending. Inspect the resulting pawn structure and remaining winning resources before simplifying.' },
];

export const BOOK_LINES: { id: string; title: string; source: Source; san: string[]; text: string }[] = [
  { id: 'four-knights', title: 'Four Knights development example', source: capablanca('Part I, §6, Example 17'), san: 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6'.split(' '), text: 'An opening example combining development, defence of central pawns, and castling.' },
  { id: 'capablanca-burn', title: 'Capablanca–Burn, San Sebastian 1911 (opening excerpt)', source: capablanca('Part II, Game 7: Ruy Lopez'), san: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 d3 d6 c3 Be7 Nbd2 O-O Nf1 b5 Bc2 d5 Qe2 dxe4 dxe4 Bc5'.split(' '), text: 'Historical play illustrates supported development and a knight rerouting plan; individual moves still require scrutiny.' },
  { id: 'french-mccutcheon', title: 'Capablanca–Snosko-Borovski, 1913 (opening excerpt)', source: capablanca('Part II, Game 4: French Defence'), san: 'd4 e6 e4 d5 Nc3 Nf6 Bg5 Bb4'.split(' '), text: 'A historical French position with opposing pins and central tension.' },
  { id: 'italian', title: 'Tarrasch–Capablanca: Italian opening excerpt', source: lasker('Part II, Game 4: Giuoco Piano'), san: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2'.split(' '), text: 'Central pawn exchanges interact with development and checking threats.' },
  { id: 'queens-gambit', title: 'Marshall–Capablanca: Queen’s Gambit opening excerpt', source: lasker('Part II, Game 37: Queen’s Gambit Declined'), san: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3'.split(' '), text: 'Development accompanies pressure on the centre and a pin against the knight.' },
  { id: 'sicilian', title: 'Sicilian development variation', source: lasker('Part II, Game 28: analysis after 2.Nf3'), san: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6'.split(' '), text: 'An illustrative continuation exchanging a flank pawn for a central pawn and developing toward the centre.' },
];
