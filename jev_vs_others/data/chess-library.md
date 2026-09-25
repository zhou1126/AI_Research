# Local chess reference library

Version `classic-chess-1` contains **7 original study-note summaries and 6 move-sequence excerpts**. It is a small curated retrieval corpus, not an index of entire books, a modern opening database, or a chess engine. No book text is downloaded at runtime. No embeddings, vector service, additional API keys, or new dependencies are required.

## Sources and provenance

Sources inspected on 2026-09-24:

- José Raúl Capablanca, [Chess Fundamentals](https://www.gutenberg.org/cache/epub/33870/pg33870-images.html), Project Gutenberg #33870. Notes refer to Part I §§1, 2–3, 5, 6, 13. Move sequences are transcribed from §6 Example 17 (Four Knights), Part II Game 7 (Capablanca–Burn, San Sebastian 1911, first 11 moves), and Game 4 (Capablanca–Snosko-Borovski, St. Petersburg 1913, first 4 moves).
- Edward Lasker, [Chess Strategy](https://www.gutenberg.org/cache/epub/5614/pg5614-images.html), Project Gutenberg #5614. Notes refer to Part I Chapters II, III, VI. Move sequences are transcribed from Part II Game 4 (Tarrasch–Capablanca, through 7.Bd2), Game 37 (Marshall–Capablanca, through 5.e3), and the **analysis variation**, not the played game, after 2.Nf3 in Game 28 (Sicilian, through 5...d6).

Notes are concise original paraphrases, not verbatim book passages or modern publishers' annotations. Historical move records have been converted from descriptive notation into SAN and validated with chess.js. Each entry includes its source and section. Historical moves may be suboptimal; no engine evaluations or win rates are asserted. Source editions, including their publication and reuse notices, remain available at the links above.

## Retrieval

`lib/chess-library.ts` holds the corpus; `lib/retrieval.ts` builds an in-memory position index once per runtime. Exact matching compares the first four FEN fields: pieces, side to move, castling rights, and en passant. This supports transpositions and custom FENs without claiming the current game followed a historical sequence. Move counters are ignored for matching; the current game's history and draw policy still govern play.

At most three matching lines with distinct first moves are returned, each with at most six plies of legal continuation. Historical continuations describe an example, not a prediction that the opponent will cooperate. No approximate-position move recommendation is made. Away from indexed positions, only general study notes are retrieved.

Notes are ranked deterministically using board features: opening/middlegame/endgame, undeveloped minor pieces, available captures, check, pawn endings, opposing bare king, and material advantage. Phase is a heuristic: non-pawn material at most 24 pawn units is an endgame; otherwise fullmove at most 12 and non-pawn material at least 50 is opening; other positions are middlegames. The top three matching notes are returned. Relevance scores are internal retrieval weights, not chess evaluations or probabilities.

## Providers, audit, and comparisons

JEV and DeepSeek receive the references in `state.references` / the JSON user context by default. Both receive the same retrieval results for the same position. Prompt instructions require verifying tactics, exchange costs, and legality before using a reference. The original legal candidate set and final move validation remain in effect. OpenAI, MCTS, and random do not receive this library.

The decision inspector's **Book references supplied** section shows the exact entries, sources, match types, and continuations sent. Decision JSON and CLI benchmark records retain `context.references`, including enabled status and library version. This documents supplied information, not proof that the provider used it.

Use the **Book references (RAG)** switch in Match setup to turn retrieval on or off for subsequent UI requests. It is locked during analysis and discards pending analysis when changed. The explicit request boolean overrides the server default without changing it. Set `CHESS_RAG_ENABLED=false` in the supported environment configuration and restart to change the initial UI default or the fallback for API requests that omit the setting. It also works with the CLI benchmark environment. Compare retrieval-on and retrieval-off runs separately: comparing augmented providers against unaugmented providers measures the whole systems, not only the underlying models. Retrieval itself makes no network calls; the added context can increase provider token charges. Playing-strength improvement has not been measured.

## Extend the library

Add a sourced entry to `STUDY_NOTES` or `BOOK_LINES` in `lib/chess-library.ts`. Use an existing supported feature tag for notes; add and test a detector when introducing a new tag. Lines currently start from the standard initial position and use strict SAN. Provide a stable unique ID, section-specific attribution, and a brief original summary; label played-game excerpts separately from analysis variations. Update `LIBRARY_VERSION` when the corpus changes. Run `npm run verify`; corpus tests replay every stored move and every retrieved continuation. Do not label an illustrative line as engine-optimal without separate evidence.
