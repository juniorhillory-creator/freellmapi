import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitFork,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { Dialog, DialogClose, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import {
  formatCacheAge,
  getCachedProjectStructure,
  invalidateRepoCache,
  listCachedProjects,
  setCachedProjectStructure,
} from '@/lib/github-cache'
import {
  buildFileTree,
  fetchGitHubFileContent,
  fetchGitHubRepoInfo,
  fetchGitHubTree,
  formatRepoContextPrompt,
  validateGitHubRepoUrl,
  type GitHubFileItem,
  type GitHubRepoInfo,
  type TreeNode,
} from '@/lib/github-import'
import {
  fetchAuthenticatedUser,
  fetchUserRepositories,
  getGitHubOAuthUrl,
  getOAuthStatus,
  openGitHubOAuthPopup,
  type GitHubOAuthStatus,
  type GitHubUser,
  type GitHubUserRepo,
} from '@/lib/github-oauth'
import type { Attachment } from '@/lib/attachments'

function GitHubIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
}

export interface ImportGithubProjectProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportToCurrent?: (attachments: Attachment[], promptText?: string) => void
  onImportToNewConversation?: (title: string, promptText: string, attachments: Attachment[]) => void
  onProjectImported?: (projectData: {
    repo: GitHubRepoInfo
    branch: string
    files: GitHubFileItem[]
    structureSummary: string
    promptText: string
    attachments: Attachment[]
  }) => void
}

const SAMPLE_REPOSITORIES = [
  'juniorhillory-creator/freellmapi',
  'expressjs/express',
  'pallets/flask',
  'tailwindlabs/tailwindcss',
]

