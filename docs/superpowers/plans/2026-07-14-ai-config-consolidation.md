# AI Config Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate AI provider/model defaulting and initialization logic into a dedicated frontend helper without changing saved config shape or runtime behavior.

**Architecture:** Add a small `frontend/src/lib/ai-config.ts` helper for AI settings lookup and initial state derivation, then update `Settings.tsx` to use it. Keep `ai-models.ts` as the model catalog source of truth and keep `llm.ts` storage shape unchanged.

**Tech Stack:** React 19, TypeScript, Vite, pytest source assertions

## Global Constraints

- Do not change the saved `LlmConfig` shape.
- Do not change localStorage key names.
- Do not change the actual model catalog contents unless required for consistency.
- Do not change backend AI behavior.
- Do not redesign the Settings page UI.
- Do not introduce server-side config or environment-variable changes.

---

### Task 1: Add AI Config Acceptance Test

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: frontend source files as text
- Produces: a failing acceptance test for centralized AI settings logic

- [ ] **Step 1: Add a failing AI config test**

```python
def test_ai_settings_logic_is_centralized():
    helper = read("frontend/src/lib/ai-config.ts")
    settings = read("frontend/src/pages/Settings.tsx")
    llm = read("frontend/src/lib/llm.ts")

    assert "getDefaultApiModel" in helper
    assert "getProviderByModelId" in helper
    assert "getInitialAiSettings" in helper
    assert "firstApi =" not in settings
    assert "const providerOf" not in settings
    assert "getInitialAiSettings" in settings
    assert "getProviderByModelId" in settings
    assert "LlmConfig" in llm
    assert "provider:" in llm
    assert "baseURL:" in llm
    assert "apiKey:" in llm
    assert "model:" in llm
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because `frontend/src/lib/ai-config.ts` does not exist and `Settings.tsx` still contains `firstApi` and `providerOf`.

- [ ] **Step 3: Commit the red test**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require ai config consolidation"
```

### Task 2: Add Helper Module and Refactor Settings

**Files:**
- Create: `/Users/leo/Documents/投研体系/frontend/src/lib/ai-config.ts`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `aiModels`, `apiModels`, `subscriptionModels`, `PROVIDER_BASE`, `LlmConfig`
- Produces: centralized AI settings lookup functions used by the Settings page

- [ ] **Step 1: Create `frontend/src/lib/ai-config.ts`**

```typescript
import { PROVIDER_BASE, aiModels, apiModels, type ModelConfig, type ProviderId } from "./ai-models";
import type { LlmConfig } from "./llm";

export interface InitialAiSettings {
  mode: "api" | "subscription";
  cliId: string;
  apiId: string;
  baseURL: string;
  modelName: string;
  apiKey: string;
}

export function getModelById(id: string): ModelConfig | undefined {
  return aiModels.find((model) => model.id === id);
}

export function getProviderByModelId(id: string): ProviderId {
  return getModelById(id)?.provider ?? "openai-compatible";
}

export function getDefaultBaseUrl(provider: ProviderId): string {
  return PROVIDER_BASE[provider] || "";
}

export function getDefaultApiModel(): ModelConfig {
  return apiModels[0];
}

export function getInitialAiSettings(existing: LlmConfig | null, existingIsCli: boolean): InitialAiSettings {
  const firstApi = getDefaultApiModel();
  const apiId = existing && !existingIsCli ? existing.model : firstApi.id;
  const provider = getProviderByModelId(apiId);
  return {
    mode: existing && existingIsCli ? "subscription" : "api",
    cliId: existing && existingIsCli ? existing.model : "",
    apiId,
    baseURL: existing && !existingIsCli ? existing.baseURL : getDefaultBaseUrl(firstApi.provider),
    modelName: existing && !existingIsCli ? existing.model : firstApi.id,
    apiKey: existing && !existingIsCli ? existing.apiKey : "",
  };
}
```

- [ ] **Step 2: Refactor `Settings.tsx` to use helper state initialization**

Import:

```typescript
import { getDefaultBaseUrl, getInitialAiSettings, getProviderByModelId } from "@/lib/ai-config";
```

Replace local `firstApi` and `providerOf` logic with:

```typescript
  const initial = getInitialAiSettings(existing, existingIsCli);
  const [mode, setMode] = useState<"api" | "subscription">(initial.mode);
  const [cliId, setCliId] = useState(initial.cliId);
  const [apiId, setApiId] = useState(initial.apiId);
  const [baseURL, setBaseURL] = useState(initial.baseURL);
  const [modelName, setModelName] = useState(initial.modelName);
  const [apiKey, setApiKey] = useState(initial.apiKey);
```

- [ ] **Step 3: Refactor API model picker and save path**

Use helper functions:

```typescript
    setBaseURL(getDefaultBaseUrl(m.provider));
```

and:

```typescript
    saveLlm({ provider: getProviderByModelId(apiId), baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: modelName.trim() });
```

- [ ] **Step 4: Run acceptance tests**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with AI config assertions and existing acceptance tests all passing.

- [ ] **Step 5: Commit implementation**

```bash
git add /Users/leo/Documents/投研体系/frontend/src/lib/ai-config.ts \
  /Users/leo/Documents/投研体系/frontend/src/pages/Settings.tsx
git commit -m "refactor: consolidate ai config defaults"
```

### Task 3: Update Notes and Verify

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: AI config consolidation implementation
- Produces: updated rollout notes plus fresh verification evidence

- [ ] **Step 1: Update local notes**

Add to `Stage 2 Status`:

```markdown
- AI provider/model initialization logic is centralized in `frontend/src/lib/ai-config.ts`; saved `vr-llm` shape remains unchanged.
```

- [ ] **Step 2: Run frontend build**

Run: `cd /Users/leo/Documents/投研体系/frontend && PATH="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run build`

Expected: PASS with Vite build completed successfully.

- [ ] **Step 3: Run backend offline tests**

Run: `cd /Users/leo/Documents/投研体系/backend && .venv/bin/pytest -m "not live"`

Expected: PASS with backend offline tests passing.

- [ ] **Step 4: Commit note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record ai config consolidation"
```
