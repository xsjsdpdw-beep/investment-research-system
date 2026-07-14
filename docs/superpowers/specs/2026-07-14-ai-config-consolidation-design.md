# AI Config Consolidation Design

## Background

The project already completed frontend app-constant consolidation, but AI configuration logic is still split across multiple places:

- model catalog and provider defaults in `frontend/src/lib/ai-models.ts`
- persisted LLM shape in `frontend/src/lib/llm.ts`
- initialization and selection logic in `frontend/src/pages/Settings.tsx`

The current system works, but small pieces of decision logic are scattered:

- which API model is the default first choice
- how to derive provider from a model id
- how to reset `baseURL` when a model changes
- how to initialize Settings page state from saved configuration

This stage should consolidate those rules without changing storage format or runtime behavior.

## Goal

Move AI provider/model selection rules into a dedicated frontend helper so `Settings.tsx` becomes thinner and future AI option changes can happen in one place.

## Non-Goals

- Do not change the saved `LlmConfig` shape.
- Do not change localStorage key names.
- Do not change the actual model catalog contents unless required for consistency.
- Do not change backend AI behavior.
- Do not redesign the Settings page UI.
- Do not introduce server-side config or environment-variable changes.

## Recommended Approach

Create a small helper module dedicated to AI settings defaults and lookups.

Recommended file:

- `frontend/src/lib/ai-config.ts`

This module should own:

- default API model selection
- provider lookup by model id
- provider base URL lookup
- initial Settings page state derivation from saved `LlmConfig`

This keeps `ai-models.ts` focused on static catalog data, and keeps `Settings.tsx` focused on rendering and event handling.

## Scope

### New Helper Module

Create `frontend/src/lib/ai-config.ts`.

It should expose small pure helpers such as:

- `getModelById(id)`
- `getProviderByModelId(id)`
- `getDefaultApiModel()`
- `getDefaultBaseUrl(provider)`
- `getInitialAiSettings(existing)`

The exact function names may vary, but the module should be clearly responsible for AI settings lookup and initialization logic.

### Settings Page

Update `frontend/src/pages/Settings.tsx` to:

- use the new helper module for initial state derivation
- use the helper module to map model id to provider
- use the helper module to set default `baseURL` when an API model is selected

`Settings.tsx` should no longer contain its own copy of “first API model” or “providerOf” logic.

### Existing Model Catalog

`frontend/src/lib/ai-models.ts` should remain the source of truth for:

- `ProviderId`
- `ModelConfig`
- `aiModels`
- `subscriptionModels`
- `apiModels`

It may continue to export `PROVIDER_BASE`, or the base URL lookup may move behind the new helper if that keeps responsibilities clearer.

### Existing Persisted Config

`frontend/src/lib/llm.ts` should remain unchanged unless a tiny import-free helper extraction is needed. The persisted shape:

- `provider`
- `baseURL`
- `apiKey`
- `model`

must stay exactly the same.

## Data Flow

No data flow changes.

The browser still stores the same `vr-llm` object. The frontend still submits the same `llm` payload to `/api/chat`. This is an internal frontend refactor for config logic only.

## Error Handling

No error-handling behavior changes are expected.

The main risk is changing fallback behavior when saved config is partially missing or when a model id is unknown. The new helper should preserve today's behavior:

- unknown provider fallback remains `openai-compatible`
- API defaults still start from the first API model in the catalog

## Testing

Verification should include:

- a source-level acceptance test asserting AI settings logic is centralized in the new helper
- existing branding/config acceptance tests
- frontend production build
- backend offline tests as a confidence check

## Acceptance Criteria

- `frontend/src/lib/ai-config.ts` exists.
- `Settings.tsx` imports and uses the new helper module.
- `Settings.tsx` no longer defines its own `firstApi` constant.
- `Settings.tsx` no longer defines its own `providerOf` helper.
- The saved `LlmConfig` shape is unchanged.
- Existing acceptance tests pass.
- Frontend production build passes.
