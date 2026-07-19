# Agent Diff Auditor

Agent Diff Auditor reviews Git diffs produced by coding agents before they are merged. It turns a raw unified diff into an intent summary, file-level risk assessment, scope-consistency review, focused code explanations, and targeted test suggestions.

The interface is designed for desktop code review: paste a diff, optionally provide the original task, and inspect each changed file alongside its risk evidence and generated review guidance.

## Features

- Parses unified Git diffs, including multiple files, new files, and pure deletions.
- Summarizes observable changes and compares them with the optional task description.
- Assigns `low`, `medium`, `high`, or `unknown` risk per file, with cited diff lines.
- Flags clearly out-of-scope changes without penalizing reasonable supporting edits.
- Suggests tests only for medium- and high-risk files.
- Explains selected code directly from the displayed diff and nearby context.
- Keeps each analysis independent: a failed or slow section does not hide successful results from other sections.

## Interface

The result screen presents the global change summary, a selectable read-only diff, changed-file risk badges, and a per-file review panel. Selecting text in the diff opens an **Explain this** action; selecting a medium- or high-risk file enables **Suggest tests**.

## Technical stack

- Next.js 14, App Router, TypeScript, React 18
- Tailwind CSS
- Zod for request and LLM-response validation
- Official `openai` Node SDK
- OpenAI Responses API with GPT-5.6 for the production path
- A swappable OpenAI-compatible provider for local development, keeping API costs near zero while building — configurable via LLM_PROVIDER
- Vitest for unit tests
- `simple-git` and `better-sqlite3` are installed for Git integration and local persistence as the project grows

## Installation

Requirements: Node.js 20 or newer and npm.

```bash
npm install
cp .env.example .env
```

On PowerShell, create the environment file with:

```powershell
Copy-Item .env.example .env
```

Fill in the provider key you intend to use. Never commit `.env` or a real API key.

```dotenv
# .env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=your_nvidia_key_here

# Alternative: Gemini
# LLM_PROVIDER=gemini
# GEMINI_API_KEY=your_gemini_key_here

# Alternative: OpenAI
# LLM_PROVIDER=openai
# OPENAI_API_KEY=your_openai_key_here
```

### Providers

- `LLM_PROVIDER=nvidia` requires `NVIDIA_API_KEY`.
- `LLM_PROVIDER=gemini` requires `GEMINI_API_KEY`.
- `LLM_PROVIDER=openai` requires `OPENAI_API_KEY`. It is the production and hackathon-submission path, using GPT-5.6 through the OpenAI Responses API.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a unified Git diff, and select **Analyze**.

Run validation before submitting changes:

```bash
npm test
npx tsc --noEmit
npm run build
```

## Sample data

`fixtures/posts-authbypass-diff.txt` (paired with `fixtures/posts-authbypass-task.txt`)
contains a real example diff and task description that reproduces a detected
authorization bypass — useful for testing the full pipeline (risk, intent,
consistency, and suggested tests) immediately without writing your own diff.

## API routes

| Route | Purpose |
| --- | --- |
| `POST /api/analyze-intent` | Summarizes observed changes and task alignment. |
| `POST /api/analyze-risk` | Produces file-level risks and cited evidence. |
| `POST /api/analyze-consistency` | Detects clearly out-of-scope changes. |
| `POST /api/suggest-tests` | Generates tests for a selected medium/high-risk file. |
| `POST /api/explain` | Explains selected diff text and immediate context. |

Routes validate invalid JSON and invalid request shapes with HTTP 400. Provider failures return a safe HTTP 500 response, while LLM timeouts return HTTP 504. Internal error details and stack traces remain server-side.

## How Codex and GPT-5.6 were used

Codex accelerated implementation by building the first unified-diff parser and its edge-case tests, then applying the same Zod schema/service/route pattern across intent, risk, consistency, test generation, and explanation. It also helped diagnose concrete integration issues, including request-body validation, structured-output API differences, fixture corruption, CommonJS top-level-await behavior, and provider quota errors.

GPT-5.6 is the intended production analyzer. It receives a constrained diff and task context, returns structured responses where appropriate, and is revalidated with Zod before the application displays any result. This keeps model output useful while retaining application-level type and shape guarantees.

During local development, a swappable OpenAI-compatible provider enables real workflows without replacing the production OpenAI integration. The final submission path remains `LLM_PROVIDER=openai` with GPT-5.6.

## Example pull request integration

The included [example workflow](.github/workflows/example-pr-check.yml) is a working demonstration of how Agent Diff Auditor can run in a real GitHub Actions review pipeline: it sends a pull request diff to the public risk endpoint and comments the resulting file-level risks on the pull request. It demonstrates the technical integration path, rather than presenting CI review as an abstract future idea.

![Agent Diff Auditor risk report posted as a PR comment](https://github.com/user-attachments/assets/b9953f04-d07a-4878-8c99-3ce709b25225)

## Security and data boundaries

- API keys are read only by server-side provider factories. Client components call local API routes and never import the OpenAI SDK or access provider environment variables.
- The application sends only the diff, optional task description, or explicitly selected code context required by the chosen operation.
- The code explanation endpoint intentionally does not receive the full diff or task description.
