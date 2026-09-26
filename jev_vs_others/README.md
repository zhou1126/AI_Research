# AI / Decision Lab

A local research app with three tabs: chess comparisons, room-planning experiments, and a JEV classification notebook. **Chess lab** compares JEV, MCTS, OpenAI, DeepSeek and a random baseline. **Room planning lab** compares JEV with MCTS on the same grid, rules and goal. **JEV notebook** demonstrates typed API calls and compares JEV, a constrained LLM, and a real BERT classifier.

## Run

Node 22.13+ is required.

```sh
cd jev_vs_others # from the AI_Research repository root; Codespaces opens this folder automatically
npm ci
npm run dev -- --host 127.0.0.1
```

Open http://localhost:3000. Port 3000 is fixed; stop another server using that port before starting a second instance.

The app supports environment variables (including Codespaces secrets), an app-folder `.env`, or the parent repository `../.env`. Precedence is environment > app `.env` > parent `.env`. All files are optional. Before starting, the app writes **only allowlisted chess variables** plus its trusted external origin into ignored, server-only `.dev.vars`. Restart after changing keys or models. Unrelated finance keys, GitHub tokens and database settings are not copied. The generated file is refreshed on every start, so removed settings cannot survive as stale secrets. See `.env.example` for supported names. The existing `DEEP_SEEK_*` spelling and `DEEPSEEK_*` aliases both work.

JEV defaults to the official endpoint `https://api.typesafe.ai/v1/systemone` and model `jev-latest`. Override with `JEV_API_URL` / `JEV_MODEL`. OpenAI and DeepSeek use the model names in your `.env`; no model substitution is performed by the app. Providers may resolve aliases to another version, recorded in decisions. Keys never go to the browser or exports. Local keys are not automatically uploaded to hosting.

## Use the interface

- Choose White and Black at any paused position, including after the first move. Changing an engine preserves the board and complete history, but clears pending analysis. Selectors lock only during an active request or automatic match. Games using multiple engines on one side are labeled with all participating engines in PGN and match results; each journal entry retains its actual engine.
- **Compare this position** asks both selected AIs about the same board without playing either move. This deliberately evaluates both as the side to move, regardless of their assigned match color.
- **Step-by-step** is the default: click **Analyze next move** to obtain a decision without moving a piece, inspect the green legal destinations, then click **Play [move]** to apply that exact decision. Applying it makes no additional API call. Repeat for each ply. Changing players or resetting invalidates a pending move.
- **Automatic** mode exposes **Play match**, which continues until a result, pause, provider error or ply limit. API turns consume credits. Default limit: 160 additional plies per run.
- **Run learning series:** select the learning player (JEV, OpenAI, or DeepSeek), enter 1–20 games, and start. Games alternate colors, use the loaded starting FEN and match ply limit, and supply the learner with reports from every earlier game in that series. **Pause** / **Resume learning series** preserves interrupted games and uses the saved series settings. New series start with fresh memory.
- **Run color-swapped pair** plays two games from the current position with colors reversed and identical settings. For balanced research, use the initial position or a balanced opening suite.
- The board shows all legal destinations in green. After analysis, light-to-dark intensity represents relative JEV choice probability or MCTS visit share. Percentage labels retain their original values; when multiple moves reach one square, their weights are added. Select a source piece to isolate its moves without renormalizing probabilities; select a destination to filter the candidate list (including separate promotion choices). Unscored LLM candidates are uniformly green; no probabilities are invented.
- Click any candidate row to preview its resulting board; click **Back to legal moves** to return to its pre-move board. Candidates and heatmaps always belong to the inspected decision's position.
- Toggle **Book references (RAG)** in Match setup to enable or disable retrieval for JEV and DeepSeek. It applies to manual moves, automatic games, and comparisons. Changing it while paused discards pending analysis without changing the board or journal. Each decision retains its own retrieval setting.
- After a JEV or DeepSeek decision, expand **Book references supplied** to see the retrieved study notes, matching historical continuations, and source links. These are supplied references, not a claim that the model followed them.
- Expand **Exact context sent to the model** to inspect the complete shared input, including history, piece values, material totals and legal moves. This exact context is also included in Decision JSON.
- The **Move journal** restores the position before a recorded move, its candidates, probabilities/search statistics and latency.
- Export current-game **PGN** or **Decision JSON**. JSON includes settings, every move decision, token usage where available and completed pair records. Browser state is in memory: export before refreshing.
- Optional FEN loading supports tactical positions. FEN syntax is validated; historical reachability of arbitrary custom positions is not proven. Repetition history begins at the imported position.

