import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
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
  RefreshCw,
  Search,
  Star,
  X,
} from 'lucide-react'
import { Dialog, DialogClose, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
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
import type { Attachment } from '@/lib/attachments'

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

  // Real-time URL validation state
  const validationResult = useMemo(() => {
    if (!repoUrl.trim()) return null
    return validateGitHubRepoUrl(repoUrl)
  }, [repoUrl])

  const handleTokenChange = (val: string) => {
    setToken(val)
    localStorage.setItem('playground.githubToken', val)
  }

  // Fetch Project Structure from GitHub
  const handleFetchProjectStructure = async (targetUrl?: string) => {
    const input = (targetUrl ?? repoUrl).trim()
    const validation = validateGitHubRepoUrl(input)
    if (!validation.valid || !validation.parsed) {
      toast.error(validation.error || 'Please enter a valid GitHub repository URL.')
      return
    }

    setFetching(true)
    setRepoInfo(null)
    setFiles([])
    setSelectedPaths(new Set())
    setPreviewFile(null)

    try {
      const { owner, repo, branch: parsedBranch } = validation.parsed
      const info = await fetchGitHubRepoInfo(owner, repo, token)
      const targetBranch = parsedBranch || branch.trim() || info.defaultBranch
      setBranch(targetBranch)
      setRepoInfo(info)

      const tree = await fetchGitHubTree(owner, repo, targetBranch, token)
      setFiles(tree)

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
      toast.success(`Successfully fetched project structure for ${info.fullName} (${tree.length} files)`)
    } catch (err: any) {
      console.error('[ImportGithubProject] Fetch error:', err)
      toast.error(err.message || 'Failed to fetch repository structure.')
    } finally {
      setFetching(false)
    }
  }

  // Build Hierarchical Tree Structure
  const treeNodes = useMemo(() => {
    const textFiles = files.filter(f => !f.isBinary)
    return buildFileTree(textFiles)
  }, [files])

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
    walk(treeNodes)
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

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    if (node.type === 'folder') {
      const isExpanded = expandedFolders.has(node.path)
      const childCount = node.children?.length ?? 0
      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => toggleFolder(node.path)}
            className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-muted/50 cursor-pointer text-xs transition-colors"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="size-4 text-amber-500 shrink-0" />
            ) : (
              <Folder className="size-4 text-amber-500 shrink-0" />
            )}
            <span className="font-medium text-foreground truncate">{node.name}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">({childCount})</span>
          </div>

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
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
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
        <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/20">
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
          <DialogClose className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="size-4" />
          </DialogClose>
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

              {/* Token toggle */}
              <button
                type="button"
                onClick={() => setShowTokenSettings(prev => !prev)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                <KeyRound className="size-3" />
                <span>Access Token</span>
                {showTokenSettings ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              </button>
            </div>

            {/* Access token input */}
            {showTokenSettings && (
              <div className="p-3 rounded-xl border bg-muted/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">GitHub Personal Access Token (PAT)</span>
                  <span className="text-[11px] text-muted-foreground">Optional · for private repos</span>
                </div>
                <Input
                  type="password"
                  value={token}
                  onChange={e => handleTokenChange(e.target.value)}
                  placeholder="ghp_... or github_pat_..."
                  className="h-8 text-xs font-mono"
                />
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
                  treeNodes.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No files found in project.
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {treeNodes.map(node => renderTreeNode(node))}
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
                  Sync to Playground
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
