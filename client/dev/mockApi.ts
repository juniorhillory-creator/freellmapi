import type { Plugin } from 'vite'

// In-memory mock API surface for the full FreeLLMAPI dashboard, allowing
// the application to boot cleanly and interactively in web preview.

const PRESETS: Record<string, { reliability: number; speed: number; intelligence: number }> = {
  balanced: { reliability: 0.5, speed: 0.25, intelligence: 0.25 },
  smartest: { reliability: 0.35, speed: 0.1, intelligence: 0.55 },
  fastest: { reliability: 0.35, speed: 0.55, intelligence: 0.1 },
  reliable: { reliability: 0.7, speed: 0.15, intelligence: 0.15 },
}

interface MockModel {
  id: number
  modelDbId: number
  platform: string
  modelId: string
  displayName: string
  sizeLabel: string
  intelligenceRank: number
  speedRank: number
  monthlyTokenBudget: string
  supportsVision: boolean
  supportsTools?: boolean
  rpmLimit: number | null
  rpdLimit: number | null
  enabled: boolean
  priority: number
  reliability: number
  speed: number
  intelligence: number
  headroom: number
  rateLimit: number
  totalRequests: number
  keyCount?: number
  contextWindow?: number
}

let strategy = 'balanced'
let customWeights = { ...PRESETS.balanced }

function activeWeights() {
  if (strategy === 'custom') return customWeights
  return PRESETS[strategy] ?? PRESETS.balanced
}

