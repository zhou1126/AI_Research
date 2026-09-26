# AI Research

Research applications and reproducible experiments.

## JEV versus other approaches

The application is in [`jev_vs_others/`](jev_vs_others/README.md).

- **JEV notebook** — runnable Choice, Score and Noul examples; compare JEV, OpenAI/DeepSeek and FinBERT on 50 labeled classification questions, with runtime and quality metrics.
- **About Jev** — slide-style briefing on the model, typed outputs, token limits, published speed and pricing, evidence limits, and a live roster-to-vendor mapping example.
- **Chess lab** — legal chess with JEV, LLMs and MCTS, inspectable decisions, book retrieval and repeated-game experiments.
- **Room planning lab** — compare JEV and MCTS in an editable room, with step controls and action probabilities on the floor.

## Open in Codespaces

1. Choose **Code → Codespaces → Create codespace on main**. The root dev-container configuration opens `jev_vs_others` with Node 22 and installs dependencies.
2. Add your API keys and model names as **Codespaces secrets** with access to `zhou1126/AI_Research`. See [`jev_vs_others/.env.example`](jev_vs_others/.env.example). Alternatively, copy that example to `jev_vs_others/.env` inside the codespace and fill it in. Real `.env` files are ignored and are not included in this repository.
3. Run `npm run dev` in the opened terminal. From the repository root, first run `cd jev_vs_others`.
4. Open forwarded port **3000**, keeping it **Private**. BERT, MCTS and random baselines can run without paid API credentials. JEV and LLM requests use your provider credits only when you run them.

BERT runs in the browser and downloads public weights on first use. No Python or GPU setup is required. If you change Codespaces secrets, restart the codespace, then restart the app.

## Local use

```sh
cd jev_vs_others
npm ci
npm run dev
```

## Verify

```sh
cd jev_vs_others
npm run verify
# With the dev server running:
npm run smoke:local
npm run smoke:worker
```

Ubuntu CI performs the same clean-install, build, tests, forwarded-origin, worker and local benchmark checks without provider API keys. See the [app guide](jev_vs_others/README.md) for details.
