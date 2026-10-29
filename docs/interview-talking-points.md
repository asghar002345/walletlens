# WalletLens: interview talking points

These are notes for talking through the project. Every number here comes from mock mode, and there are no users or
production traffic to talk about.

## 30-second version

WalletLens explains a testnet transaction or an unsigned signing request before you sign it. An agent calls
read-only chain tools and retrieves curated security notes. It then has to return a Zod-validated verdict where
every reason cites evidence that really exists. If it can't, it answers "unknown" instead of guessing. The whole
thing runs offline in mock mode, has an eval set gated in CI, and falls back Groq → Gemini → mock on errors or caps.

## Design choices worth explaining

1. **Mockable everything.** `ChainReader`, `LlmProvider`, `Retriever` and the embedder are all interfaces. The mock
   model is a rule-based planner, not canned text, so the real loop, validation, logging and evals run with no keys
   and no network. Trade-off: mock-mode eval scores say little about a real LLM, and the README says so.
2. **Evidence-checked structured output.** The verdict goes through three checks: JSON parse → schema → evidence
   refs (`tool:<name>` must have succeeded, `note:<id>` must have been retrieved). One repair turn runs with tools
   disabled, then the run fails closed to `unknown`. Why: a fluent but uncited answer is worse than "I don't know" in
   a security tool.
3. **Prompt injection from on-chain data.** Token names are attacker-controlled. They are sanitized (zero-width and
   bidi characters stripped, length capped), wrapped as untrusted tool output, and flagged in the UI. Retrieval
   queries are built from decoded flags, never from the raw strings. The eval set has four injection cases.
4. **Retrieval and verdict scored separately.** recall@3 and MRR on retrieval, and accuracy, unknown
   precision/recall and citation validity on verdicts. That way a regression points at the right layer. The CI gate
   reads the thresholds from `server/evals/thresholds.json`.
5. **Free-tier engineering.** Caps per provider per minute and per day are counted in Mongo (so they survive
   restarts and work across instances), with rollback when a call is rejected and Mongo caching for tx lookups and
   embeddings. Evals get their own lower caps so they can't use up the app's quota.
6. **Fallback chain.** Groq → Gemini → mock on an HTTP error, timeout or cap. A run stays on the provider that worked
   and records the reason for each switch. A dev-only fault drill shows the path without keys. The metrics page shows
   p50/p95 latency, tokens and fallback paths from stored traces.
7. **Never sign, enforced.** It's enforced by tooling, not just policy: an ESLint rule and a source-scan test fail
   the build if signing or sending APIs appear. The server never sees key material, and only testnet chain ids are
   accepted.

## Honest limitations / what I'd do next

- I haven't measured it with a real LLM yet. Next would be a live eval run with `EVAL_MAX_CASES` and the eval caps,
  comparing Groq and Gemini.
- Offline retrieval uses hashed keyword vectors. It's good enough for tests, while Atlas Vector Search with Gemini
  embeddings is the live path.
- The eval set has 28 hand-written cases, and the mock rules were written alongside them. It needs more varied and
  adversarial cases, ideally from real testnet transactions.
- There is no transaction simulation yet. A trace or simulation (for example via a testnet fork) would show balance
  changes.
- The free Render plan sleeps when idle, so the first request is slow.

## Likely questions

- _Why not let the model call any RPC method?_ The tools are a small read-only allow-list with Zod-validated
  arguments, and every call is audited, including rejected ones.
- _How do you stop hallucinated citations?_ Citations are validated against what actually ran or was retrieved.
  Invalid ones trigger the repair turn and then `unknown`.
- _What happens when Groq rate-limits you?_ The per-provider cap usually trips first. Either way, the run moves to
  Gemini, then to mock, and the UI shows a notice.
- _How is this tested without keys?_ With fake `fetch` for the provider adapters, mongodb-memory-server, fixture
  chain data, wagmi's mock connector, and the mock-mode eval in CI.
