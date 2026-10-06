// Caching layer for GitHub repository structures and file contents.
// Stores fetched project trees and metadata locally in localStorage & memory
// to prevent redundant network requests and avoid hitting GitHub API rate limits.

import type { GitHubFileItem, GitHubRepoInfo } from './github-import'

export interface CachedProjectStructure {
  repo: GitHubRepoInfo
  branch: string
  files: GitHubFileItem[]
  timestamp: number
}

const CACHE_PREFIX = 'gh_cache_structure:'
const FILE_CACHE_PREFIX = 'gh_cache_file:'
const INDEX_KEY = 'gh_cache_index'

/** Default TTL: 30 minutes */
export const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000
/** Maximum number of repositories to retain in local storage */
const MAX_CACHED_REPOS = 15

// In-memory cache for instant turn-around within the current session
const memoryStructureCache = new Map<string, CachedProjectStructure>()
const memoryFileCache = new Map<string, { content: string; timestamp: number }>()

export function buildCacheKey(owner: string, repo: string, branch: string): string {
  return `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}@${branch.trim().toLowerCase()}`
}

export function buildFileCacheKey(owner: string, repo: string, branch: string, path: string): string {
  return `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}@${branch.trim().toLowerCase()}:${path.trim()}`
}

function getCacheIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function updateCacheIndex(key: string): void {
  try {
    const current = getCacheIndex().filter(k => k !== key)
    current.unshift(key)

    // Evict oldest if exceeding limit
    while (current.length > MAX_CACHED_REPOS) {
      const evictedKey = current.pop()
      if (evictedKey) {
        localStorage.removeItem(`${CACHE_PREFIX}${evictedKey}`)
      }
    }

    localStorage.setItem(INDEX_KEY, JSON.stringify(current))
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Retrieve cached project structure for a repository.
 * Returns null if cache does not exist or has expired.
 */
export function getCachedProjectStructure(
  owner: string,
  repo: string,
  branch: string,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): CachedProjectStructure | null {
  const key = buildCacheKey(owner, repo, branch)

  // 1. Check in-memory cache first
  const memCached = memoryStructureCache.get(key)
  if (memCached) {
    const age = Date.now() - memCached.timestamp
    if (age <= ttlMs) {
      return memCached
    }
    memoryStructureCache.delete(key)
  }

  // 2. Check localStorage
  try {
    const stored = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    if (!stored) return null

    const parsed: CachedProjectStructure = JSON.parse(stored)
    const age = Date.now() - parsed.timestamp

    if (age > ttlMs) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`)
      return null
    }

    // Populate in-memory cache
    memoryStructureCache.set(key, parsed)
    return parsed
  } catch (err) {
    console.warn('[github-cache] Failed to read cached structure:', err)
    return null
  }
}

/**
 * Store project structure in cache.
 */
export function setCachedProjectStructure(
  owner: string,
  repo: string,
  branch: string,
  data: { repo: GitHubRepoInfo; files: GitHubFileItem[] },
): void {
  const key = buildCacheKey(owner, repo, branch)
  const entry: CachedProjectStructure = {
    repo: data.repo,
    branch,
    files: data.files,
    timestamp: Date.now(),
  }

  // Set in-memory cache
  memoryStructureCache.set(key, entry)

  // Set in localStorage
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry))
    updateCacheIndex(key)
  } catch (err) {
    console.warn('[github-cache] Failed to save structure in localStorage (quota may be full):', err)
    // Trim cache index if quota exceeded
    try {
      const keys = getCacheIndex()
      if (keys.length > 3) {
        const oldest = keys.slice(3)
        oldest.forEach(k => localStorage.removeItem(`${CACHE_PREFIX}${k}`))
        localStorage.setItem(INDEX_KEY, JSON.stringify(keys.slice(0, 3)))
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Retrieve cached individual file content.
 */
export function getCachedFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): string | null {
  const key = buildFileCacheKey(owner, repo, branch, path)

  const mem = memoryFileCache.get(key)
  if (mem) {
    if (Date.now() - mem.timestamp <= ttlMs) {
      return mem.content
    }
    memoryFileCache.delete(key)
  }

  try {
    const stored = localStorage.getItem(`${FILE_CACHE_PREFIX}${key}`)
    if (!stored) return null
    const parsed: { content: string; timestamp: number } = JSON.parse(stored)
    if (Date.now() - parsed.timestamp > ttlMs) {
      localStorage.removeItem(`${FILE_CACHE_PREFIX}${key}`)
      return null
    }
    memoryFileCache.set(key, parsed)
    return parsed.content
  } catch {
    return null
  }
}

/**
 * Store individual file content in cache.
 */
export function setCachedFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
): void {
  const key = buildFileCacheKey(owner, repo, branch, path)
  const entry = { content, timestamp: Date.now() }

  memoryFileCache.set(key, entry)

  // Only store small-to-medium files in localStorage (<100KB) to preserve quota
  if (content.length < 100_000) {
    try {
      localStorage.setItem(`${FILE_CACHE_PREFIX}${key}`, JSON.stringify(entry))
    } catch {
      // ignore quota error
    }
  }
}

/**
 * Evict a repository from the cache so next fetch gets fresh content from GitHub.
 */
export function invalidateRepoCache(owner: string, repo: string, branch?: string): void {
  const prefix = branch
    ? `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}@${branch.trim().toLowerCase()}`
    : `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`

  // Clear from memory
  for (const k of memoryStructureCache.keys()) {
    if (k.startsWith(prefix)) memoryStructureCache.delete(k)
  }
  for (const k of memoryFileCache.keys()) {
    if (k.startsWith(prefix)) memoryFileCache.delete(k)
  }

  // Clear from localStorage
  try {
    const index = getCacheIndex()
    const remaining = index.filter(k => {
      if (k.startsWith(prefix)) {
        localStorage.removeItem(`${CACHE_PREFIX}${k}`)
        return false
      }
      return true
    })
    localStorage.setItem(INDEX_KEY, JSON.stringify(remaining))

    // Clear matching file contents
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const storageKey = localStorage.key(i)
      if (storageKey && storageKey.startsWith(`${FILE_CACHE_PREFIX}${prefix}`)) {
        localStorage.removeItem(storageKey)
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Human-readable relative time (e.g. "just now", "3m ago", "1h ago").
 */
export function formatCacheAge(timestamp: number): string {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSec < 60) return 'just now'
  const min = Math.floor(elapsedSec / 60)
  if (min < 60) return `${min}m ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * List all currently cached repositories with their summary data.
 */
export function listCachedProjects(): Array<{
  key: string
  fullName: string
  branch: string
  fileCount: number
  age: string
  timestamp: number
}> {
  const index = getCacheIndex()
  const results: Array<{
    key: string
    fullName: string
    branch: string
    fileCount: number
    age: string
    timestamp: number
  }> = []

  for (const key of index) {
    try {
      const stored = localStorage.getItem(`${CACHE_PREFIX}${key}`)
      if (stored) {
        const parsed: CachedProjectStructure = JSON.parse(stored)
        results.push({
          key,
          fullName: parsed.repo.fullName,
          branch: parsed.branch,
          fileCount: parsed.files.length,
          age: formatCacheAge(parsed.timestamp),
          timestamp: parsed.timestamp,
        })
      }
    } catch {
      // ignore
    }
  }

  return results
}
