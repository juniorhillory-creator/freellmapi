// GitHub OAuth authentication helper for the Playground.
// Adheres to AI Studio preview iframe constraints: opens provider authorization
// URL directly in a popup window and uses postMessage cross-origin communication.

export interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
  public_repos?: number
  total_private_repos?: number
}

export interface GitHubUserRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  default_branch: string
  description: string | null
  stargazers_count: number
  updated_at?: string
}

export interface GitHubOAuthStatus {
  configured: boolean
  clientId: string | null
  appUrl: string
  sharedUrl: string
}

/**
 * Fetch OAuth configuration status and available client ID from the server
 */
export async function getOAuthStatus(): Promise<GitHubOAuthStatus> {
  try {
    const res = await fetch('/api/auth/github/status')
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn('[github-oauth] Failed to fetch OAuth status:', err)
  }
  return {
    configured: false,
    clientId: null,
    appUrl: 'https://ais-dev-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app',
    sharedUrl: 'https://ais-pre-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app',
  }
}

/**
 * Request GitHub authorization URL from the backend
 */
export async function getGitHubOAuthUrl(): Promise<string> {
  const res = await fetch('/api/auth/github/url')
  if (!res.ok) {
    throw new Error('Failed to obtain GitHub OAuth authorization URL.')
  }
  const data = await res.json()
  return data.url
}

/**
 * Fetch authenticated GitHub user details
 */
export async function fetchAuthenticatedUser(token: string): Promise<GitHubUser | null> {
  if (!token.trim()) return null
  try {
    const res = await fetch('/api/auth/github/user', {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
      },
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (err) {
    console.warn('[github-oauth] Failed to fetch authenticated user:', err)
  }
  return null
}

/**
 * Fetch all repositories for the authenticated user, including private repositories
 */
export async function fetchUserRepositories(token: string): Promise<GitHubUserRepo[]> {
  if (!token.trim()) return []
  try {
    const res = await fetch('/api/auth/github/user/repos', {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
      },
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        return data
      }
    }
  } catch (err) {
    console.warn('[github-oauth] Failed to fetch user repositories:', err)
  }
  return []
}

/**
 * Opens popup directly to GitHub OAuth provider URL and listens for postMessage callback.
 */
export function openGitHubOAuthPopup(
  authUrl: string,
  onSuccess: (token: string, user?: GitHubUser) => void,
  onError?: (error: Error) => void,
): () => void {
  const width = 640
  const height = 740
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2

  const popup = window.open(
    authUrl,
    'github_oauth_popup',
    `width=${width},height=${height},left=${left},top=${top},status=yes,scrollbars=yes,resizable=yes`,
  )

  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    onError?.(new Error('Popup blocked. Please allow popups for this site to complete GitHub authentication.'))
    return () => {}
  }

  let isCleanedUp = false

  const handleMessage = (event: MessageEvent) => {
    // Validate origin: accept preview run.app URLs or localhost
    const origin = event.origin || ''
    const isAllowedOrigin =
      origin.endsWith('.run.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin === window.location.origin

    if (!isAllowedOrigin) return

    if (event.data?.type === 'GITHUB_OAUTH_SUCCESS') {
      const { token, user } = event.data
      if (token) {
        cleanup()
        onSuccess(token, user)
      }
    }
  }

  // Periodic poll to check if user closed popup without completing auth
  const timer = setInterval(() => {
    if (popup.closed && !isCleanedUp) {
      cleanup()
    }
  }, 1000)

  function cleanup() {
    if (isCleanedUp) return
    isCleanedUp = true
    window.removeEventListener('message', handleMessage)
    clearInterval(timer)
  }

  window.addEventListener('message', handleMessage)

  return cleanup
}
