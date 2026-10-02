// GitHub Project Import helper for the Playground.
// Supports fetching public and private repositories, file trees, file previews,
// and preparing project context for LLM conversations.

export interface GitHubRepoInfo {
  owner: string
  name: string
  fullName: string
  description: string | null
  defaultBranch: string
  stars: number
  forks: number
  language: string | null
  license: string | null
  isPrivate: boolean
  htmlUrl: string
}

export interface GitHubFileItem {
  path: string
  name: string
  size: number
  extension: string
  isImportant: boolean
  isBinary: boolean
}

export interface ParsedGitHubUrl {
  owner: string
  repo: string
  branch?: string
  subpath?: string
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'bmp', 'tiff',
  'mp3', 'wav', 'ogg', 'mp4', 'mov', 'webm', 'avi',
  'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'wasm',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pyc', 'class', 'o', 'obj',
])

const IMPORTANT_FILE_NAMES = new Set([
  'readme.md', 'readme', 'readme.txt',
  'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js',
  'cargo.toml', 'pyproject.toml', 'requirements.txt', 'setup.py',
  'go.mod', 'gemfile', 'composer.json', 'dockerfile', 'docker-compose.yml',
  'makefile', 'architecture.md', 'contributing.md', 'index.html',
])

export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Format 1: owner/repo or owner/repo#branch
  const shorthandMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:#([a-zA-Z0-9_./-]+))?$/)
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2].replace(/\.git$/, ''),
      branch: shorthandMatch[3],
    }
  }

  // Format 2: full URL https://github.com/owner/repo/tree/branch/subpath
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (url.hostname !== 'github.com' && !url.hostname.endsWith('.github.com')) {
      return null
    }

    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 2) return null

    const owner = segments[0]
    const repo = segments[1].replace(/\.git$/, '')
    let branch: string | undefined
    let subpath: string | undefined

    if (segments[2] === 'tree' && segments[3]) {
      branch = segments[3]
      if (segments.length > 4) {
        subpath = segments.slice(4).join('/')
      }
    }

    return { owner, repo, branch, subpath }
  } catch {
    return null
  }
}

export function validateGitHubRepoUrl(input: string): {
  valid: boolean
  error?: string
  parsed?: ParsedGitHubUrl
} {
  const trimmed = input.trim()
  if (!trimmed) {
    return { valid: false, error: 'Repository URL cannot be empty' }
  }

  const parsed = parseGitHubUrl(trimmed)
  if (!parsed) {
    return {
      valid: false,
      error: 'Please enter a valid GitHub URL (e.g. https://github.com/owner/repo) or shorthand (owner/repo)',
    }
  }

  const validOwnerPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/
  const validRepoPattern = /^[a-zA-Z0-9_.-]+$/

  if (!validOwnerPattern.test(parsed.owner)) {
    return { valid: false, error: `Invalid GitHub owner or organization name "${parsed.owner}"` }
  }

  if (!validRepoPattern.test(parsed.repo)) {
    return { valid: false, error: `Invalid GitHub repository name "${parsed.repo}"` }
  }

  return { valid: true, parsed }
}

export interface TreeNode {
  name: string
  path: string
  type: 'folder' | 'file'
  size?: number
  extension?: string
  isImportant?: boolean
  children?: TreeNode[]
}

export function buildFileTree(files: GitHubFileItem[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'folder', children: [] }

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      const currentPath = parts.slice(0, i + 1).join('/')

      if (isFile) {
        current.children = current.children || []
        current.children.push({
          name: part,
          path: file.path,
          type: 'file',
          size: file.size,
          extension: file.extension,
          isImportant: file.isImportant,
        })
      } else {
        current.children = current.children || []
        let folder = current.children.find(c => c.type === 'folder' && c.name === part)
        if (!folder) {
          folder = {
            name: part,
            path: currentPath,
            type: 'folder',
            children: [],
          }
          current.children.push(folder)
        }
        current = folder
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children) sortNodes(node.children)
    }
  }

  if (root.children) sortNodes(root.children)
  return root.children || []
}

export function isBinaryFile(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  const ext = path.slice(dot + 1).toLowerCase()
  return BINARY_EXTENSIONS.has(ext)
}