## JEV notebook

Open **JEV notebook** in the navigation or visit `/notebook`. This is a notebook-style UI with numbered input/output cells, not an arbitrary Python execution service.

- **Run basic Choice** starts with one question and four steps: set the statement, define categories, send one request, and read the choice and probabilities. The cell shows the exact request, a live answer, and a copyable Node.js 22 script. The next cell gives separate runnable **Choice**, **Score**, and **Noul** examples, each with its own one-question request and answer. **Run JEV example** then combines all three in one request. Credentials remain server-side in the app. Shapes follow the official [Choice](https://docs.typesafe.ai/primitives/choice), [Score](https://docs.typesafe.ai/primitives/score), and [Noul](https://docs.typesafe.ai/primitives/noul) documentation.
- **Run comparison** uses 50 original synthetic financial-sentiment statements: 17 positive, 16 neutral, 17 negative. A 5-question trial is also available. Labels were assigned when writing the examples and are not independently validated. This demonstrates measurement; it does not establish general model superiority. View the full answer key before running. It is never included in inference requests.
- Select JEV, an LLM (OpenAI or DeepSeek), and/or BERT. The model names come from existing environment settings. OpenAI uses a strict JSON-schema enum; DeepSeek uses JSON mode with the same categories in its prompt and rejects invalid output. No LLM confidence scores are synthesized. JEV receives the same category definitions through Choice.
- BERT is [Xenova/finbert](https://huggingface.co/Xenova/finbert), the ONNX version of ProsusAI's financial-sentiment BERT, pinned to revision `8f269abebfdd9009d7d9b5e96af7e5c6bfe50b20`, quantization `q8`. It is already fine-tuned for this domain; the remote models are prompted, so training conditions differ. Transformers.js 3.8.1 runs it in a dedicated browser worker with single-thread WASM, including when the app runs in Codespaces. It needs no API key, Python, GPU, or cross-origin isolation. The initial download is approximately 110 MB of weights plus runtime files; browser access to Hugging Face and jsDelivr is required. Nothing is downloaded merely by opening the tab. Downloads can be cached; loading time is measured separately.
- The **JEV request mode** can use 50 separate calls or all 50 Choice questions in one call (also works for the 5-question trial). The batch has a shared structured state with one statement per ID; each question explicitly refers to its own statement. See JEV's [parallel questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions). The batched request is sent before other models. Separate requests and the LLM/BERT runs proceed sequentially, rotating model order per question. Full default comparison makes up to 100 paid calls (50 JEV + 50 LLM); batch mode reduces that to 51. Stop cancels the current request/worker and retains completed attempts. Failures record an error and pause the run. Resume uses the original settings, skips all recorded attempts including errors, and never silently retries a paid call. A new run clears the current results and retries the set.
- Results include accuracy, macro precision/recall/F1, per-class metrics, a confusion matrix with an error column, valid-response coverage, total prediction time and mean latency. Accuracy uses all attempted questions, including errors. Errors also count as false negatives for the expected class. Zero-denominator per-class scores are zero; macro scores average the three classes. Unattempted questions are excluded and partial results are labeled. Compare quality only on matching completed sets.
- Timing is end-to-end round-trip latency, not matched-hardware inference speed: remote APIs include network/service time, while BERT runs on the user's device. Batch mode records the one JEV round trip and divides it across questions for the per-question column; those fractions are amortized cost, not individual inference timings. Batch mode exposes every statement in one shared state, so its context differs from the single-statement mode and accuracy comparisons need that caveat. Server request or worker inference time is separately retained in each result. Total active wall time includes loading and orchestration but excludes time paused between resume sessions. The BERT model may remain loaded for a subsequent run (zero new load time).
- Expand a prediction for the request/response and probabilities. Export includes question texts and labels, dataset version, model settings, actual returned model IDs, timings, failures, metrics and probabilities. Export before refreshing or changing tabs; results are session-only.

No JEV/LLM calls are made during tests. For an optional real BERT check that downloads weights into ignored `.cache/transformers` and runs all 50 questions in Node CPU mode (not browser WASM):

```sh
npm run smoke:bert
```

With the dev server running, `npm run smoke:worker` loads the complete served worker module graph in a window-free JavaScript context. It checks worker initialization and message handling without downloading weights or making paid calls. This catches framework rewrites of runtime guards in both BERT dependencies and Vite’s HMR client.

The browser notebook always runs fresh measurements; the smoke check does not prefill its results.

## Room planning lab

Open **Room planning lab** in the top navigation, or visit `/room`. The rules and selected goal appear first. The default view uses a photographic floor, realistic generated object images and raised walls; switch to **Flat top view** with the view button. Layout editing always uses the flat view. All images are bundled locally for Codespaces; provenance and generation prompts are in `public/room/ASSETS.md`. Chess remains at `/`. Each page keeps its session in memory; export before refreshing or switching labs.

1. Choose an example and write **Location**, **Situation**, and **Purpose**.
2. Set the executable **Goal condition**: reach the exit, or collect the parcel and reach the exit. Prose provides JEV with context; MCTS consumes the structured map and goal, not natural-language meaning. Text does not create additional rules, objects, hazards or success conditions.
3. Select **Edit room layout**, choose a tool, and click cells to paint walls/floor or place start, exit, key, parcel and door. There can be at most one of each object, exactly one start/exit, and a parcel is required for the delivery goal. Presets use 7×7 grids; the API accepts rectangular grids from 3×3 to 10×10.
4. Set the MCTS simulation budget, rollout depth, seed and maximum actions per planner. **Analyze JEV** / **Analyze MCTS** prepare one legal action without changing the room or step count. Inspect the choices, then click **Apply JEV action** / **Apply MCTS action** to execute that exact decision with no additional API request. Each planner can hold its own pending decision. **Run comparison** advances independent copies of the same room, alternating planners until each succeeds or reaches the limit. Automatic comparison reuses any pending decisions before requesting more. Pause cancels the current request; run again to continue. Errors pause the comparison without invented fallback actions or automatic paid retries.
5. Inspect JEV action-choice probabilities or MCTS visit counts, heuristic values, UCT scores and the latest tree path. Legal actions appear on green floor tiles before analysis, with “Analyze” in place of unknown scores. After analysis, large arrows and percentages are painted directly on the destination floor tiles. Object images shrink to leave floor space for pickup and unlock scores. The room displays JEV probabilities, using darker green for larger values and a gold outline for the selected action. MCTS overlays normalized root visit shares, explicitly labeled as **not probabilities**. Scores can be hidden. Action-history buttons show both the earlier decision and its matching **pre-action room snapshot**; **Return to current room** restores the current state or pending preview. After applying an action, old scores clear until the next analysis.
6. Compare success status first, then step counts and extra actions beyond the exact shortest plan. Failed/capped runs have no successful step score. Export JSON for descriptions, maps, budgets, action histories, decisions, contexts and completed comparison pairs. Editing the room or settings resets current runs and pending decisions; completed pairs remain in the export for this page session.

### Room rules and measurement

The map is fully visible and deterministic. Coordinates start at `(0,0)` in the top left. `#` is a wall, `.` floor, `S` start, `E` exit, `K` key, `P` parcel, and `D` a locked door. Cardinal movement cannot cross walls or locked doors. Collecting a key/parcel requires standing on its cell and issuing a pickup action. Unlocking requires the key and a cardinally adjacent door. The key is retained, the door stays open, and objects do not respawn. **Every movement, pickup and unlock costs one step.** Reaching the exit completes the exit goal; delivery additionally requires holding the parcel. There is no pickup, unlock or exit action hidden in a movement.

A breadth-first search over position **and inventory/door state** computes the exact shortest plan for the displayed benchmark and validates reachability. Neither planner is given that plan or its length. Impossible maps are blocked before paid requests; a step budget below the optimum is labeled as insufficient. Server and client both replay history and reject illegal actions. The room endpoint uses the same origin protection and server-only JEV credentials as chess. Room planning does not inherit chess prompts, chess RAG or chess learning-series memory.

### Room MCTS

This is a single-agent UCT planner; there is no adversarial turn. Each simulation selects children using average return plus `sqrt(2) * sqrt(log(parent visits) / child visits)`, expands a legal action, then rolls out within the remaining action budget. Rollouts mix 25% random selection with a Manhattan-distance guide through key, door, parcel (when required), and exit; unvisited states are preferred where possible. This is a heuristic and may take unnecessary detours when a door can be bypassed. Search does not use the shortest-path oracle.

Success earns `1 + 10 / (1 + simulated actions)`; incomplete rollout estimates remain below 0.5 and use subgoal distance, inventory progress and action cost. Repeated states from actual play receive a small penalty on incomplete rollouts. Successful shorter plans therefore receive higher returns. Final action uses the most visits, breaking ties by mean return. These values are **not probabilities**. Progress streams every 25 simulations. Default options are 300 simulations, rollout depth 40, seed 42 and a 60-action cap; runtime checks used no provider calls. Shortest paths for the bundled delivery and navigation presets are 13 and 8 actions respectively. Finite-budget MCTS is not guaranteed optimal on arbitrary maps.

## Rules and enforcement

`chess.js` generates legal moves and handles check, checkmate, stalemate, castling (including attacked transit squares), en passant, pins and all four promotion types. Move choices use UCI, so underpromotions remain distinct. The server reconstructs the full game from the initial FEN and move history before analysis; the client validates the returned move again before playing it.

Both AIs always exercise a claim when the current position meets threefold repetition or the 50-move rule. This is an explicit match policy; it does not confuse those claimable draws with FIDE's automatic fivefold/75-move rules. Checkmate takes precedence. Common insufficient-material draws are detected. As with many lightweight chess libraries, exhaustive detection of unusual dead positions (e.g. completely locked positions where mate is impossible through any legal continuation) is not implemented. There is no chess clock or timeout-forfeit policy. A provider timeout/error pauses the game, and a research ply cap records `*` (unfinished), **not a draw**.

No illegal model response is silently replaced by a fallback move. API errors, invalid JSON, illegal moves or invalid JEV probability distributions leave the board unchanged and are reported. There are no automatic paid retries.

## Algorithms

### JEV

JEV, OpenAI and DeepSeek receive the same base chess context built by `lib/context.ts`: original and current FENs, ASCII board, side to move, full SAN/UCI history, PGN, per-ply side/move number/capture/promotion records, material totals, and **every** legal next move with its resulting FEN. Shared piece values are pawn=1, knight=3, bishop=3, rook=5, queen=9, with the king explicitly priceless (excluded from material totals). The objective is to win by checkmate, with material secondary. The shared checklist asks models to consider mating moves, the opponent's strongest replies, king safety and hanging pieces. Supplying this information does not guarantee strong chess play. History was already present in version 1; version 2 expands its representation and adds explicit piece values and material context. A single typed `choice` question maps UCI move IDs to candidate descriptions. The API's `choice` becomes the selected move; the returned probability map is validated to contain exactly the legal move set, with finite probabilities in [0,1] summing to 1 within a 0.02 rounding tolerance. Probabilities are displayed without normalization or invented scores. JEV probabilities concern the supplied move-choice question; they are **not calibrated probabilities of winning the chess game**. JEV does not provide a free-text reasoning trace.

### Book retrieval (JEV and DeepSeek)

JEV and DeepSeek now receive a local reference library by default: seven concise study notes and six opening/classic-game excerpts from Capablanca's *Chess Fundamentals* and Edward Lasker's *Chess Strategy*. Exact position matching retrieves legal historical continuations; board features retrieve relevant general notes. At most three lines and three notes are sent per move. References are advisory; current tactics, exchange costs, draw conditions, and legal-move validation take priority.

Source links, matching reasons, library version, and supplied entries are visible in the inspector and preserved in Decision JSON and benchmark records. This is a small curated corpus, not full-book semantic search or a guarantee of stronger play. Retrieval runs locally without additional keys or network calls, including in Codespaces; longer provider prompts may cost more tokens. OpenAI and MCTS do not receive the added references. Use the **Book references (RAG)** switch for baseline experiments without restarting. `CHESS_RAG_ENABLED` sets the initial UI default and remains the fallback for API requests that omit `ragEnabled` and for CLI runs. Report retrieval-on and retrieval-off results separately. See [library provenance and extension guide](data/chess-library.md).

### Learning series

This is **in-context learning from game reports**, not fine-tuning or persistent changes to provider weights. The selected learner can be JEV, OpenAI, or DeepSeek; the other player can be any supported engine. Only the learner receives experience, even if both sides use the same provider. Book RAG is independent: turning it off does not remove series memory.

Each of the 1–20 games starts from the same initial FEN with empty move history. The learner alternates colors; per-game random seeds vary deterministically. Game N receives a compact report for **every game 1 through N−1** on each learner move. Each report contains the actual result, opening moves, final position and recent sequence, material totals, and up to three adverse two-ply exchanges with positions and moves. Rule-based review suggestions encourage checking those situations; no extra LLM review calls are made. Exchanges are review candidates, not proven blunders: later compensation may exist. Reports do not guarantee improved play.

Material uses P=1, N=3, B=3, R=5, Q=9; kings are excluded. From the learner's perspective:

- Balance = own remaining material − opposing remaining material.
- **Deficit = max(0, opposing remaining material − own remaining material).**
- Balance change = final balance − initial balance, accounting for custom starting positions.

Deficit is recorded for every game, including games without checkmate. A material lead does not turn a draw or capped game into a win. Checkmate determines win/loss; actual draw conditions remain draws; reaching the ply limit remains unfinished. Interrupted or failed games are not reviewed or counted until resumed and completed or capped. Provider failures stop the series without automatic paid retries.

The server validates and replays supplied prior games before building memory and caches at most 40 verified summaries per runtime. Client-supplied prose is not passed through as lessons. The learning context is stored in each learner decision. The progress panel shows results, deficits and review notes. **Decision JSON** includes all series games, full move histories, decisions, PGNs, reviews, settings, and earlier series from the current session. Memory is in the open page and is lost on refresh; export to save it. The export is an audit artifact, not an import/resume feature. Ordinary manual matches and CLI benchmarks do not implicitly inherit series memory.

Keep the page open while the series runs. Each provider move incurs the normal API call, with extra prompt tokens for experience; longer series can therefore cost more. Resume restores captured search, RAG and matchup settings even if controls were changed while paused. Starting another series archives the previous one in the session export and starts memory from zero.

### MCTS

A seeded, adversarial UCT search:

1. **Selection:** Follow children with maximum `Q + c * sqrt(log(N) / n)` while a node is fully expanded. `Q` is the mean root-player reward at root-player nodes and `1-Q` at opponent nodes. Thus the opponent is modeled as trying to defeat the root player.
2. **Expansion:** Uniformly select one unexpanded legal move.
3. **Simulation:** Sample random legal moves up to the configured rollout depth, stopping at a terminal result.
4. **Evaluation:** Terminal root wins/losses/draws score 1/0/0.5. A nonterminal cutoff uses `sigmoid(root_material_advantage / 4)`, clamped to [0.01, 0.99], with the same shared pawn=1, knight=3, bishop=3, rook=5, queen=9 values. The king has no tradable material value. Terminal wins and losses therefore remain strictly beyond any nonterminal material estimate.
5. **Backpropagation:** Add the root-perspective reward to every node visited in this simulation.
6. **Final choice:** Pick the root child with the most visits, breaking ties by mean root reward.

Full game history is maintained through `move`/`undo` during search, preserving repetition. Progress is streamed every 25 simulations. The inspector shows all root candidates, visit share, mean reward `Q`, the current UCT score, latest tree selection/expansion path and leader snapshots. The exploration term is available in JSON. UCT scores displayed are recomputed after the latest simulation for the next selection; final choice uses visits, not maximum UCT. Unvisited moves show zero visits and no value/UCT. This is an educational MCTS baseline with shallow random rollouts, **not a competitive chess engine or Stockfish substitute**.

### OpenAI / DeepSeek / Random

Chat providers receive the same position and legal candidates and return JSON containing a UCI move plus a brief public chess rationale. The app validates that response. It does not expose private reasoning or fabricate probabilities for these models. The random baseline uses a uniform seeded selection, displaying exactly `1 / legal_move_count`.

## Reproducible comparisons

```sh
npm run benchmark -- --a=jev --b=mcts --pairs=5 --iterations=500 --depth=16 --seed=42 --max-plies=200
npm run benchmark -- --a=mcts --b=random --pairs=1 --iterations=25 --depth=3 --max-plies=12
```

This CLI uses the same algorithms and rules as the UI. It alternates colors within each pair, records model IDs, seeds, settings, FENs, legal candidates, latencies, token usage and PGN, and saves results after every game under ignored `outputs/benchmark-*.json`. Games stopped by provider failure or ply caps are reported separately from wins/losses/draws. Each pair uses a shared seed schedule; MCTS is reproducible, but remote model responses are not guaranteed deterministic. Pin a versioned JEV model for stable experiments.

For useful results, run multiple color-swapped pairs across varied balanced openings and seeds. Report completed W/D/L **and** errors/unfinished counts, move latency and API token usage. A short smoke match establishes functionality only; it provides no evidence of playing-strength superiority. Simulation budgets are not equal compute budgets across different model families, so report them explicitly. No Elo or statistical significance is inferred by this app.

## Verification

```sh
npm test
npm run typecheck
npm run build
# Optional live calls; consume provider credits:
npm run smoke:providers
# Requires dev server; makes one JEV call:
node scripts/http-smoke.mjs
```

Tests cover legal move generation/resulting FENs, illegal move rejection without mutation, castling, en passant under pins, all promotions, mate/stalemate, history-based repetition, fifty-move claims, insufficient material, deterministic MCTS/root-visit accounting/history preservation, tactical mate selection, and provider probability/error validation. Additional tests verify identical provider contexts, full history/capture/promotion records, shared MCTS piece values and terminal dominance, heatmap aggregation, stale-decision rejection, and actual React component interactions for post-move player switching, analyze-then-play without duplicate API requests, automatic play and cancellation. The HTTP smoke test checks the page, configuration, real JEV response, streamed MCTS progress, illegal-history rejection and cross-origin rejection.

## Code map

- `lib/learning.ts`, `lib/series.ts`: verified cumulative game reports and series state.
- `lib/room.ts`, `lib/room-search.ts`, `lib/room-provider.ts`: shared room simulator, shortest-path benchmark, UCT planner and JEV adapter.
- `app/room/page.tsx`, `app/api/room/analyze/route.ts`: room UI and streamed analysis.
- `lib/context.ts`: shared chess inputs, optional reference context, and material values.
- `lib/chess-library.ts`, `lib/retrieval.ts`: sourced corpus and deterministic local retrieval.
- `data/chess-library.md`: provenance, retrieval behavior, and extension guide.
- `lib/heatmap.ts`: destination aggregation and pending-decision validation.
- `app/components/Board.tsx`: interactive green legal-move overlay.
- `lib/chess.ts`: shared rules, replay, legal candidates and draw policy.
- `lib/mcts.ts`: seeded UCT algorithm and instrumentation.
- `lib/providers.ts`: JEV / OpenAI / DeepSeek / random adapters.
- `app/api/analyze/route.ts`: validated server-side NDJSON analysis endpoint.
- `app/page.tsx`: board, candidate previews, match controls, journal and exports.
- `scripts/benchmark.ts`: paired headless comparisons.

## Primary references

- [chess.js rules API](https://jhlywa.github.io/chess.js/)
- [Official JEV quickstart and choice response](https://docs.typesafe.ai/introduction/quickstart)
- [OpenAI structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs)
- [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/)


## GitHub Codespaces

This app lives in **`AI_Research/jev_vs_others/`**. The repository-root `.devcontainer/devcontainer.json` opens that app folder and runs `npm ci` there. The repository-root `.github/workflows/jev-vs-others.yml` runs all app commands with `working-directory: jev_vs_others`. App source, images and lockfile remain together inside the folder. Credentials, downloaded weights, dependencies and generated build files are ignored.

1. In GitHub, open the repository and choose **Code > Codespaces > Create codespace on main**. The checked-in dev container uses Node 22 on Debian Bookworm and runs `npm ci` automatically.
2. For API players, configure account or repository **Codespaces secrets** (not Actions secrets): `JEV_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DEEP_SEEK_API_KEY`, and `DEEP_SEEK_MODEL`. Optional settings are listed in `.env.example`. Grant the secrets access to this repository. Keep your current model names; model access depends on your provider account. JEV defaults to `jev-latest`.
3. Alternatively, create `jev_vs_others/.env` from `jev_vs_others/.env.example` and fill it in inside the codespace. This file stays ignored. If using Codespaces secrets, no `.env` file is needed.
4. Run `npm run dev` in the opened app folder. If your terminal is at the repository root, first run `cd jev_vs_others`. Open port **3000** from the **Ports** panel. Keep its visibility **Private** because this app uses your API credits and has no separate app login. The app does not start automatically or make paid calls when the codespace opens.
5. If you add/change Codespaces secrets, stop and restart the codespace to refresh its environment, then run `npm run dev` again.

Codespaces' exact forwarded HTTPS hostname is derived from its environment. Vite binds to `0.0.0.0`, permits that hostname, and uses its secure WebSocket for HMR. The API accepts that explicit origin without trusting arbitrary forwarded-host headers. Outside Codespaces, `APP_ORIGIN` may be set for another trusted reverse proxy.

**Offline/local algorithms need no API keys:** select MCTS and Random. They also work in the CLI with no `.env`:

```sh
npm run benchmark -- --a=mcts --b=random --pairs=1 --iterations=25 --depth=2 --max-plies=4
npm run verify
# With the development server already running; no provider calls:
npm run smoke:local
```

The GitHub Actions workflow runs a clean install, tests, type checking, production build, local HTTP smoke test, worker initialization check, and a small headless benchmark on Ubuntu with Node 22. No API secrets are required for CI. Actual remote API checks remain opt-in with `npm run smoke:providers`.

References: [GitHub Node.js dev containers](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/setting-up-your-nodejs-project-for-codespaces), [Codespaces secrets](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces).


### OpenAI response completion

OpenAI uses a strict JSON schema whose move field is an enum of the current legal moves. The default completion cap is 8,192 tokens (previously 1,500); this includes non-visible reasoning as well as the returned JSON. Set `OPENAI_MAX_COMPLETION_TOKENS` in your environment, Codespaces secrets, or `.env` to an integer from 256 to 32,768, then restart the server. Increasing the cap permits higher usage on demanding positions; it does not force every response to use the full allowance.

Truncated completions, refusals, empty content, malformed JSON and invalid move fields have distinct error messages. The app rejects a `length` finish reason even if a partial reply happens to parse. Errors never advance the board, fabricate a move or trigger an automatic paid retry. Successful decision exports include the completion cap and finish reason. The selected model is unchanged.

See [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [token counting](https://developers.openai.com/api/docs/guides/token-counting).
