# Providers

Nyth Router ships with a static **provider registry** that catalogs 100+ API providers and 175+ models. The registry is metadata-first: every provider has enough metadata to render a card, badge, and model list in the dashboard, but only a few have full forwarding adapters today.

## Statuses

| Status            | Meaning |
|-------------------|---------|
| `implemented`     | Nyth Router can forward live `/v1/chat/completions` traffic to this provider using its adapter. |
| `metadata-only`   | The provider is listed and routable as a target, but the only adapter is the generic OpenAI / Anthropic compatible bridge. |
| `planned`         | Reserved entry for upcoming work - present in the UI as informational only. |

You can see the status badge on each provider card in **Providers** and on the per-provider detail page.

## Categories

The registry groups providers by category for filtering:

- **cloud** - first-party cloud APIs (OpenAI, Anthropic, Google, xAI, Mistral, Cohere, ...)
- **aggregator** - multi-provider routers (OpenRouter, Together, Fireworks, Replicate, Hugging Face, ...)
- **serverless** - pay-per-call inference platforms (Modal, Lambda, Baseten, Cerebras, SambaNova, NIM, ...)
- **enterprise** - hyperscaler / enterprise (Azure OpenAI, AWS Bedrock, Vertex AI, Watsonx, Oracle GenAI, Snowflake Cortex, ...)
- **local** - local runtimes (Ollama, LM Studio, vLLM, llama.cpp, TGI, LocalAI, ...)
- **specialty** - embeddings, rerank, image, audio (Voyage, Jina, Cohere Rerank, Replicate, Stability, ElevenLabs, Deepgram, ...)

## Capabilities

Every provider entry declares one or more of:

`chat`, `completion`, `embeddings`, `image`, `vision`, `audio`, `rerank`, `tools`, `streaming`.

## API formats

Each provider declares one of:

- `openai-compatible` - exposes the OpenAI Chat Completions schema. Works through Nyth Router's OpenAI adapter directly.
- `anthropic-compatible` - exposes Anthropic's `messages` API. Works through Nyth Router's Anthropic adapter (translates messages, system prompt, and response).
- `native` - provider-specific API. Not yet routable through Nyth Router without writing a custom adapter; still listed in the registry for visibility.
- `local` - points at a local URL (`http://localhost:11434`, etc.). Routed through the OpenAI-compatible adapter.

## Adding a custom provider

Custom providers are added through the dashboard:

1. Open **Providers**.
2. Click **Add custom provider** in the top right.
3. Pick `OpenAI-compatible`, `Anthropic-compatible`, or a generic HTTP base URL.
4. Provide name, base URL, and at least one API key.
5. Save. The provider appears under **Custom** category and can be referenced via prefix (`my-provider:gpt-x`) or a route alias.

Custom providers are stored in SQLite alongside the static registry rows; their keys are encrypted at rest using the master secret described in [`SECURITY.md`](SECURITY.md).

## Provider keys

- Each provider supports multiple keys with **priority** ordering.
- Disabled keys are skipped by the route engine.
- The dashboard only ever displays a masked key (`bl_...abcd`); the plaintext is read from the encrypted vault on each request.
- The **Test connection** button on a provider sends a tiny `models.list` (or equivalent) probe to verify the key is live.

## Model registry

Each provider declares a `models` array. Each model carries:

- `id` (`gpt-5.5-mini`, `claude-opus-4.7`, `llama-4-405b`, ...)
- `display`
- `context` (token window)
- `in` / `out` price per 1K tokens (USD; `null` if unknown)
- `capabilities`
- `status` (`GA`, `preview`, `experimental`, `deprecated`)
- `tags`

Models are joined with their provider via the composite primary key `(provider_id, id)` so the same model id can exist across multiple providers (e.g. `openai:gpt-5.5` and `azure-openai:gpt-5.5`).