export function isImportantFile(path: string): boolean {
  const filename = path.split('/').pop()?.toLowerCase() ?? ''
  if (IMPORTANT_FILE_NAMES.has(filename)) return true
  if (filename.startsWith('readme.')) return true
  return false
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function fetchGitHubRepoInfo(
  owner: string,
  repo: string,
  token?: string,
): Promise<GitHubRepoInfo> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`
  }

  let res: Response
  try {
    res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
  } catch {
    // Try fallback proxy
    res = await fetch(`/api/github/repo?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`, { headers })
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" was not found or is private (a Personal Access Token may be required).`)
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub API rate limit exceeded. Please provide a GitHub Personal Access Token.')
    }
    throw new Error(`GitHub API error (${res.status}): ${res.statusText}`)
  }

  const data = await res.json()
  return {
    owner: data.owner?.login ?? owner,
    name: data.name ?? repo,
    fullName: data.full_name ?? `${owner}/${repo}`,
    description: data.description ?? null,
    defaultBranch: data.default_branch ?? 'main',
    stars: data.stargazers_count ?? 0,
    forks: data.forks_count ?? 0,
    language: data.language ?? null,
    license: data.license?.spdx_id ?? data.license?.name ?? null,
    isPrivate: Boolean(data.private),
    htmlUrl: data.html_url ?? `https://github.com/${owner}/${repo}`,
  }
}

export async function fetchGitHubTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<GitHubFileItem[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  }
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`
  }

  let res: Response
  try {
    res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    )
  } catch {
    res = await fetch(
      `/api/github/tree?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`,
      { headers },
    )
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch file tree for "${branch}" (${res.status}): ${res.statusText}`)
  }

  const data = await res.json()
  const rawTree: Array<{ path: string; type: string; size?: number }> = data.tree ?? []

  const files: GitHubFileItem[] = []
  for (const item of rawTree) {
    if (item.type !== 'blob') continue
    if (item.path.startsWith('.git/')) continue

    const name = item.path.split('/').pop() ?? item.path
    const dot = name.lastIndexOf('.')
    const extension = dot !== -1 ? name.slice(dot + 1).toLowerCase() : ''
    const size = item.size ?? 0
    const binary = isBinaryFile(item.path)

    files.push({
      path: item.path,
      name,
      size,
      extension,
      isImportant: isImportantFile(item.path),
      isBinary: binary,
    })
  }

  return files
}

export async function fetchGitHubFileContent(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  token?: string,
): Promise<string> {
  const headers: Record<string, string> = {}
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`
  }

  // 1. First try raw.githubusercontent.com for clean text download
  try {
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${filePath}`,
      { headers },
    )
    if (rawRes.ok) {
      return await rawRes.text()
    }
  } catch {
    // ignore and fallback
  }

  // 2. Fallback to GitHub REST API contents endpoint
  try {
    const apiRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          ...headers,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    )

    if (apiRes.ok) {
      const data = await apiRes.json()
      if (data.content && data.encoding === 'base64') {
        const decoded = atob(data.content.replace(/\n/g, ''))
        return decoded
      }
    }
  } catch {
    // ignore
  }

  // 3. Fallback to mock proxy
  const proxyRes = await fetch(
    `/api/github/content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(filePath)}`,
    { headers },
  )
  if (proxyRes.ok) {
    const data = await proxyRes.json()
    return data.content ?? ''
  }

  throw new Error(`Failed to load content for ${filePath}`)
}

export function formatRepoContextPrompt(
  repo: GitHubRepoInfo,
  branch: string,
  filesWithContent: Array<{ path: string; content: string }>,
  allFilePaths: string[],
): string {
  const parts: string[] = []

  parts.push(`# GitHub Project: [${repo.fullName}](${repo.htmlUrl})`)
  if (repo.description) {
    parts.push(`> ${repo.description}`)
  }
  parts.push(
    `- **Branch**: \`${branch}\` | **Language**: ${repo.language || 'Multi-language'} | **Stars**: ${repo.stars.toLocaleString()} | **License**: ${repo.license || 'None'}`,
  )

  parts.push('\n## Repository Structure Overview')
  const treeDisplay = allFilePaths.slice(0, 80).map(p => `├── ${p}`).join('\n')
  const overflow = allFilePaths.length > 80 ? `\n└── ... and ${allFilePaths.length - 80} more files` : ''
  parts.push('```\n' + treeDisplay + overflow + '\n```')

  if (filesWithContent.length > 0) {
    parts.push(`\n## Imported Project Files (${filesWithContent.length} files)`)
    for (const file of filesWithContent) {
      const ext = file.path.split('.').pop() || 'text'
      parts.push(`\n### File: \`${file.path}\`\n\`\`\`${ext}\n${file.content}\n\`\`\``)
    }
  }

  parts.push('\n---')
  parts.push('Please analyze this project. You can help explain its architecture, suggest improvements, find bugs, or answer questions about its implementation.')

  return parts.join('\n')
}
