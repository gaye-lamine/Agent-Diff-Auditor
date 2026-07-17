# Development Notes — Agent Diff Auditor

## /feedback Codex Session ID

This development session received feedback through session ID `019f6853-0d0e-7520-b8ad-4e95e01c88c4` at `/feedback`.

## Architecture Decisions

- The application uses an interface-and-factory pattern for IntentAnalyzer,
  RiskAnalyzer, and ConsistencyAnalyzer. Routes call provider-selecting
  factories, while the business logic stays behind the interfaces. The selected
  provider comes from one environment variable, LLM_PROVIDER: OpenAI with
  gpt-5.6 for the final production-oriented path, or NVIDIA NIM with
  DeepSeek V4 Pro and a DeepSeek V4 Flash fallback for local development and
  debugging.
- OpenAI and NVIDIA use different API surfaces because the project calls each
  provider through the API shape it supports. OpenAI uses
  client.responses.create() and Structured Outputs under text.format.
  NVIDIA NIM uses the OpenAI-compatible Chat Completions endpoint through
  client.chat.completions.create() and response_format. Both paths produce
  the same application-level result types.
- LLM output is always validated with Zod before the UI or route returns it.
  Structured Outputs constrain the provider response, but local validation
  remains the final boundary for application data.

## Incidents Resolved During Development

- The manually copied test diff became corrupted: added lines lost their plus
  prefix, some lines became removals, and context spacing changed. The fixture
  is now generated from a temporary Git repository with git diff --no-color,
  which produces a syntactically valid unified diff instead of relying on
  manual transcription.
- The manual test script appeared to exit silently after a top-level await
  was added. tsx reported that top-level await is unsupported with its CommonJS
  output mode in this project. The script now uses a conventional
  run().catch(...) entry point and explicit progress logs.
- A real OpenAI test returned 429 insufficient_quota. NVIDIA NIM was added as
  a separate local development and debugging provider, leaving the OpenAI
  gpt-5.6 path available for final tests and the demo when quota is available.

## Where Codex Accelerated the Work

- It created the initial unified-diff parser and Vitest coverage for a single
  hunk, multiple hunks, a new file, and a pure deletion.
- It established and repeated the same schema, service, and route structure
  across intent, risk, and consistency analysis features.
- It diagnosed concrete failures from their output, including the request-body
  type mismatch, the incorrect Responses Structured Outputs field, the
  PowerShell UTF-16 redirection issue, the tsx CommonJS top-level-await
  failure, and the OpenAI quota response.
- It generated a real Git fixture and verified its byte-level representation
  before it was sent to the local-development provider.

## Where Human Decisions Were Necessary

- The decision to generate the fixture through Git rather than continue manual
  diff copying was made after repeated fixture corruption.
- The budget and quota trade-off was explicit: NVIDIA NIM is used for local
  development and debugging, while OpenAI and gpt-5.6 remain the intended
  final provider path.
- The project did not migrate to ESM after the tsx issue. Keeping the existing
  CommonJS-compatible execution path reduced change risk close to the deadline.
