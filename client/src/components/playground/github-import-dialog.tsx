import { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  FileCode,
  FileText,
  FolderGit2,
  GitBranch,
  GitFork,
  KeyRound,
  Loader2,
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
  fetchGitHubFileContent,
  fetchGitHubRepoInfo,
  fetchGitHubTree,
  formatRepoContextPrompt,
  parseGitHubUrl,
  type GitHubFileItem,
  type GitHubRepoInfo,
} from '@/lib/github-import'
import type { Attachment } from '@/lib/attachments'

const SUGGESTED_REPOS = [
  'juniorhillory-creator/freellmapi',
  'expressjs/express',
  'pallets/flask',
  'tailwindlabs/tailwindcss',
]

export interface GitHubImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportToCurrent: (attachments: Attachment[], promptText?: string) => void
  onImportToNewConversation: (title: string, promptText: string, attachments: Attachment[]) => void
}

type FileFilterCategory = 'all' | 'key' | 'code' | 'selected'

export function GitHubImportDialog({
  open,
  onOpenChange,
  onImportToCurrent,
  onImportToNewConversation,
}: GitHubImportDialogProps) {
  const [repoInput, setRepoInput] = useState('')
  const [branchInput, setBranchInput] = useState('')
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('playground.githubToken') ?? '')
  const [showTokenField, setShowTokenField] = useState(false)

  const [loadingRepo, setLoadingRepo] = useState(false)
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null)
  const [files, setFiles] = useState<GitHubFileItem[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<FileFilterCategory>('all')

  // Import options
  const [importTarget, setImportTarget] = useState<'new_chat' | 'current_chat'>('new_chat')
  const [importMode, setImportMode] = useState<'prompt' | 'attachments'>('prompt')
  const [importingFiles, setImportingFiles] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)

  // Preview file modal
  const [previewFile, setPreviewFile] = useState<{ path: string; content: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const handleTokenChange = (val: string) => {
    setGithubToken(val)
    localStorage.setItem('playground.githubToken', val)
  }

  const handleFetchRepo = async (targetRepoInput?: string) => {
    const input = (targetRepoInput ?? repoInput).trim()
    if (!input) {
      toast.error('Please enter a GitHub repository URL or owner/repo shorthand.')
      return
    }

    const parsed = parseGitHubUrl(input)
    if (!parsed) {
      toast.error('Invalid GitHub URL or repository format. Use "owner/repo" or "https://github.com/owner/repo".')
      return
    }

    setLoadingRepo(true)
    setRepoInfo(null)
    setFiles([])
    setSelectedPaths(new Set())
    setPreviewFile(null)

    try {
      const repo = await fetchGitHubRepoInfo(parsed.owner, parsed.repo, githubToken)
      const targetBranch = parsed.branch || branchInput.trim() || repo.defaultBranch
      setBranchInput(targetBranch)
      setRepoInfo(repo)

      const treeFiles = await fetchGitHubTree(parsed.owner, parsed.repo, targetBranch, githubToken)
      setFiles(treeFiles)

      // Auto-select key / important files by default
      const initialSelected = new Set<string>()
      for (const f of treeFiles) {
        if (!f.isBinary && f.isImportant) {
          initialSelected.add(f.path)
        }
      }
      setSelectedPaths(initialSelected)
      toast.success(`Loaded "${repo.fullName}" (${treeFiles.length} files)`)
    } catch (err: any) {
      console.error('[github-import] error:', err)
      toast.error(err.message || 'Failed to load repository.')
    } finally {
      setLoadingRepo(false)
    }
  }

  // Filtered files list
  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return files.filter(f => {
      if (f.isBinary) return false // Filter out binary files from importable list
      if (q && !f.path.toLowerCase().includes(q)) return false
      if (filterCategory === 'key' && !f.isImportant) return false
      if (filterCategory === 'selected' && !selectedPaths.has(f.path)) return false
      if (filterCategory === 'code') {
        const ext = f.extension
        const isCodeExt = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'php', 'swift', 'kt'].includes(ext)
        if (!isCodeExt) return false
      }
      return true
    })
  }, [files, searchQuery, filterCategory, selectedPaths])

  // Stats
  const selectedCount = selectedPaths.size
  const selectedFiles = useMemo(() => files.filter(f => selectedPaths.has(f.path)), [files, selectedPaths])
  const totalSelectedBytes = useMemo(() => selectedFiles.reduce((acc, f) => acc + f.size, 0), [selectedFiles])
  const estimatedTokens = Math.ceil(totalSelectedBytes / 4)

  const toggleFile = (path: string) => {
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

  const selectAllFiltered = () => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      filteredFiles.forEach(f => next.add(f.path))
      return next
    })
  }

  const deselectAllFiltered = () => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      filteredFiles.forEach(f => next.delete(f.path))
      return next
    })
  }

  const selectKeyFilesOnly = () => {
    const next = new Set<string>()
    files.forEach(f => {
      if (!f.isBinary && f.isImportant) next.add(f.path)
    })
    setSelectedPaths(next)
  }

  const handlePreview = async (file: GitHubFileItem) => {
    if (!repoInfo) return
    setLoadingPreview(true)
    try {
      const content = await fetchGitHubFileContent(
        repoInfo.owner,
        repoInfo.name,
        branchInput || repoInfo.defaultBranch,
        file.path,
        githubToken,
      )
      setPreviewFile({ path: file.path, content })
    } catch (err: any) {
      toast.error(err.message || `Failed to load preview for ${file.path}`)
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleExecuteImport = async () => {
    if (!repoInfo) return
    if (selectedCount === 0) {
      toast.error('Please select at least one file to import.')
      return
    }

    setImportingFiles(true)
    setDownloadProgress({ current: 0, total: selectedCount })

    const branch = branchInput.trim() || repoInfo.defaultBranch
    const loadedFiles: Array<{ path: string; content: string }> = []
    const attachments: Attachment[] = []

    try {
      let done = 0
      for (const file of selectedFiles) {
        setDownloadProgress({ current: done + 1, total: selectedCount })
        const content = await fetchGitHubFileContent(
          repoInfo.owner,
          repoInfo.name,
          branch,
          file.path,
          githubToken,
        )
        loadedFiles.push({ path: file.path, content })

        attachments.push({
          id: `gh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: 'text',
          name: file.path,
          text: content,
        })
        done++
      }

      const allPaths = files.map(f => f.path)
      const promptText = formatRepoContextPrompt(repoInfo, branch, loadedFiles, allPaths)

      if (importTarget === 'new_chat') {
        const title = `GitHub: ${repoInfo.name}`
        onImportToNewConversation(
          title,
          importMode === 'prompt' ? promptText : `Imported ${loadedFiles.length} files from ${repoInfo.fullName}`,
          importMode === 'attachments' ? attachments : [],
        )
        toast.success(`Created project conversation for "${repoInfo.fullName}" with ${loadedFiles.length} files.`)
      } else {
        if (importMode === 'prompt') {
          onImportToCurrent([], promptText)
        } else {
          onImportToCurrent(attachments, undefined)
        }
        toast.success(`Imported ${loadedFiles.length} files into current chat.`)
      }

      onOpenChange(false)
    } catch (err: any) {
      console.error('[github-import] fetch error:', err)
      toast.error(err.message || 'Error importing files from GitHub.')
    } finally {
      setImportingFiles(false)
      setDownloadProgress(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-4xl" className="p-0 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
              <FolderGit2 className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold leading-none">
                Import GitHub Project
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Fetch repositories and stage source files as context in Playground
              </p>
            </div>
          </div>
          <DialogClose className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="size-4" />
          </DialogClose>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Top Search & Branch input */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={repoInput}
                  onChange={e => setRepoInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleFetchRepo()
                    }
                  }}
                  placeholder="e.g. owner/repo or https://github.com/owner/repo"
                  className="pl-9 pr-8 h-10 text-sm"
                  disabled={loadingRepo || importingFiles}
                />
                {repoInput && (
                  <button
                    type="button"
                    onClick={() => setRepoInput('')}
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
                    value={branchInput}
                    onChange={e => setBranchInput(e.target.value)}
                    placeholder="main"
                    className="pl-8 h-10 text-sm font-mono"
                    disabled={loadingRepo || importingFiles}
                  />
                </div>
              </div>

              <Button
                onClick={() => handleFetchRepo()}
                disabled={loadingRepo || !repoInput.trim() || importingFiles}
                className="h-10 px-5 gap-2 shrink-0 font-medium"
              >
                {loadingRepo ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Fetching…
                  </>
                ) : (
                  <>
                    <FolderGit2 className="size-4" />
                    Load Repo
                  </>
                )}
              </Button>
            </div>

            {/* Quick suggested repositories chips */}
            {!repoInfo && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground pt-0.5">
                <span className="font-medium text-foreground/80">Try popular:</span>
                {SUGGESTED_REPOS.map(slug => (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => {
                      setRepoInput(slug)
                      handleFetchRepo(slug)
                    }}
                    className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted text-foreground/90 font-mono text-[11px] transition-colors"
                  >
                    {slug}
                  </button>
                ))}
              </div>
            )}

            {/* Token accordion / options toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowTokenField(prev => !prev)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <KeyRound className="size-3.5" />
                <span>GitHub Personal Access Token (for private repos & rate limits)</span>
                {showTokenField ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              </button>
              {showTokenField && (
                <div className="mt-2 pl-4 border-l border-border/60">
                  <Input
                    type="password"
                    value={githubToken}
                    onChange={e => handleTokenChange(e.target.value)}
                    placeholder="ghp_... or github_pat_..."
                    className="h-8 text-xs font-mono max-w-md"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Token is stored locally in your browser. Read-only repo access is sufficient.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Repo Details Header & Stats */}
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
                      title="View on GitHub"
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

              {/* Selection Summary and Filters */}
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {selectedCount} files selected
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
                    onClick={selectKeyFilesOnly}
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
                    onClick={deselectAllFiltered}
                    className="h-7 text-[11px] text-muted-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Files List Table */}
          {repoInfo && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Search in files */}
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filter files by name or path..."
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

                {/* Categories */}
                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterCategory('all')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${filterCategory === 'all' ? 'bg-background shadow-xs font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    All ({files.filter(f => !f.isBinary).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterCategory('key')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${filterCategory === 'key' ? 'bg-background shadow-xs font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Key Files ({files.filter(f => !f.isBinary && f.isImportant).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterCategory('code')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${filterCategory === 'code' ? 'bg-background shadow-xs font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterCategory('selected')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${filterCategory === 'selected' ? 'bg-background shadow-xs font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Selected ({selectedCount})
                  </button>
                </div>
              </div>

              {/* File list box */}
              <div className="rounded-2xl border divide-y overflow-hidden max-h-[36vh] overflow-y-auto bg-card">
                {filteredFiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No files match current filter criteria.
                  </div>
                ) : (
                  filteredFiles.map(file => {
                    const isSelected = selectedPaths.has(file.path)
                    return (
                      <div
                        key={file.path}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2 text-xs hover:bg-muted/40 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                      >
                        <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFile(file.path)}
                            className="size-3.5 rounded-sm accent-primary cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            {file.isImportant ? (
                              <FileText className="size-3.5 shrink-0 text-amber-500" />
                            ) : (
                              <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate font-mono text-[11px]" title={file.path}>
                              {file.path}
                            </span>
                            {file.isImportant && (
                              <span className="shrink-0 px-1 py-0.2 rounded-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
                                Key
                              </span>
                            )}
                          </div>
                        </label>

                        <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          <span>{(file.size / 1024).toFixed(1)} KB</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={loadingPreview}
                            onClick={() => handlePreview(file)}
                            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            Preview
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* Inline File Preview if open */}
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
              <pre className="max-h-48 overflow-y-auto rounded-lg bg-background p-3 text-xs font-mono leading-relaxed border whitespace-pre">
                {previewFile.content.slice(0, 10000)}
                {previewFile.content.length > 10000 ? '\n... (preview truncated)' : ''}
              </pre>
            </div>
          )}

          {/* Import Destination & Mode Configuration */}
          {repoInfo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border p-3 bg-muted/10 space-y-2">
                <span className="text-xs font-medium text-foreground block">Destination</span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importTarget"
                      checked={importTarget === 'new_chat'}
                      onChange={() => setImportTarget('new_chat')}
                      className="accent-primary"
                    />
                    <span>Start New Project Chat</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importTarget"
                      checked={importTarget === 'current_chat'}
                      onChange={() => setImportTarget('current_chat')}
                      className="accent-primary"
                    />
                    <span>Add to Current Chat</span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border p-3 bg-muted/10 space-y-2">
                <span className="text-xs font-medium text-foreground block">Context Format</span>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'prompt'}
                      onChange={() => setImportMode('prompt')}
                      className="accent-primary"
                    />
                    <span>Formatted Architecture & Code Prompt</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'attachments'}
                      onChange={() => setImportMode('attachments')}
                      className="accent-primary"
                    />
                    <span>Individual Attached Project Files</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-3.5 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {downloadProgress ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Downloading file {downloadProgress.current} of {downloadProgress.total}…
              </span>
            ) : repoInfo ? (
              <span>Ready to import {selectedCount} file{selectedCount === 1 ? '' : 's'}</span>
            ) : (
              <span>Enter a repository to get started</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={importingFiles}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!repoInfo || selectedCount === 0 || importingFiles}
              onClick={handleExecuteImport}
              className="gap-2 font-medium"
            >
              {importingFiles ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <FolderGit2 className="size-4" />
                  Import to Playground
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  )
}
