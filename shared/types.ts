export type Platform =
  | 'aclide'
  | 'speka'
  | 'llmtr'
  | 'moondream'
  | 'google'
  | 'groq'
  | 'cerebras'
  | 'sail'
  | 'electronhub'
  | 'experiential'
  | 'router9'
  | 'septor'
  | 'clod'
  | 'speechify'
  | 'blaze'
  | 'lucidity'
  | 'airforce'
  | 'dreamprompting'
  | 'waterfall'
  | 'logfare'
  | 'bai'
  | 'radeon'
  | 'nvidia'
  | 'mistral'
  | 'openrouter'
  | 'github'
  | 'cohere'
  | 'cloudflare'
  | 'zhipu'
  | 'ollama'
  | 'kilo'
  | 'pollinations'
  | 'ovh'
  | 'llm7'
  | 'huggingface'
  | 'opencode'
  | 'agnes'
  | 'reka'
  | 'siliconflow'
  | 'routeway'
  | 'bazaarlink'
  | 'ainative'
  | 'aion'
  | 'requesty'
  | 'navy'
  | 'nara'
  | 'sealion'
  | 'orcarouter'
  | 'unorouter'
  | 'xkiro'
  | 'anyapi'
  | 'modelscope'
  | 'aihorde'
  | 'qianfan'
  | 'volcengine'
  | 'longcat'
  | 'xfyun'
  | 'custom'
  | (string & {});

export type ProxyMode = 'smart' | 'manual' | 'round-robin' | (string & {});

export interface ChatContentBlock {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: string };
  [key: string]: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'function' | (string & {});
  content: string | ChatContentBlock[] | any;
  name?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  [key: string]: any;
}

export interface ChatToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
  [key: string]: any;
}

export type ChatToolChoice =
  | 'none'
  | 'auto'
  | 'required'
  | { type: string; function?: { name: string } }
  | Record<string, any>;

export interface ChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
  [key: string]: any;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
  };
  [key: string]: any;
}

export interface ChatCompletionChoice {
  index?: number;
  message?: ChatMessage;
  delta?: Partial<ChatMessage>;
  finish_reason?: string | null;
  [key: string]: any;
}

export interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: ChatCompletionChoice[];
  usage?: TokenUsage;
  system_fingerprint?: string;
  [key: string]: any;
}

export interface ChatCompletionChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: ChatCompletionChoice[];
  usage?: TokenUsage;
  [key: string]: any;
}

export interface ApiKeyModel {
  id: string | number;
  kind: 'chat' | 'embedding' | 'image' | 'audio' | 'transcription';
  name?: string;
  modelId: string;
  displayName: string;
  [key: string]: any;
}

export interface ApiKey {
  id: number;
  platform: Platform;
  label?: string;
  key?: string;
  maskedKey: string;
  enabled: boolean;
  status: string;
  lastCheckedAt?: string | null;
  lastHealthError?: string | null;
  models?: ApiKeyModel[];
  baseUrl?: string | null;
  dailyQuotaExhausted?: boolean;
  rateLimitHits?: number;
  monthlyBudgetUsd?: number | null;
  monthlyUsageUsd?: number | null;
  modelScope?: string[] | null;
  keyless?: boolean;
  [key: string]: any;
}

export interface Model {
  id: number;
  modelDbId?: number;
  platform: string;
  keyId?: number | null;
  modelId: string;
  displayName: string;
  sizeLabel?: string | null;
  intelligenceRank: number;
  speedRank: number;
  monthlyTokenBudget?: string;
  supportsVision?: boolean;
  rpmLimit?: number | null;
  rpdLimit?: number | null;
  enabled?: boolean;
  priority?: number;
  effectivePriority?: number;
  penalty?: number;
  rateLimitHits?: number;
  reliability?: number;
  speed?: number;
  intelligence?: number;
  headroom?: number;
  rateLimit?: number;
  totalRequests?: number;
  keyCount?: number;
  contextWindow?: number | null;
  [key: string]: any;
}

export interface ModelTestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  [key: string]: any;
}

export interface ProviderQuotaState {
  platform: string;
  keyId: number;
  quotaPoolKey: string;
  metric: string;
  source: string;
  confidence: number;
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  observedAt: string;
  notes?: string | null;
  keyLabel?: string | null;
  [key: string]: any;
}

export interface QuotaOutlookPool {
  platform: string;
  pool: string;
  warning?: string | null;
  status: string;
  estimatedExhaustionAt?: string | null;
  unavailableReason?: string | null;
  remainingPct?: number | null;
  remaining?: number | null;
  limit?: number | null;
  [key: string]: any;
}

export interface QuotaOutlookResponse {
  pools: QuotaOutlookPool[];
  generatedAt: string;
  windowMinutes: number;
  observationWindowMinutes: number;
  minimumRequests: number;
  [key: string]: any;
}

export interface PreviewKey {
  keyName: string;
  keyValue: string;
  detectedPlatform?: string;
  key?: string;
  maskedKey?: string;
  baseUrl?: string;
  label?: string;
  isDuplicate?: boolean;
  models?: any[];
  [key: string]: any;
}

export interface ImportKey {
  keyName?: string;
  keyValue?: string;
  key?: string;
  platform: Platform | '';
  label?: string;
  baseUrl?: string;
  models?: any[];
  [key: string]: any;
}

export interface PreviewResponse {
  keys: PreviewKey[];
  skipped: string[];
  [key: string]: any;
}

export interface ImportSelectedResponse {
  imported: number;
  failed?: number;
  modelsRegistered: number;
  errors: any[];
  [key: string]: any;
}
