# Routing

Bigliner's route engine decides which provider/model serves each `/v1/chat/completions` request. The engine takes the `model` field from the incoming request and resolves it through three matching strategies, in order.

## 1. Provider prefix

If the model string contains a colon, the part before the colon is treated as a provider id.

```text
openai:gpt-5.5
anthropic:claude-opus-4.7
groq:llama-4-70b-instruct
ollama:qwen2.5:7b      # only the first colon counts; rest is the model id
```

The engine looks up the provider by id, picks the highest-priority enabled key, and forwards through that provider's adapter.

## 2. Route alias

If the model string is not a prefix, the engine checks for a route with `name === model`. Routes are user-defined on the **Routes** page and have an ordered list of steps, each with:

- `provider` (id)
- `model`
- optional `condition` (max cost, requires tools / vision / streaming, region, …)
- `on_failure` (`retry`, `fallback`, `error`)

Default aliases seeded on first boot:

| Alias              | Description |
|--------------------|-------------|
| `bigliner-smart`   | High-quality default (Claude Opus → GPT-5.5 → Gemini 3 Pro). |
| `bigliner-fast`    | Latency-optimised lane (Groq Llama 4 70B → Cerebras → DeepSeek V3). |
| `bigliner-cheap`   | Cost-optimised lane (DeepSeek V3 → Mistral small → Gemini Flash). |
| `bigliner-vision`  | Vision-capable lane (GPT-5.5 vision → Claude Sonnet vision → Gemini 3 Pro vision). |
| `bigliner-local`   | Local runtimes only (Ollama → LM Studio → vLLM). |

You can edit / disable / delete the defaults; the engine never recreates them after boot.

## 3. Bare model id

If the model is neither a prefix nor an alias, the engine searches the model registry for a match by `id`. The first matching `(provider, model)` pair becomes the route. If multiple providers expose the same model (e.g. `gpt-5.5` on `openai` and `azure-openai`), the route picks the one with an enabled key, falling back to provider priority order.

## Default route

If none of the strategies above match, the request runs through the configured default route (`Settings → Default route`, default `bigliner-smart`).

## Fallback chain

Each route step has an `on_failure` action:

- `error` — surface the provider error verbatim.
- `retry` — retry the same step (with bounded backoff, default 2 retries).
- `fallback` — move on to the next step in the route.

Errors that trigger `fallback`/`retry`:

- HTTP 429 (rate limited)
- HTTP 5xx
- network timeouts (default 30s; configurable per route)

The fallback chain for each request is recorded in `request_logs.fallback_chain` and visible in the **Logs** detail drawer.

## Conditions

Each step can attach optional conditions; if a condition fails, the engine skips the step and moves on.

| Condition           | Type | Behaviour |
|---------------------|------|-----------|
| `max_cost`          | number | Skip if estimated cost exceeds this value (USD). |
| `min_context`       | number | Skip if model context length < value. |
| `requires_tools`    | bool   | Skip if model can't call tools/functions. |
| `requires_vision`   | bool   | Skip if model can't accept image inputs. |
| `requires_streaming`| bool   | Skip if model doesn't support streaming. |
| `region`            | string | Skip if provider region tag doesn't match. |

## Route simulator

The **Routes** page includes a simulator: type a model string and see exactly which route, step, and provider/model the engine would pick — useful when tuning aliases or fallback chains before committing.

## API examples

Direct prefix:

```bash
curl … --data '{"model":"openai:gpt-5.5","messages":[…]}'
```

Alias:

```bash
curl … --data '{"model":"bigliner-cheap","messages":[…]}'
```

Default route:

```bash
curl … --data '{"messages":[…]}'   # no model field at all
```
