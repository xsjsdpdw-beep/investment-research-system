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

  return {
    mode: existing && existingIsCli ? "subscription" : "api",
    cliId: existing && existingIsCli ? existing.model : "",
    apiId,
    baseURL: existing && !existingIsCli ? existing.baseURL : getDefaultBaseUrl(firstApi.provider),
    modelName: existing && !existingIsCli ? existing.model : firstApi.id,
    apiKey: existing && !existingIsCli ? existing.apiKey : "",
  };
}