export function ImportGithubProject({
  open,
  onOpenChange,
  onImportToCurrent,
  onImportToNewConversation,
  onProjectImported,
}: ImportGithubProjectProps) {
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [token, setToken] = useState(() => localStorage.getItem('playground.githubToken') ?? '')
  const [showTokenSettings, setShowTokenSettings] = useState(false)

  // Loading & Data States
  const [fetching, setFetching] = useState(false)
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null)
  const [files, setFiles] = useState<GitHubFileItem[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // View & Filter States
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'key' | 'code' | 'selected'>('all')

  // Import Action States
  const [importTarget, setImportTarget] = useState<'new_chat' | 'current_chat'>('new_chat')
  const [importFormat, setImportFormat] = useState<'prompt' | 'attachments'>('prompt')
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null)

  // File Preview
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Caching layer state
  const [cacheStatus, setCacheStatus] = useState<{ isCached: boolean; age?: string; timestamp?: number } | null>(null)
  const [cachedProjectsList, setCachedProjectsList] = useState(() => listCachedProjects())

  // Refresh cached projects list whenever modal opens
  useEffect(() => {
    if (open) {
      setCachedProjectsList(listCachedProjects())
    }
  }, [open])

  // Real-time URL validation state
  const validationResult = useMemo(() => {
    if (!repoUrl.trim()) return null
    return validateGitHubRepoUrl(repoUrl)
  }, [repoUrl])

  const handleTokenChange = (val: string) => {
    setToken(val)
    localStorage.setItem('playground.githubToken', val)
    if (!val.trim()) {
      setCurrentUser(null)
      setUserRepos([])
      setShowUserRepos(false)
      localStorage.removeItem('playground.githubUser')
    } else {
      fetchAuthenticatedUser(val).then(u => {
        if (u) {
          setCurrentUser(u)
          localStorage.setItem('playground.githubUser', JSON.stringify(u))
        }
      })
    }
  }

  // GitHub OAuth States
  const [currentUser, setCurrentUser] = useState<GitHubUser | null>(() => {
    try {
      const saved = localStorage.getItem('playground.githubUser')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [userRepos, setUserRepos] = useState<GitHubUserRepo[]>([])
  const [loadingUserRepos, setLoadingUserRepos] = useState(false)
  const [showUserRepos, setShowUserRepos] = useState(false)
  const [userReposFilter, setUserReposFilter] = useState<'all' | 'private' | 'public'>('all')
  const [userReposSearch, setUserReposSearch] = useState('')
  const [oauthStatus, setOauthStatus] = useState<GitHubOAuthStatus | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  // Fetch OAuth status & user details on modal open or when token is updated
  useEffect(() => {
    if (open) {
      getOAuthStatus().then(setOauthStatus)
      if (token && !currentUser) {
        fetchAuthenticatedUser(token).then(u => {
          if (u) {
            setCurrentUser(u)
            localStorage.setItem('playground.githubUser', JSON.stringify(u))
          }
        })
      }
    }
  }, [open, token, currentUser])

  // Fetch user repositories when authenticated
  const handleLoadUserRepos = useCallback(async () => {
    if (!token) return
    setLoadingUserRepos(true)
    try {
      const repos = await fetchUserRepositories(token)
      setUserRepos(repos)
      setShowUserRepos(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch repositories.')
    } finally {
      setLoadingUserRepos(false)
    }
  }, [token])

  // Initiate GitHub OAuth Popup Flow
  const handleConnectOAuth = async () => {
    setIsAuthenticating(true)
    try {
      const authUrl = await getGitHubOAuthUrl()
      openGitHubOAuthPopup(
        authUrl,
        async (newToken, user) => {
          setIsAuthenticating(false)
          setToken(newToken)
          localStorage.setItem('playground.githubToken', newToken)

          if (user) {
            setCurrentUser(user)
            localStorage.setItem('playground.githubUser', JSON.stringify(user))
            toast.success(`Connected to GitHub as @${user.login}!`)
          } else {
            const fetched = await fetchAuthenticatedUser(newToken)
            if (fetched) {
              setCurrentUser(fetched)
              localStorage.setItem('playground.githubUser', JSON.stringify(fetched))
              toast.success(`Connected to GitHub as @${fetched.login}!`)
            } else {
              toast.success('GitHub OAuth connection established!')
            }
          }

          // Fetch user's repos automatically
          const repos = await fetchUserRepositories(newToken)
          setUserRepos(repos)
          setShowUserRepos(true)
        },
        error => {
          setIsAuthenticating(false)
          toast.error(error.message)
        },
      )
    } catch (err: any) {
      setIsAuthenticating(false)
      toast.error(err.message || 'Could not initiate GitHub OAuth.')
    }
  }

  // Disconnect GitHub OAuth
  const handleDisconnectOAuth = () => {
    setToken('')
    setCurrentUser(null)
    setUserRepos([])
    setShowUserRepos(false)
    localStorage.removeItem('playground.githubToken')
    localStorage.removeItem('playground.githubUser')
    toast.info('Disconnected from GitHub')
  }

  const handleCopyCallbackUrl = (urlToCopy: string) => {
    navigator.clipboard.writeText(urlToCopy)
    setCopiedUrl(urlToCopy)
    toast.success('Callback URL copied to clipboard!')
    setTimeout(() => setCopiedUrl(null), 2500)
  }

  // Filtered User Repositories
  const filteredUserRepos = useMemo(() => {
    const q = userReposSearch.trim().toLowerCase()
    return userRepos.filter(r => {
      if (userReposFilter === 'private' && !r.private) return false
      if (userReposFilter === 'public' && r.private) return false
      if (q && !r.full_name.toLowerCase().includes(q) && !(r.description || '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [userRepos, userReposFilter, userReposSearch])

  const handleSelectUserRepo = (repo: GitHubUserRepo) => {
    setRepoUrl(repo.full_name)
    setBranch(repo.default_branch)
    setShowUserRepos(false)
    handleFetchProjectStructure(repo.full_name, false)
  }

  // Fetch Project Structure from GitHub with Local Caching
  const handleFetchProjectStructure = async (targetUrl?: string, bypassCache = false) => {
    const input = (targetUrl ?? repoUrl).trim()
    const validation = validateGitHubRepoUrl(input)
    if (!validation.valid || !validation.parsed) {
      toast.error(validation.error || 'Please enter a valid GitHub repository URL.')
      return
    }

    const { owner, repo, branch: parsedBranch } = validation.parsed
    const targetBranch = parsedBranch || branch.trim() || 'main'

    // Check local caching layer first (prevents redundant network calls)
    if (!bypassCache) {
      const cached = getCachedProjectStructure(owner, repo, targetBranch)
      if (cached) {
        setBranch(cached.branch)
        setRepoInfo(cached.repo)
        setFiles(cached.files)
        setCacheStatus({
          isCached: true,
          age: formatCacheAge(cached.timestamp),
          timestamp: cached.timestamp,
        })
        const defaultSelected = new Set<string>()
        const initialExpanded = new Set<string>()

        for (const f of cached.files) {
          if (!f.isBinary && f.isImportant) {
            defaultSelected.add(f.path)
            const segments = f.path.split('/')
            for (let i = 1; i < segments.length; i++) {
              initialExpanded.add(segments.slice(0, i).join('/'))
            }
          }
        }

        setSelectedPaths(defaultSelected)
        setExpandedFolders(initialExpanded)
        setPreviewFile(null)
        toast.success(`Loaded from local cache (${formatCacheAge(cached.timestamp)})`)
        return
      }
    }

    setFetching(true)
    setRepoInfo(null)
    setFiles([])
    setSelectedPaths(new Set())
    setPreviewFile(null)
    setCacheStatus(null)

    try {
      const info = await fetchGitHubRepoInfo(owner, repo, token)
      const resolvedBranch = parsedBranch || branch.trim() || info.defaultBranch
      setBranch(resolvedBranch)
      setRepoInfo(info)

      const tree = await fetchGitHubTree(owner, repo, resolvedBranch, token)
      setFiles(tree)

      // Store fetched structure in local cache
      setCachedProjectStructure(owner, repo, resolvedBranch, { repo: info, files: tree })
      setCacheStatus({
        isCached: true,
        age: 'just now',
        timestamp: Date.now(),
      })
      setCachedProjectsList(listCachedProjects())

      // Auto-select key architectural and config files
      const defaultSelected = new Set<string>()
      const initialExpanded = new Set<string>()

      for (const f of tree) {
        if (!f.isBinary && f.isImportant) {
          defaultSelected.add(f.path)
          // Also expand parent directories of important files
          const segments = f.path.split('/')
          for (let i = 1; i < segments.length; i++) {
            initialExpanded.add(segments.slice(0, i).join('/'))
          }
        }
      }

      setSelectedPaths(defaultSelected)
      setExpandedFolders(initialExpanded)
      toast.success(
        bypassCache
          ? `Refreshed structure for ${info.fullName} (${tree.length} files)`
          : `Fetched structure for ${info.fullName} (${tree.length} files)`,
      )
    } catch (err: any) {
      console.error('[ImportGithubProject] Fetch error:', err)
      toast.error(err.message || 'Failed to fetch repository structure.')
    } finally {
      setFetching(false)
    }
  }

  const handleForceRefresh = () => {
    if (repoInfo) {
      invalidateRepoCache(repoInfo.owner, repoInfo.name, branch)
    }
    handleFetchProjectStructure(repoUrl, true)
  }

  // Helper to recursively filter tree nodes by search query
  const filteredTreeNodes = useMemo(() => {
    const textFiles = files.filter(f => !f.isBinary)
    const rawTree = buildFileTree(textFiles)
    if (!searchQuery.trim()) return rawTree

    const q = searchQuery.trim().toLowerCase()
    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      const out: TreeNode[] = []
      for (const node of nodes) {
        if (node.type === 'file') {
          if (node.path.toLowerCase().includes(q) || node.name.toLowerCase().includes(q)) {
            out.push(node)
          }
        } else if (node.type === 'folder' && node.children) {
          const matchedChildren = filterNodes(node.children)
          if (matchedChildren.length > 0 || node.name.toLowerCase().includes(q)) {
            out.push({ ...node, children: matchedChildren })
          }
        }
      }
      return out
    }
    return filterNodes(rawTree)
  }, [files, searchQuery])

  // Auto-expand folders when searching so matches are immediately visible
  useEffect(() => {
    if (searchQuery.trim()) {
      const matchingFolders = new Set<string>()
      files.forEach(f => {
        if (!f.isBinary && f.path.toLowerCase().includes(searchQuery.toLowerCase())) {
          const parts = f.path.split('/')
          for (let i = 1; i < parts.length; i++) {
            matchingFolders.add(parts.slice(0, i).join('/'))
          }
        }
      })
      setExpandedFolders(prev => new Set([...prev, ...matchingFolders]))
    }
  }, [searchQuery, files])

  // Get all descendant non-binary file paths inside a folder path
  const getFolderFilePaths = useCallback(
    (folderPath: string): string[] => {
      const prefix = folderPath + '/'
      return files
        .filter(f => !f.isBinary && (f.path === folderPath || f.path.startsWith(prefix)))
        .map(f => f.path)
    },
    [files],
  )

  // Toggle selection for all files inside a folder
  const toggleFolderSelection = useCallback(
    (folderPath: string) => {
      const targetPaths = getFolderFilePaths(folderPath)
      if (targetPaths.length === 0) return

      setSelectedPaths(prev => {
        const next = new Set(prev)
        const allSelected = targetPaths.every(p => next.has(p))
        if (allSelected) {
          targetPaths.forEach(p => next.delete(p))
        } else {
          targetPaths.forEach(p => next.add(p))
        }
        return next
      })
    },
    [getFolderFilePaths],
  )

  // Filtered Flat List
  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return files.filter(f => {
      if (f.isBinary) return false
      if (q && !f.path.toLowerCase().includes(q)) return false
      if (categoryFilter === 'key' && !f.isImportant) return false
      if (categoryFilter === 'selected' && !selectedPaths.has(f.path)) return false
      if (categoryFilter === 'code') {
        const ext = f.extension
        const isCodeExt = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'php', 'swift', 'kt'].includes(ext)
        if (!isCodeExt) return false
      }
      return true
    })
  }, [files, searchQuery, categoryFilter, selectedPaths])

  // Selection Calculations
  const selectedFiles = useMemo(() => files.filter(f => selectedPaths.has(f.path)), [files, selectedPaths])
  const totalSelectedBytes = useMemo(() => selectedFiles.reduce((acc, f) => acc + f.size, 0), [selectedFiles])
  const estimatedTokens = Math.ceil(totalSelectedBytes / 4)

  const toggleSelectFile = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }

  const expandAllFolders = () => {
    const all = new Set<string>()
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          all.add(node.path)
          if (node.children) walk(node.children)
        }
      }
    }
    walk(filteredTreeNodes)
    setExpandedFolders(all)
  }

  const collapseAllFolders = () => {
    setExpandedFolders(new Set())
  }

  const selectKeyFiles = () => {
    const next = new Set<string>()
    files.forEach(f => {
      if (!f.isBinary && f.isImportant) next.add(f.path)
    })
    setSelectedPaths(next)
  }

  const selectAllFiltered = () => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      filteredFiles.forEach(f => next.add(f.path))
      return next
    })
  }

  const clearSelection = () => {
    setSelectedPaths(new Set())
  }

  // Preview File Content
  const handlePreviewFile = async (path: string) => {
    if (!repoInfo) return
    setLoadingPreview(true)
    try {
      const content = await fetchGitHubFileContent(
        repoInfo.owner,
        repoInfo.name,
        branch || repoInfo.defaultBranch,
        path,
        token,
      )
      setPreviewFile({ path, content })
    } catch (err: any) {
      toast.error(err.message || `Failed to preview ${path}`)
    } finally {
      setLoadingPreview(false)
    }
  }

  // Execute Project Import & Sync
  const handleSyncToPlayground = async () => {
    if (!repoInfo) return
    if (selectedPaths.size === 0) {
      toast.error('Please select at least one file from the project structure to import.')
      return
    }

    setSyncing(true)
    const targetBranch = branch.trim() || repoInfo.defaultBranch
    const loadedFiles: Array<{ path: string; content: string }> = []
    const attachments: Attachment[] = []

    try {
      let count = 0
      for (const file of selectedFiles) {
        setSyncProgress({ current: count + 1, total: selectedFiles.length })
        const content = await fetchGitHubFileContent(
          repoInfo.owner,
          repoInfo.name,
          targetBranch,
          file.path,
          token,
        )
        loadedFiles.push({ path: file.path, content })

        attachments.push({
          id: `gh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'text',
          name: file.path,
          text: content,
        })
        count++
      }

      const allFilePaths = files.map(f => f.path)
      const promptText = formatRepoContextPrompt(repoInfo, targetBranch, loadedFiles, allFilePaths)
      const structureSummary = `GitHub: ${repoInfo.fullName} (${loadedFiles.length} files imported)`

      if (onProjectImported) {
        onProjectImported({
          repo: repoInfo,
          branch: targetBranch,
          files: selectedFiles,
          structureSummary,
          promptText,
          attachments,
        })
      }

      if (importTarget === 'new_chat') {
        const title = `GitHub: ${repoInfo.name}`
        onImportToNewConversation?.(
          title,
          importFormat === 'prompt' ? promptText : `Imported ${loadedFiles.length} files from ${repoInfo.fullName}`,
          importFormat === 'attachments' ? attachments : [],
        )
        toast.success(`Created project conversation for "${repoInfo.fullName}" with ${loadedFiles.length} files.`)
      } else {
        if (importFormat === 'prompt') {
          onImportToCurrent?.([], promptText)
        } else {
          onImportToCurrent?.(attachments, undefined)
        }
        toast.success(`Synced ${loadedFiles.length} files into current Playground chat.`)
      }

      onOpenChange(false)
    } catch (err: any) {
      console.error('[ImportGithubProject] Sync error:', err)
      toast.error(err.message || 'Error syncing project files from GitHub.')
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  // Recursive Tree Node Renderer for Collapsible File Tree
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    if (node.type === 'folder') {
      const isExpanded = expandedFolders.has(node.path)
      const folderPaths = getFolderFilePaths(node.path)
      const selectedInFolder = folderPaths.filter(p => selectedPaths.has(p)).length
      const isAllSelected = folderPaths.length > 0 && selectedInFolder === folderPaths.length
      const isIndeterminate = selectedInFolder > 0 && selectedInFolder < folderPaths.length

      return (
        <div key={node.path} className="select-none">
          <div
            className={`flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-muted/50 text-xs transition-colors group ${
              selectedInFolder > 0 ? 'bg-primary/5 font-medium' : ''
            }`}
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
          >
            {/* Expand / Collapse Toggle Button */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                toggleFolder(node.path)
              }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            >
              {isExpanded ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
            </button>

            {/* Folder Selection Checkbox for bulk folder selection */}
            <input
              type="checkbox"
              ref={el => {
                if (el) el.indeterminate = isIndeterminate
              }}
              checked={isAllSelected}
              onChange={() => toggleFolderSelection(node.path)}
              className="size-3.5 rounded-sm accent-primary cursor-pointer shrink-0"
              title={isAllSelected ? 'Deselect all files in this directory' : 'Select all files in this directory'}
            />

            {/* Folder Name & Icon */}
            <div
              onClick={() => toggleFolder(node.path)}
              className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
            >
              {isExpanded ? (
                <FolderOpen className="size-4 text-amber-500 shrink-0" />
              ) : (
                <Folder className="size-4 text-amber-500 shrink-0" />
              )}
              <span className="text-foreground truncate">{node.name}</span>
            </div>

            {/* Folder Counter */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto shrink-0 tabular-nums">
              {selectedInFolder > 0 ? (
                <span className="text-primary font-medium">
                  {selectedInFolder}/{folderPaths.length} selected
                </span>
              ) : (
                <span>({folderPaths.length} files)</span>
              )}
            </div>
          </div>

          {/* Collapsible Children */}
          {isExpanded && node.children && (
            <div className="border-l border-border/40 ml-4">
              {node.children.map(child => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    const isSelected = selectedPaths.has(node.path)
    return (
      <div
        key={node.path}
        className={`flex items-center justify-between gap-2 py-1 px-2 rounded-md hover:bg-muted/50 text-xs transition-colors ${
          isSelected ? 'bg-primary/5 font-medium' : ''
        }`}
        style={{ paddingLeft: `${depth * 14 + 22}px` }}
      >
        <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelectFile(node.path)}
            className="size-3.5 rounded-sm accent-primary cursor-pointer shrink-0"
          />
          {node.isImportant ? (
            <FileText className="size-3.5 text-amber-500 shrink-0" />
          ) : (
            <FileCode className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="truncate font-mono text-[11px]" title={node.path}>
            {node.name}
          </span>
          {node.isImportant && (
            <span className="px-1 py-0.2 rounded-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-medium shrink-0">
              Key
            </span>
          )}
        </label>

        <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground tabular-nums">
          <span>{node.size ? (node.size / 1024).toFixed(1) : 0} KB</span>
          <button
            type="button"
            disabled={loadingPreview}
            onClick={() => handlePreviewFile(node.path)}
            className="text-muted-foreground hover:text-foreground hover:underline p-0.5"
          >
            Preview
          </button>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-4xl" className="p-0 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b px-6 py-3.5 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <FolderGit2 className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold leading-none">
                Import GitHub Project
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Fetch and sync project structure, code, and architecture into the Playground
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/60 border text-xs">
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.login}
                    className="size-4 rounded-full"
                  />
                  <span className="font-medium text-foreground text-[11px]">@{currentUser.login}</span>
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500" title="OAuth Authenticated" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    if (userRepos.length === 0) {
                      handleLoadUserRepos()
                    } else {
                      setShowUserRepos(prev => !prev)
                    }
                  }}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Lock className="size-3 text-amber-500" />
                  <span>My Repos</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleDisconnectOAuth}
                  className="h-7 px-1.5 text-muted-foreground hover:text-destructive"
                  title="Disconnect GitHub account"
                >
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleConnectOAuth}
                disabled={isAuthenticating}
                className="gap-1.5 h-8 text-xs font-medium border-border/80 hover:bg-muted"
                title="Authenticate with GitHub to import private repositories"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Connecting…</span>
                  </>
                ) : (
                  <>
                    <GitHubIcon className="size-3.5" />
                    <span>Connect GitHub</span>
                  </>
                )}
              </Button>
            )}

            <DialogClose className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-1">
              <X className="size-4" />
            </DialogClose>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* GitHub URL & Validation Input */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleFetchProjectStructure()
                    }
                  }}
                  placeholder="https://github.com/owner/repo or owner/repo"
                  className={`pl-9 pr-8 h-10 text-sm ${
                    validationResult && !validationResult.valid ? 'border-destructive/60 focus-visible:ring-destructive/30' : ''
                  }`}
                  disabled={fetching || syncing}
                />
                {repoUrl && (
                  <button
                    type="button"
                    onClick={() => setRepoUrl('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="w-full sm:w-36">
                <div className="relative">
                  <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    placeholder="branch (main)"
                    className="pl-8 h-10 text-sm font-mono"
                    disabled={fetching || syncing}
                  />
                </div>
              </div>

              <Button
                onClick={() => handleFetchProjectStructure()}
                disabled={fetching || !repoUrl.trim() || syncing || (validationResult !== null && !validationResult.valid)}
                className="h-10 px-5 gap-2 shrink-0 font-medium"
              >
                {fetching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Fetching Structure…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4" />
                    Fetch Project
                  </>
                )}
              </Button>
            </div>

            {/* Validation Feedback & Help */}
            <div className="flex items-center justify-between text-xs">
              <div>
                {validationResult?.valid && (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="size-3.5" />
                    Valid repository: {validationResult.parsed?.owner}/{validationResult.parsed?.repo}
                  </span>
                )}
                {validationResult && !validationResult.valid && (
                  <span className="text-destructive font-medium">
                    {validationResult.error}
                  </span>
                )}
                {!validationResult && (
                  <span className="text-muted-foreground">
                    Accepts GitHub repository URLs, branches, or owner/repo format.
                  </span>
                )}
              </div>

              {/* OAuth & Token toggle */}
              <div className="flex items-center gap-2 ml-auto">
                {!currentUser && (
                  <button
                    type="button"
                    onClick={handleConnectOAuth}
                    disabled={isAuthenticating}
                    className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                  >
                    <Lock className="size-3" />
                    <span>OAuth for Private Repos</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowTokenSettings(prev => !prev)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <KeyRound className="size-3" />
                  <span>Auth & Token</span>
                  {showTokenSettings ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                </button>
              </div>
            </div>

            {/* User Repositories Drawer / Picker */}
            {currentUser && showUserRepos && (
              <div className="rounded-xl border bg-muted/20 p-3 space-y-2.5 animate-in fade-in-50 duration-150">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <GitHubIcon className="size-3.5" />
                    <span>Your GitHub Repositories ({userRepos.length})</span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      · Click any repository to import
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleLoadUserRepos}
                      disabled={loadingUserRepos}
                      className="h-6 px-1.5 text-[11px]"
                      title="Reload repositories"
                    >
                      <RefreshCw className={`size-3 ${loadingUserRepos ? 'animate-spin' : ''}`} />
                    </Button>
                    <button
                      type="button"
                      onClick={() => setShowUserRepos(false)}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                    <Input
                      value={userReposSearch}
                      onChange={e => setUserReposSearch(e.target.value)}
                      placeholder="Search your repositories…"
                      className="h-7 pl-7 text-xs bg-background"
                    />
                  </div>
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-[11px]">
                    {(['all', 'private', 'public'] as const).map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setUserReposFilter(tab)}
                        className={`px-2 py-0.5 rounded capitalize transition-colors ${
                          userReposFilter === tab ? 'bg-background shadow-2xs font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab === 'private' ? 'Private' : tab === 'public' ? 'Public' : 'All'}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingUserRepos ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span>Loading repositories from GitHub…</span>
                  </div>
                ) : filteredUserRepos.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {userRepos.length === 0
                      ? 'No repositories found for this account.'
                      : 'No repositories matching search query.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {filteredUserRepos.map(repo => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => handleSelectUserRepo(repo)}
                        className="flex items-start justify-between gap-2 p-2 rounded-lg border bg-background hover:bg-muted/60 text-left transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-medium text-foreground truncate group-hover:text-primary">
                              {repo.name}
                            </span>
                            {repo.private ? (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-amber-500/40 text-amber-600 dark:text-amber-400 gap-0.5">
                                <Lock className="size-2.5" />
                                Private
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 text-muted-foreground">
                                Public
                              </Badge>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                              {repo.description}
                            </p>
                          )}
                        </div>
                        {repo.stargazers_count > 0 && (
                          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0 tabular-nums">
                            <Star className="size-3 text-amber-500" />
                            <span>{repo.stargazers_count}</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Authentication & Token settings panel */}
            {showTokenSettings && (
              <div className="p-3.5 rounded-xl border bg-muted/20 space-y-3 animate-in fade-in-50 duration-150">
                {/* OAuth status section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b">
                  <div>
                    <div className="flex items-center gap-2">
                      <GitHubIcon className="size-4" />
                      <span className="text-xs font-semibold text-foreground">GitHub OAuth Integration</span>
                      {currentUser ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
                          Connected
                        </Badge>
                      ) : oauthStatus?.configured ? (
                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                          Ready to Connect
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Not Connected
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Enables secure access to private and organizational repositories without manual tokens.
                    </p>
                  </div>

                  <div>
                    {currentUser ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={handleDisconnectOAuth}
                        className="gap-1 text-xs text-destructive hover:text-destructive"
                      >
                        <LogOut className="size-3" />
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="xs"
                        onClick={handleConnectOAuth}
                        disabled={isAuthenticating}
                        className="gap-1.5 text-xs font-medium"
                      >
                        {isAuthenticating ? (
                          <>
                            <Loader2 className="size-3 animate-spin" />
                            Connecting…
                          </>
                        ) : (
                          <>
                            <GitHubIcon className="size-3" />
                            Connect with GitHub
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* OAuth Callback URLs for GitHub App configuration */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-[11px]">OAuth App Callback URLs:</span>
                    <a
                      href="https://github.com/settings/developers"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    >
                      <span>GitHub Developer Settings</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 p-1.5 rounded-md bg-background border text-[11px] font-mono">
                      <span className="text-muted-foreground text-[10px] font-sans shrink-0">Dev:</span>
                      <span className="truncate flex-1">
                        https://ais-dev-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app/api/auth/github/callback
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCallbackUrl(
                            'https://ais-dev-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app/api/auth/github/callback',
                          )
                        }
                        className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
                        title="Copy Development Callback URL"
                      >
                        {copiedUrl ===
                        'https://ais-dev-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app/api/auth/github/callback' ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 p-1.5 rounded-md bg-background border text-[11px] font-mono">
                      <span className="text-muted-foreground text-[10px] font-sans shrink-0">Shared:</span>
                      <span className="truncate flex-1">
                        https://ais-pre-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app/api/auth/github/callback
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyCallbackUrl(
                            'https://ais-pre-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app/api/auth/github/callback',
                          )
                        }
                        className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
                        title="Copy Shared Callback URL"
                      >
                        {copiedUrl ===
                        'https://ais-pre-z7rs6rqf5uez542o3rr3yk-61332230797.asia-southeast1.run.app/api/auth/github/callback' ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Personal Access Token alternative */}
                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Or Use Personal Access Token (PAT)</span>
                    <span className="text-[10px] text-muted-foreground">Scope required: repo, read:user</span>
                  </div>
                  <Input
                    type="password"
                    value={token}
                    onChange={e => handleTokenChange(e.target.value)}
                    placeholder="ghp_... or github_pat_..."
                    className="h-8 text-xs font-mono bg-background"
                  />
                </div>
              </div>
            )}

            {/* Recently Synced (Local Cache) list */}
            {cachedProjectsList.length > 0 && !repoInfo && (
              <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground/90">
                    <Zap className="size-3.5 text-amber-500" />
                    Recently Synced Repositories (instant cache):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      cachedProjectsList.forEach(p => {
                        const [owner, rest] = p.key.split('/')
                        const repo = rest.split('@')[0]
                        invalidateRepoCache(owner, repo)
                      })
                      setCachedProjectsList([])
                      toast.success('Cleared local GitHub cache')
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Clear cache
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {cachedProjectsList.map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setRepoUrl(item.fullName)
                        setBranch(item.branch)
                        handleFetchProjectStructure(item.fullName, false)
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background hover:bg-muted text-xs transition-colors border shadow-2xs group"
                    >
                      <FolderGit2 className="size-3 text-primary group-hover:scale-105 transition-transform" />
                      <span className="font-mono text-[11px] text-foreground font-medium">{item.fullName}</span>
                      <span className="text-[10px] text-muted-foreground font-sans">({item.age})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick sample chips */}
            {!repoInfo && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground pt-1">
                <span className="font-medium text-foreground/80">Examples:</span>
                {SAMPLE_REPOSITORIES.map(slug => (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => {
                      setRepoUrl(slug)
                      handleFetchProjectStructure(slug)
                    }}
                    className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted text-foreground/90 font-mono text-[11px] transition-colors"
                  >
                    {slug}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Repo Info Header Banner */}
          {repoInfo && (
            <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base truncate">{repoInfo.fullName}</h3>
                    {repoInfo.isPrivate && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400">
                        Private
                      </Badge>
                    )}
                    <a
                      href={repoInfo.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      title="Open on GitHub"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                  {repoInfo.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {repoInfo.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 tabular-nums">
                  {cacheStatus?.isCached && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <Zap className="size-3" />
                      Cached {cacheStatus.age}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleForceRefresh}
                    disabled={fetching}
                    className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    title="Bypass cache and re-fetch from GitHub"
                  >
                    <RefreshCw className={`size-3 ${fetching ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </Button>
                  <span className="flex items-center gap-1">
                    <Star className="size-3.5 text-amber-500" />
                    {repoInfo.stars.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitFork className="size-3.5" />
                    {repoInfo.forks.toLocaleString()}
                  </span>
                  {repoInfo.language && (
                    <span className="font-medium text-foreground">
                      {repoInfo.language}
                    </span>
                  )}
                  {repoInfo.license && (
                    <span>
                      {repoInfo.license}
                    </span>
                  )}
                </div>
              </div>

              {/* Selection Summary Controls */}
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {selectedPaths.size} of {files.filter(f => !f.isBinary).length} files selected
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    ~{(totalSelectedBytes / 1024).toFixed(1)} KB (~{estimatedTokens.toLocaleString()} tokens)
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={selectKeyFiles}
                    className="h-7 text-[11px]"
                  >
                    Select Key Files
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={selectAllFiltered}
                    className="h-7 text-[11px]"
                  >
                    Select All
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={clearSelection}
                    className="h-7 text-[11px] text-muted-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Project Structure View & Controls */}
          {repoInfo && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search in Project Structure */}
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search files in project structure..."
                    className="pl-8 h-8 text-xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* View Switcher & Expand/Collapse */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg shrink-0 text-xs">
                    <button
                      type="button"
                      onClick={() => setViewMode('tree')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        viewMode === 'tree' ? 'bg-background shadow-xs font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Tree View
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        viewMode === 'list' ? 'bg-background shadow-xs font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Flat List
                    </button>
                  </div>

                  {viewMode === 'tree' ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={expandAllFolders}
                        className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Expand All
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={collapseAllFolders}
                        className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Collapse All
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setCategoryFilter('all')}
                        className={`px-2 py-0.5 rounded text-[11px] ${categoryFilter === 'all' ? 'bg-background font-medium' : 'text-muted-foreground'}`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryFilter('key')}
                        className={`px-2 py-0.5 rounded text-[11px] ${categoryFilter === 'key' ? 'bg-background font-medium' : 'text-muted-foreground'}`}
                      >
                        Key
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryFilter('code')}
                        className={`px-2 py-0.5 rounded text-[11px] ${categoryFilter === 'code' ? 'bg-background font-medium' : 'text-muted-foreground'}`}
                      >
                        Code
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Project Structure Tree / List Container */}
              <div className="rounded-2xl border p-2 max-h-[38vh] overflow-y-auto bg-card">
                {viewMode === 'tree' ? (
                  filteredTreeNodes.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No files matching filter in project tree.
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredTreeNodes.map(node => renderTreeNode(node))}
                    </div>
                  )
                ) : (
                  <div className="divide-y">
                    {filteredFiles.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        No files matching filter.
                      </div>
                    ) : (
                      filteredFiles.map(file => {
                        const isSelected = selectedPaths.has(file.path)
                        return (
                          <div
                            key={file.path}
                            className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors ${
                              isSelected ? 'bg-primary/5' : ''
                            }`}
                          >
                            <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectFile(file.path)}
                                className="size-3.5 rounded-sm accent-primary cursor-pointer shrink-0"
                              />
                              {file.isImportant ? (
                                <FileText className="size-3.5 text-amber-500 shrink-0" />
                              ) : (
                                <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="truncate font-mono text-[11px]" title={file.path}>
                                {file.path}
                              </span>
                              {file.isImportant && (
                                <span className="px-1 py-0.2 rounded-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium shrink-0">
                                  Key
                                </span>
                              )}
                            </label>

                            <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                              <span>{(file.size / 1024).toFixed(1)} KB</span>
                              <button
                                type="button"
                                disabled={loadingPreview}
                                onClick={() => handlePreviewFile(file.path)}
                                className="text-muted-foreground hover:text-foreground hover:underline p-0.5"
                              >
                                Preview
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Inline Preview */}
          {previewFile && (
            <div className="rounded-2xl border p-4 bg-muted/10 space-y-2 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="size-4 text-primary" />
                  <span className="font-mono text-xs font-semibold">{previewFile.path}</span>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setPreviewFile(null)}
                  className="h-6 w-6 p-0"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <pre className="max-h-44 overflow-y-auto rounded-lg bg-background p-3 text-xs font-mono leading-relaxed border whitespace-pre">
                {previewFile.content.slice(0, 10000)}
                {previewFile.content.length > 10000 ? '\n... (preview truncated)' : ''}
              </pre>
            </div>
          )}

          {/* Sync & Target Configuration */}
          {repoInfo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border p-3 bg-muted/10 space-y-2">
                <span className="text-xs font-medium text-foreground block">Playground Target</span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importTargetSync"
                      checked={importTarget === 'new_chat'}
                      onChange={() => setImportTarget('new_chat')}
                      className="accent-primary"
                    />
                    <span>Start New Project Chat</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importTargetSync"
                      checked={importTarget === 'current_chat'}
                      onChange={() => setImportTarget('current_chat')}
                      className="accent-primary"
                    />
                    <span>Sync to Current Chat</span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border p-3 bg-muted/10 space-y-2">
                <span className="text-xs font-medium text-foreground block">Context Representation</span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importFormatSync"
                      checked={importFormat === 'prompt'}
                      onChange={() => setImportFormat('prompt')}
                      className="accent-primary"
                    />
                    <span>Formatted Project Tree & Code Blocks</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importFormatSync"
                      checked={importFormat === 'attachments'}
                      onChange={() => setImportFormat('attachments')}
                      className="accent-primary"
                    />
                    <span>Individual Composer File Attachments</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3.5 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {syncProgress ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Downloading file {syncProgress.current} of {syncProgress.total}…
              </span>
            ) : repoInfo ? (
              <span>Ready to import {selectedPaths.size} files</span>
            ) : (
              <span>Enter a repository URL to fetch its structure</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={syncing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!repoInfo || selectedPaths.size === 0 || syncing}
              onClick={handleSyncToPlayground}
              className="gap-2 font-medium"
            >
              {syncing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <FolderGit2 className="size-4" />
                  Load {selectedPaths.size > 0 ? `${selectedPaths.size} Files ` : ''}into Playground
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  )
}

export default ImportGithubProject