const models: MockModel[] = [
  { id: 1, modelDbId: 1, platform: 'google', modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', sizeLabel: 'Frontier', intelligenceRank: 1, speedRank: 8, monthlyTokenBudget: '~12M', supportsVision: true, supportsTools: true, rpmLimit: 5, rpdLimit: 100, enabled: true, priority: 1, reliability: 0.94, speed: 0.55, intelligence: 1.0, headroom: 1, rateLimit: 1, totalRequests: 412, keyCount: 2, contextWindow: 1000000 },
  { id: 2, modelDbId: 2, platform: 'groq', modelId: 'openai/gpt-oss-120b', displayName: 'GPT-OSS 120B', sizeLabel: 'Frontier', intelligenceRank: 6, speedRank: 2, monthlyTokenBudget: '~6M', supportsVision: false, supportsTools: true, rpmLimit: 30, rpdLimit: 1000, enabled: true, priority: 2, reliability: 0.9, speed: 0.98, intelligence: 0.72, headroom: 1, rateLimit: 0.7, totalRequests: 833, keyCount: 1, contextWindow: 128000 },
  { id: 3, modelDbId: 3, platform: 'cerebras', modelId: 'llama-3.3-70b', displayName: 'Llama 3.3 70B', sizeLabel: 'Large', intelligenceRank: 4, speedRank: 1, monthlyTokenBudget: '~50M', supportsVision: false, supportsTools: true, rpmLimit: 30, rpdLimit: 14400, enabled: true, priority: 3, reliability: 0.88, speed: 1.0, intelligence: 0.5, headroom: 1, rateLimit: 1, totalRequests: 256, keyCount: 1, contextWindow: 128000 },
  { id: 4, modelDbId: 4, platform: 'google', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', sizeLabel: 'Large', intelligenceRank: 4, speedRank: 5, monthlyTokenBudget: '~3M', supportsVision: true, supportsTools: true, rpmLimit: 10, rpdLimit: 20, enabled: true, priority: 4, reliability: 0.97, speed: 0.78, intelligence: 0.52, headroom: 0.45, rateLimit: 1, totalRequests: 90, keyCount: 2, contextWindow: 1000000 },
  { id: 5, modelDbId: 5, platform: 'nvidia', modelId: 'llama-4-scout', displayName: 'Llama 4 Scout', sizeLabel: 'Medium', intelligenceRank: 7, speedRank: 4, monthlyTokenBudget: '~30M', supportsVision: true, supportsTools: true, rpmLimit: 40, rpdLimit: null, enabled: true, priority: 5, reliability: 0.7, speed: 0.83, intelligence: 0.33, headroom: 1, rateLimit: 1, totalRequests: 47, keyCount: 1, contextWindow: 128000 },
  { id: 6, modelDbId: 6, platform: 'openrouter', modelId: 'deepseek/deepseek-v3.1:free', displayName: 'DeepSeek V3.1', sizeLabel: 'Frontier', intelligenceRank: 2, speedRank: 10, monthlyTokenBudget: '~6M', supportsVision: false, supportsTools: true, rpmLimit: 20, rpdLimit: 200, enabled: false, priority: 6, reliability: 0.5, speed: 0.4, intelligence: 0.67, headroom: 1, rateLimit: 1, totalRequests: 0, keyCount: 0, contextWindow: 64000 },
  { id: 7, modelDbId: 7, platform: 'mistral', modelId: 'mistral-large', displayName: 'Mistral Large', sizeLabel: 'Large', intelligenceRank: 5, speedRank: 6, monthlyTokenBudget: '~15M', supportsVision: false, supportsTools: true, rpmLimit: 60, rpdLimit: 500, enabled: true, priority: 7, reliability: 0.82, speed: 0.6, intelligence: 0.45, headroom: 1, rateLimit: 1, totalRequests: 178, keyCount: 1, contextWindow: 128000 },
]

const keys = [
  { id: 1, platform: 'google', label: 'Gemini Primary (AI Studio)', maskedKey: 'AIzaSy...7x8F', enabled: true, status: 'healthy', lastCheckedAt: new Date().toISOString(), lastHealthError: null, models: [], modelScope: null },
  { id: 2, platform: 'groq', label: 'Groq Cloud Llama', maskedKey: 'gsk_...9b2x', enabled: true, status: 'healthy', lastCheckedAt: new Date().toISOString(), lastHealthError: null, models: [], modelScope: null },
  { id: 3, platform: 'cerebras', label: 'Cerebras Inference', maskedKey: 'csk-...77a1', enabled: true, status: 'healthy', lastCheckedAt: new Date().toISOString(), lastHealthError: null, models: [], modelScope: null },
  { id: 4, platform: 'kilo', label: 'Kilo Gateway (no key needed)', maskedKey: '(keyless)', enabled: true, status: 'healthy', keyless: true, lastCheckedAt: new Date().toISOString(), lastHealthError: null, models: [], modelScope: null },
]

const mediaModels = [
  { id: 1, platform: 'pollinations', modelId: 'flux', displayName: 'FLUX.1 Schnell', modality: 'image', enabled: true, priority: 1, rpmLimit: 30, keyCount: 1 },
  { id: 2, platform: 'siliconflow', modelId: 'stable-diffusion-3.5', displayName: 'SD 3.5 Large', modality: 'image', enabled: true, priority: 2, rpmLimit: 20, keyCount: 1 },
  { id: 3, platform: 'speechify', modelId: 'speechify-neural-tts', displayName: 'Speechify Voice', modality: 'audio', enabled: true, priority: 1, rpmLimit: 60, keyCount: 1 },
  { id: 4, platform: 'google', modelId: 'imagen-3', displayName: 'Imagen 3 Fast', modality: 'image', enabled: true, priority: 3, rpmLimit: 10, keyCount: 1 },
  { id: 5, platform: 'sail', modelId: 'sail-video-generation', displayName: 'Sail Video Gen', modality: 'video', enabled: true, priority: 1, rpmLimit: 5, keyCount: 1 },
]

const embeddingModels = [
  { id: 1, platform: 'google', modelId: 'text-embedding-004', displayName: 'Gemini Embedding 004', dimensions: 768, enabled: true, priority: 1 },
  { id: 2, platform: 'cohere', modelId: 'embed-english-v3.0', displayName: 'Cohere English v3', dimensions: 1024, enabled: true, priority: 2 },
]

const profiles = [
  { id: 1, name: 'Default Balanced Chain', description: 'Primary production fallback chain', isDefault: true, createdAt: new Date().toISOString() },
  { id: 2, name: 'High Speed Coding', description: 'Optimized for latency and coding models', isDefault: false, createdAt: new Date().toISOString() },
]

const clientProfiles = [
  { id: 1, name: 'Cursor IDE', apiKey: 'sk-cursor-freellmapi-live', defaultModel: 'gemini-2.5-pro', autoInclude: true, createdAt: new Date().toISOString() },
  { id: 2, name: 'Claude Code CLI', apiKey: 'sk-claude-code-router', defaultModel: 'openai/gpt-oss-120b', autoInclude: true, createdAt: new Date().toISOString() },
]

function budgetTokens(label: string): number {
  const m = label.match(/~?([\d.]+)(?:-([\d.]+))?([MK])?/)
  if (!m) return 0
  const n = parseFloat(m[2] ?? m[1])
  const unit = m[3] === 'M' ? 1_000_000 : m[3] === 'K' ? 1_000 : 1
  return n * unit
}

function score(m: MockModel): number {
  const w = activeWeights()
  const base = w.reliability * m.reliability + w.speed * m.speed + w.intelligence * m.intelligence
  return base * m.headroom * m.rateLimit
}

function readBody(req: any): Promise<any> {
  return new Promise(resolve => {
    let data = ''
    req.on('data', (c: any) => { data += c })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
  })
}

export function mockApiPlugin(): Plugin {
  return {
    name: 'freellmapi-dev-mock',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const fullUrl = req.url || ''
        const url = fullUrl.split('?')[0]

        // Handle SSE streaming for /v1/chat/completions (Playground)
        if (url === '/v1/chat/completions') {
          const body = await readBody(req)
          const requestedModel = body.model || 'gemini-2.5-flash'
          const isStream = Boolean(body.stream)

          if (isStream) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')

            const responseId = `chatcmpl-${Date.now()}`
            const replyText = `Hello! FreeLLMAPI is active and routing your request through **${requestedModel}**. All fallback, priority scoring, and provider failovers are operating normally.`
            const words = replyText.split(' ')

            // Preamble role chunk
            const preamble = {
              id: responseId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: requestedModel,
              choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
            }
            res.write(`data: ${JSON.stringify(preamble)}\n\n`)

            // Word deltas with small pacing
            for (let i = 0; i < words.length; i++) {
              const piece = (i === 0 ? '' : ' ') + words[i]
              const chunk = {
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: requestedModel,
                choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
              }
              res.write(`data: ${JSON.stringify(chunk)}\n\n`)
            }

            // Finish chunk
            const finish = {
              id: responseId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: requestedModel,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: { prompt_tokens: 32, completion_tokens: words.length, total_tokens: 32 + words.length },
            }
            res.write(`data: ${JSON.stringify(finish)}\n\n`)
            res.write(`data: [DONE]\n\n`)
            return res.end()
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: requestedModel,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: `FreeLLMAPI response from ${requestedModel}. Everything is configured and ready.`,
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 28, completion_tokens: 15, total_tokens: 43 },
          }))
        }

        if (!url.startsWith('/api/')) return next()

        const send = (obj: any, status = 200) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }

        // Auth
        if (url === '/api/auth/status') {
          return send({ needsSetup: false, authenticated: true, email: 'admin@freellmapi.local' })
        }
        if (url === '/api/auth/login' || url === '/api/auth/setup') {
          return send({ token: 'mock-session-token' })
        }
        if (url === '/api/ping') {
          return send({ status: 'ok', timestamp: new Date().toISOString() })
        }

        // Keys & Health
        if (url === '/api/keys' && req.method === 'GET') {
          return send(keys)
        }
        if (url === '/api/keys' && req.method === 'POST') {
          const body = await readBody(req)
          const newKey = {
            id: Date.now(),
            platform: body.platform || 'custom',
            label: body.label || 'New Key',
            maskedKey: body.key ? body.key.slice(0, 6) + '...' + body.key.slice(-4) : '(keyless)',
            enabled: true,
            status: 'healthy',
            lastCheckedAt: new Date().toISOString(),
            lastHealthError: null,
            models: body.models || [],
            modelScope: null,
            baseUrl: body.baseUrl || null,
          }
          keys.push(newKey)
          return send(newKey, 201)
        }
        if (url.startsWith('/api/keys/') && req.method === 'PATCH') {
          const id = parseInt(url.split('/')[3], 10)
          const body = await readBody(req)
          const target = keys.find(k => k.id === id)
          if (target) Object.assign(target, body)
          return send(target ?? { success: true })
        }
        if (url.startsWith('/api/keys/') && req.method === 'DELETE') {
          const id = parseInt(url.split('/')[3], 10)
          const idx = keys.findIndex(k => k.id === id)
          if (idx !== -1) keys.splice(idx, 1)
          return send({ success: true })
        }
        if (url === '/api/keys/preview') {
          return send({ keys: [], skipped: [] })
        }
        if (url === '/api/keys/import-selected') {
          return send({ imported: 1, modelsRegistered: 1, errors: [] })
        }
        if (url === '/api/health') {
          const platforms = ['google', 'groq', 'cerebras', 'kilo'].map(p => ({
            platform: p,
            totalKeys: 1,
            healthyKeys: 1,
            rateLimitedKeys: 0,
            invalidKeys: 0,
            errorKeys: 0,
            unknownKeys: 0,
          }))
          return send({
            platforms,
            keys: keys.map(k => ({ id: k.id, platform: k.platform, status: k.status, lastCheckedAt: k.lastCheckedAt, lastHealthError: null })),
            quotaStates: [],
          })
        }

        // Models
        if (url === '/api/models' && req.method === 'GET') {
          return send(models)
        }

        // Fallback & Routing
        if (url === '/api/fallback' && req.method === 'GET') {
          const rows = [...models].sort((a, b) => a.priority - b.priority).map(m => ({
            modelDbId: m.modelDbId,
            priority: m.priority,
            effectivePriority: m.priority,
            penalty: m.rateLimit < 1 ? Math.round((1 - m.rateLimit) * 10) : 0,
            rateLimitHits: m.rateLimit < 1 ? 3 : 0,
            enabled: m.enabled,
            platform: m.platform,
            modelId: m.modelId,
            displayName: m.displayName,
            intelligenceRank: m.intelligenceRank,
            speedRank: m.speedRank,
            sizeLabel: m.sizeLabel,
            rpmLimit: m.rpmLimit,
            rpdLimit: m.rpdLimit,
            monthlyTokenBudget: m.monthlyTokenBudget,
            supportsVision: m.supportsVision,
            supportsTools: m.supportsTools ?? true,
            keyCount: m.keyCount ?? 2,
            contextWindow: m.contextWindow ?? 128000,
          }))
          return send(rows)
        }
        if (url === '/api/fallback' && req.method === 'PUT') {
          const body = await readBody(req)
          for (const e of body as any[]) {
            const m = models.find(x => x.modelDbId === e.modelDbId)
            if (m) { m.priority = e.priority; m.enabled = e.enabled }
          }
          return send({ success: true })
        }
        if (url === '/api/fallback/routing' && req.method === 'GET') {
          const scores = [...models]
            .map(m => ({
              modelDbId: m.modelDbId, platform: m.platform, modelId: m.modelId, displayName: m.displayName,
              enabled: m.enabled, reliability: m.reliability, speed: m.speed, intelligence: m.intelligence,
              headroom: m.headroom, rateLimit: m.rateLimit, score: score(m), totalRequests: m.totalRequests,
            }))
            .sort((a, b) => b.score - a.score)
          return send({ strategy, weights: strategy === 'priority' ? null : activeWeights(), customWeights, scores })
        }
        if (url === '/api/fallback/routing' && req.method === 'PUT') {
          const body = await readBody(req)
          if (typeof body.strategy === 'string') strategy = body.strategy
          if (body.weights && typeof body.weights === 'object') {
            const { reliability = 0, speed = 0, intelligence = 0 } = body.weights
            const sum = reliability + speed + intelligence
            if (sum > 0) {
              customWeights = { reliability: reliability / sum, speed: speed / sum, intelligence: intelligence / sum }
            }
          }
          return send({ strategy, presets: PRESETS, customWeights })
        }
        if (url === '/api/fallback/token-usage') {
          const modelBudgets = models.map(m => ({ displayName: m.displayName, platform: m.platform, budget: budgetTokens(m.monthlyTokenBudget) }))
          const totalBudget = modelBudgets.reduce((s, m) => s + m.budget, 0)
          return send({ totalBudget, totalUsed: Math.round(totalBudget * 0.18), models: modelBudgets })
        }
        if (url === '/api/fallback/penalty-inspector') {
          return send([])
        }

        // Media Models (Image, Audio, Video)
        if (url === '/api/media' && req.method === 'GET') {
          return send(mediaModels)
        }
        if (url.startsWith('/api/media/usage')) {
          return send({ totalRequests: 148, promptTokens: 38200, completionTokens: 12400 })
        }
        if (url.startsWith('/api/media/') && req.method === 'PUT') {
          const id = parseInt(url.split('/')[3], 10)
          const body = await readBody(req)
          const found = mediaModels.find(m => m.id === id)
          if (found) Object.assign(found, body)
          return send({ success: true })
        }

        // Embeddings
        if (url === '/api/embeddings' && req.method === 'GET') {
          return send(embeddingModels)
        }

        // Profiles & Client Profiles
        if (url === '/api/profiles' && req.method === 'GET') {
          return send(profiles)
        }
        if (url === '/api/profiles/active') {
          return send({ profileId: 1 })
        }
        if (url === '/api/client-profiles' && req.method === 'GET') {
          return send(clientProfiles)
        }

        // Analytics
        if (url.startsWith('/api/analytics/summary')) {
          return send({
            totalRequests: 1742,
            successfulRequests: 1718,
            failedRequests: 24,
            avgLatencyMs: 412,
            p95LatencyMs: 890,
            tokenUsage: 3412000,
            activeKeys: keys.length,
            activeModels: models.filter(m => m.enabled).length,
            dailyRequests: [
              { date: '2026-09-26', count: 180 },
              { date: '2026-09-27', count: 220 },
              { date: '2026-09-28', count: 310 },
              { date: '2026-09-29', count: 280 },
              { date: '2026-09-30', count: 340 },
              { date: '2026-10-01', count: 412 },
            ],
            topModels: [
              { model: 'gemini-2.5-flash', requests: 780, pct: 45 },
              { model: 'llama-3.3-70b', requests: 520, pct: 30 },
              { model: 'gemini-2.5-pro', requests: 442, pct: 25 },
            ],
          })
        }
        if (url.startsWith('/api/analytics/requests')) {
          return send([])
        }

        // Logs
        if (url === '/api/logs' && req.method === 'GET') {
          return send([
            { id: 1, timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(), level: 'info', message: 'Route selected gemini-2.5-flash for request (latency 284ms)' },
            { id: 2, timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(), level: 'info', message: 'Groq quota health check completed: healthy (30 RPM remaining)' },
            { id: 3, timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), level: 'info', message: 'Cerebras token bucket reset (14,400 RPD available)' },
          ])
        }

        // Settings & Meta
        if (url === '/api/settings/version') {
          return send({ version: '0.2.1' })
        }
        if (url === '/api/settings/api-key') {
          return send({ key: 'sk-freellmapi-live-local-router' })
        }
        if (url === '/api/settings/update-check') {
          return send({ enabled: false })
        }
        if (url === '/api/settings/compression') {
          return send({ enabled: true, minTokens: 1000 })
        }
        if (url === '/api/compression/stats') {
          return send({ totalOriginalTokens: 142000, totalCompressedTokens: 89000, savingsPct: 37 })
        }
        if (url === '/api/premium') {
          return send({ isPremium: true, tier: 'pro', expiresAt: null })
        }
        if (url === '/api/quota-outlook') {
          return send({
            pools: [
              { platform: 'google', pool: 'google::gemini', status: 'healthy', warning: null, remaining: 95, limit: 100, remainingPct: 95 },
              { platform: 'groq', pool: 'groq::shared', status: 'healthy', warning: null, remaining: 980, limit: 1000, remainingPct: 98 },
            ],
            generatedAt: new Date().toISOString(),
            windowMinutes: 60,
            observationWindowMinutes: 60,
            minimumRequests: 5,
          })
        }
        if (url.startsWith('/api/update/')) {
          return send({ currentVersion: '0.2.1', latestVersion: '0.2.1', updateAvailable: false })
        }
        if (url === '/api/conversations') {
          if (req.method === 'POST') {
            const body = await readBody(req)
            const newConv = {
              id: Date.now(),
              title: body.title || 'New conversation',
              model: body.model || 'auto',
              systemPrompt: body.systemPrompt || '',
              messages: body.messages || [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            return send(newConv, 201)
          }
          return send([])
        }

        // GitHub import endpoints
        if (url === '/api/github/repo') {
          const owner = fullUrl.match(/owner=([^&]+)/)?.[1]
          const repo = fullUrl.match(/repo=([^&]+)/)?.[1]
          const decodedOwner = decodeURIComponent(owner || 'juniorhillory-creator')
          const decodedRepo = decodeURIComponent(repo || 'freellmapi')
          try {
            const ghRes = await fetch(`https://api.github.com/repos/${decodedOwner}/${decodedRepo}`, {
              headers: { 'User-Agent': 'FreeLLMAPI-Router', Accept: 'application/vnd.github.v3+json' },
            })
            if (ghRes.ok) {
              const data = await ghRes.json()
              return send(data)
            }
          } catch {
            // fallback
          }
          return send({
            name: decodedRepo,
            full_name: `${decodedOwner}/${decodedRepo}`,
            owner: { login: decodedOwner },
            description: 'Unified LLM router with automatic failover, priority scoring, and playground.',
            default_branch: 'main',
            stargazers_count: 142,
            forks_count: 18,
            language: 'TypeScript',
            license: { spdx_id: 'MIT' },
            private: false,
            html_url: `https://github.com/${decodedOwner}/${decodedRepo}`,
          })
        }
        if (url === '/api/github/tree') {
          const owner = fullUrl.match(/owner=([^&]+)/)?.[1]
          const repo = fullUrl.match(/repo=([^&]+)/)?.[1]
          const branch = fullUrl.match(/branch=([^&]+)/)?.[1] || 'main'
          const decodedOwner = decodeURIComponent(owner || '')
          const decodedRepo = decodeURIComponent(repo || '')
          const decodedBranch = decodeURIComponent(branch)
          try {
            const ghRes = await fetch(`https://api.github.com/repos/${decodedOwner}/${decodedRepo}/git/trees/${decodedBranch}?recursive=1`, {
              headers: { 'User-Agent': 'FreeLLMAPI-Router', Accept: 'application/vnd.github.v3+json' },
            })
            if (ghRes.ok) {
              const data = await ghRes.json()
              return send(data)
            }
          } catch {
            // fallback
          }
          return send({
            tree: [
              { path: 'README.md', type: 'blob', size: 2420 },
              { path: 'package.json', type: 'blob', size: 1820 },
              { path: 'tsconfig.json', type: 'blob', size: 680 },
              { path: 'src/index.ts', type: 'blob', size: 3100 },
              { path: 'src/router.ts', type: 'blob', size: 4500 },
              { path: 'src/config.ts', type: 'blob', size: 1950 },
              { path: 'docs/ARCHITECTURE.md', type: 'blob', size: 3800 },
            ],
          })
        }
        if (url === '/api/github/content') {
          const pathParam = fullUrl.match(/path=([^&]+)/)?.[1]
          const decodedPath = decodeURIComponent(pathParam || 'README.md')
          return send({
            path: decodedPath,
            content: `# ${decodedPath}\n\nProject file imported from GitHub repository.\n\n\`\`\`ts\n// Source content for ${decodedPath}\nexport const initialized = true;\n\`\`\`\n`,
          })
        }

        // Catch-all
        return send({})
      })
    },
  }
}
