"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Loader2, AlertCircle, Pencil, Check } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Editor } from "@/components/editor/Editor";
import { Toolbar } from "@/components/editor/Toolbar";
import { MarkdownToggle } from "@/components/editor/MarkdownToggle";
import { SaveConfirmationBar } from "@/components/editor/SaveConfirmationBar";
import { AIEditModal } from "@/components/editor/AIEditModal";
import { SaveConfirmModal, SAVE_CONFIRM_DISMISSED_KEY } from "@/components/editor/SaveConfirmModal";
import { CommentPopover } from "@/components/editor/CommentPopover";
import { LinkPopover } from "@/components/editor/LinkPopover";
import { LinkHoverPreview } from "@/components/editor/LinkHoverPreview";
import { RightPanel } from "@/components/editor/RightPanel";
import type { RightPanelView } from "@/components/editor/RightPanel";
import { CreatePRModal } from "@/components/pr/CreatePRModal";
import { ProposeDraftModal } from "@/components/pr/ProposeDraftModal";
import { useGitHubFile } from "@/hooks/useGitHubFile";
import { useEditorState } from "@/hooks/useEditorState";
import { useComments } from "@/hooks/useComments";
import { useImageUpload } from "@/hooks/useImageUpload";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { FrontmatterData } from "@/types";
import { useCollectionSchema } from "@/hooks/useCollectionSchema";
import { reanchorComments } from "@/lib/commentAnchoring";
import toast from "react-hot-toast";

// TipTap Editor instance reference type
interface TipTapEditorRef {
  chain: () => unknown;
  getHTML: () => string;
}

interface EditorPageClientProps {
  owner: string;
  repo: string;
  filePath: string;
  userId: string;
  requirePR: boolean;
  defaultBranch: string;
  imageStorageFolder: string;
  imageUrlPrefix: string;
}

interface DraftFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
}

export function EditorPageClient({
  owner,
  repo,
  filePath,
  userId,
  requirePR,
  defaultBranch,
  imageStorageFolder,
  imageUrlPrefix,
}: EditorPageClientProps) {
  // Draft branch resolution — when requirePR is true, every read/write goes
  // through the user's draft branch instead of the default branch.
  const [draftReady, setDraftReady] = useState(!requirePR);
  const [draftBranch, setDraftBranch] = useState<string | null>(null);
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([]);

  const refreshDraft = useCallback(async () => {
    try {
      const res = await fetch(`/api/github/${owner}/${repo}/draft`);
      const data = await res.json();
      if (res.ok) {
        setDraftBranch(data.branch ?? null);
        setDraftFiles(data.files ?? []);
      }
    } finally {
      setDraftReady(true);
    }
  }, [owner, repo]);

  useEffect(() => {
    if (requirePR) {
      refreshDraft();
    }
  }, [requirePR, refreshDraft]);

  const effectiveBranch = draftBranch ?? defaultBranch;

  const {
    loading,
    error,
    sha,
    branch,
    bodyHtml,
    rawMarkdown,
    frontmatterData,
    hasFrontmatter,
    setBodyHtml,
    setFrontmatterData,
    getCurrentRaw,
    reload,
  } = useGitHubFile({
    owner,
    repo,
    path: filePath,
    branch: draftReady ? effectiveBranch : undefined,
    imageStorageFolder,
    imageUrlPrefix,
  });

  // Editor mode: WYSIWYG or raw markdown
  const [mode, setMode] = useState<"wysiwyg" | "raw">("wysiwyg");
  const [rawDraft, setRawDraft] = useState("");
  const [currentHtml, setCurrentHtml] = useState(bodyHtml);
  const [currentFrontmatter, setCurrentFrontmatter] = useState<FrontmatterData>(frontmatterData);

  // Update local state when file loads. Use `sha` as the readiness signal
  // instead of `bodyHtml` — new files with only frontmatter have an empty
  // body, so bodyHtml is "" (falsy) and would block initialization forever.
  const initialized = useRef(false);
  if (!initialized.current && !loading && sha) {
    initialized.current = true;
    setCurrentHtml(bodyHtml);
    setCurrentFrontmatter(frontmatterData);
    setRawDraft(rawMarkdown);
  }

  // Comments — lifted for editor highlights and click-to-open
  const { comments: commentList, refresh: refreshComments, resolveComment, addReply } = useComments({ owner, repo, filePath, commitSha: sha ?? "" });
  const [mainEditorInstance, setMainEditorInstance] = useState<any>(null);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const commentRanges = useMemo(() => {
    const unresolved = commentList.filter((c) => !c.resolved);
    if (!mainEditorInstance || unresolved.length === 0) return [];
    try {
      return reanchorComments(
        unresolved.map((c) => ({ id: c.id, charStart: c.charStart, charEnd: c.charEnd, quotedText: c.quotedText })),
        mainEditorInstance.state.doc
      ).filter((r) => !r.orphaned);
    } catch {
      return unresolved.map((c) => ({ id: c.id, charStart: c.charStart, charEnd: c.charEnd, orphaned: false }));
    }
  }, [commentList, mainEditorInstance]);

  // Selection tracking for comments + AI
  const [selection, setSelection] = useState({ hasSelection: false, from: 0, to: 0, text: "" });
  const [showAIModal, setShowAIModal] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [showPRModal, setShowPRModal] = useState(false);
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>("none");
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [newlyAddedCommentId, setNewlyAddedCommentId] = useState<string | null>(null);

  const toggleRightPanel = useCallback((panel: "settings" | "comments") => {
    setRightPanelView((prev) => (prev === panel ? "none" : panel));
  }, []);

  const unresolvedCount = useMemo(
    () => commentList.filter((c) => !c.resolved).length,
    [commentList]
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Collection schema for typed frontmatter fields
  const { schema: collectionSchema, collectionLabel } = useCollectionSchema({
    owner,
    repo,
    filePath,
  });

  // Image upload
  const { uploadImage, uploading: imageUploading, firstUploadHint, dismissHint } = useImageUpload({
    owner,
    repo,
    contentPath: filePath,
  });

  // Editor ref for programmatic operations
  const editorRef = useRef<TipTapEditorRef | null>(null);

  const handleCommit = useCallback(
    async (content: string, message?: string) => {
      if (!sha) return null;

      const res = await fetch(`/api/github/${owner}/${repo}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          content,
          sha,
          branch,
          message,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.actionable ?? "Failed to save");
        return null;
      }

      // If the server routed the commit to a (possibly new) draft branch,
      // adopt it for future reads/writes.
      if (requirePR && data.branch && data.branch !== draftBranch) {
        setDraftBranch(data.branch);
      }

      if (requirePR) {
        refreshDraft();
      }

      // Reload to get new SHA (confirmation bar replaces toast)
      reload();
      return { sha: data.sha };
    },
    [sha, owner, repo, filePath, branch, reload, requirePR, draftBranch, refreshDraft]
  );

  const getCurrentContent = useCallback(() => {
    return getCurrentRaw();
  }, [getCurrentRaw]);

  const editorState = useEditorState({
    onCommit: handleCommit,
    getCurrentContent,
    originalContent: rawMarkdown,
  });

  // Handle WYSIWYG editor updates
  const handleEditorUpdate = useCallback(
    (html: string) => {
      setCurrentHtml(html);
      setBodyHtml(html);
      editorState.markUnsaved();
    },
    [setBodyHtml, editorState]
  );

  // Handle frontmatter changes
  const handleFrontmatterChange = useCallback(
    (data: FrontmatterData) => {
      setCurrentFrontmatter(data);
      setFrontmatterData(data);
      editorState.markUnsaved();
    },
    [setFrontmatterData, editorState]
  );

  // Toggle between WYSIWYG and raw markdown modes
  const handleModeToggle = async (newMode: "wysiwyg" | "raw") => {
    if (newMode === mode) return;

    if (newMode === "raw") {
      // Convert current HTML to markdown for raw editing
      const md = htmlToMarkdown(currentHtml);
      setRawDraft(md);
    } else {
      // Convert raw markdown back to HTML for WYSIWYG
      const html = await markdownToHtml(rawDraft);
      setCurrentHtml(html);
      setBodyHtml(html);
    }
    setMode(newMode);
  };

  // Selection change from TipTap
  const handleSelectionChange = useCallback(
    (hasSelection: boolean, from: number, to: number, text: string) => {
      setSelection({ hasSelection, from, to, text });
    },
    []
  );

  // Open AI edit with current selection (uses TipTap state, not window.getSelection)
  const handleAIEdit = useCallback(() => {
    if (!selection.hasSelection || !selection.text) return;
    setSelectedText(selection.text);
    setShowAIModal(true);
  }, [selection.hasSelection, selection.text]);

  // Accept AI suggestion — replace selected text in editor
  const handleAIAccept = useCallback(
    (newText: string) => {
      if (editorRef.current) {
        const editor = editorRef.current;
        (editor.chain() as { focus: () => { insertContent: (text: string) => { run: () => void } } })
          .focus()
          .insertContent(newText)
          .run();
      }
    },
    []
  );

  // Perform the actual commit after confirmation
  const executeSave = useCallback(async () => {
    await editorState.save();
  }, [editorState]);

  const handleSaveConfirmed = useCallback(
    async (dontShowAgain: boolean) => {
      setShowSaveConfirmModal(false);
      if (dontShowAgain) {
        localStorage.setItem(SAVE_CONFIRM_DISMISSED_KEY, "true");
      }
      await executeSave();
    },
    [executeSave]
  );

  // Save logic — show confirmation modal unless user has dismissed it
  const handleSave = useCallback(async () => {
    if (imageUploading) {
      toast("Image upload in progress — please wait", { icon: "\u23F3" });
      return;
    }
    if (requirePR) {
      // PR-required mode: every save lands on the draft branch (safe),
      // so we skip the "this commits directly to main" warning.
      await executeSave();
      return;
    }
    const dismissed =
      typeof window !== "undefined" &&
      localStorage.getItem(SAVE_CONFIRM_DISMISSED_KEY) === "true";
    if (dismissed) {
      await executeSave();
    } else {
      setShowSaveConfirmModal(true);
    }
  }, [imageUploading, executeSave, requirePR]);

  const handleProposeChanges = useCallback(() => {
    if (requirePR) {
      // Refresh the draft file list so the modal reflects the latest committed state
      refreshDraft();
    }
    setShowPRModal(true);
  }, [requirePR, refreshDraft]);

  // Confirmation bar state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationType, setConfirmationType] = useState<"save" | "pr">("save");
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissConfirmation = useCallback(() => {
    setShowConfirmation(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  // Track status transitions for confirmation bar
  const prevStatusRef = useRef(editorState.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = editorState.status;
    prevStatusRef.current = curr;

    if (prev !== curr) {
      if (curr === "saved") {
        setConfirmationType("save");
        setShowConfirmation(true);
      } else if (curr === "pr-open") {
        setConfirmationType("pr");
        setShowConfirmation(true);
      } else if (curr === "unsaved" && showConfirmation) {
        // User made a new edit while confirmation is showing — dismiss it
        dismissConfirmation();
      }
    }
  }, [editorState.status, showConfirmation, dismissConfirmation]);

  // Cmd+S / Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editorState.status === "unsaved" || editorState.status === "error") {
          handleSave();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editorState.status, handleSave]);

  if (loading || (requirePR && !draftReady)) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <Loader2 className="h-6 w-6 animate-spin text-fg-tertiary" />
        <span className="ml-2 text-fg-tertiary">Loading file...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface gap-4">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <div className="text-center">
          <p className="font-semibold text-fg">Unable to load file</p>
          <p className="text-fg-tertiary text-sm mt-1">{error}</p>
        </div>
        <button
          onClick={reload}
          className="px-4 py-2 bg-fg text-fg-inverted rounded-lg text-sm font-medium hover:bg-fg/90"
        >
          Try again
        </button>
      </div>
    );
  }

  const originalRaw = rawMarkdown;
  const currentRaw = getCurrentRaw();

  return (
    <AppShell
      repoOwner={owner}
      repoName={repo}
      filePath={filePath}
      saveStatus={editorState.status}
      prNumber={editorState.prNumber}
      prUrl={editorState.prUrl}
      onSave={handleSave}
      onProposeChanges={handleProposeChanges}
      effectiveBranch={branch}
      draftBranch={requirePR ? draftBranch : null}
    >
      <div className="h-full flex flex-col bg-surface">
        {/* Post-save confirmation bar */}
        <SaveConfirmationBar
          visible={showConfirmation}
          variant={confirmationType}
          branch={branch}
          owner={owner}
          repo={repo}
          filePath={filePath}
          prNumber={editorState.prNumber}
          prUrl={editorState.prUrl}
          isDraft={requirePR && !!draftBranch}
          pendingCount={requirePR ? draftFiles.length : undefined}
          onDismiss={dismissConfirmation}
        />

        {/* Title + toggle row */}
        <div className="flex items-center border-b border-border">
          <div className="flex-1 px-16 py-[6px] flex items-center gap-2 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  ref={titleInputRef}
                  type="text"
                  defaultValue={String(currentFrontmatter.title ?? "")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = titleInputRef.current?.value ?? "";
                      handleFrontmatterChange({ ...currentFrontmatter, title: val });
                      setEditingTitle(false);
                    } else if (e.key === "Escape") {
                      setEditingTitle(false);
                    }
                  }}
                  onBlur={() => {
                    const val = titleInputRef.current?.value ?? "";
                    if (val !== String(currentFrontmatter.title ?? "")) {
                      handleFrontmatterChange({ ...currentFrontmatter, title: val });
                    }
                    setEditingTitle(false);
                  }}
                  autoFocus
                  className="flex-1 min-w-0 text-lg font-semibold text-fg leading-snug bg-transparent border-b-2 border-accent focus:outline-none"
                />
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const val = titleInputRef.current?.value ?? "";
                    handleFrontmatterChange({ ...currentFrontmatter, title: val });
                    setEditingTitle(false);
                  }}
                  className="text-fg-tertiary hover:text-fg flex-shrink-0"
                  aria-label="Confirm title"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : currentFrontmatter.title ? (
              <div className="group/title flex items-center gap-2 min-w-0">
                <h1 className="text-lg font-semibold text-fg leading-snug truncate">
                  {String(currentFrontmatter.title)}
                </h1>
                <button
                  onClick={() => setEditingTitle(true)}
                  className="text-fg-tertiary hover:text-fg flex-shrink-0 opacity-0 group-hover/title:opacity-100 transition-opacity"
                  aria-label="Edit title"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="px-4 py-[6px] border-l border-border flex-shrink-0">
            <MarkdownToggle mode={mode} onToggle={handleModeToggle} />
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main editor */}
          <div className="flex-1 overflow-hidden relative">
            {mode === "wysiwyg" ? (
              <EditorWithToolbar
                initialHtml={currentHtml}
                onUpdate={handleEditorUpdate}
                onSelectionChange={handleSelectionChange}
                onAIEdit={handleAIEdit}
                hasSelection={selection.hasSelection}
                commentRanges={commentRanges}
                onCommentClick={(id) => { setHighlightedCommentId(id); setRightPanelView("comments"); }}
                onEditorReady={setMainEditorInstance}
                onImageUpload={uploadImage}
                onLinkPopoverOpenChange={setIsLinkPopoverOpen}
              />
            ) : (
              <div className="h-full overflow-y-auto">
                <div className="editor-body">
                  <textarea
                    value={rawDraft}
                    onChange={(e) => {
                      setRawDraft(e.target.value);
                      editorState.markUnsaved();
                    }}
                    className="w-full resize-none font-mono text-sm focus:outline-none bg-surface text-fg min-h-[calc(100vh-200px)]"
                    placeholder="Write markdown here..."
                    spellCheck={false}
                  />
                </div>
              </div>
            )}

            {/* First-upload hint */}
            {firstUploadHint && (
              <button
                onClick={dismissHint}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 bg-surface-secondary border border-border rounded-lg shadow-md text-xs text-fg-secondary hover:bg-bg-muted transition-colors"
              >
                <span>{firstUploadHint}</span>
                <span className="text-fg-tertiary">&times;</span>
              </button>
            )}

            {/* Floating comment popover — hidden when link popover is open */}
            {selection.hasSelection && mode === "wysiwyg" && !isLinkPopoverOpen && (
              <CommentPopover
                owner={owner}
                repo={repo}
                filePath={filePath}
                commitSha={sha ?? ""}
                charStart={selection.from}
                charEnd={selection.to}
                quotedText={selection.text}
                onCommentAdded={(commentId: string) => {
                  refreshComments();
                  setRightPanelView("comments");
                  setNewlyAddedCommentId(commentId);
                }}
              />
            )}
          </div>

          {/* Right panel: icon bar + settings/comments */}
          <RightPanel
            activePanel={rightPanelView}
            onToggle={toggleRightPanel}
            unresolvedCommentCount={unresolvedCount}
            hasFrontmatter={hasFrontmatter}
            frontmatterData={currentFrontmatter}
            onFrontmatterChange={handleFrontmatterChange}
            schema={collectionSchema}
            collectionLabel={collectionLabel}
            frontmatterLoading={loading}
            comments={commentList}
            onResolveComment={resolveComment}
            onReplyComment={addReply}
            onRefreshComments={refreshComments}
            highlightedCommentId={highlightedCommentId}
            newlyAddedCommentId={newlyAddedCommentId}
          />
        </div>
      </div>

      {/* Modals */}
      <SaveConfirmModal
        open={showSaveConfirmModal}
        onClose={() => setShowSaveConfirmModal(false)}
        onConfirm={handleSaveConfirmed}
        branch={branch ?? defaultBranch}
        repo={repo}
      />

      <AIEditModal
        open={showAIModal}
        onClose={() => setShowAIModal(false)}
        selectedText={selectedText}
        onAccept={handleAIAccept}
      />

      {requirePR ? (
        <ProposeDraftModal
          open={showPRModal}
          onClose={() => setShowPRModal(false)}
          owner={owner}
          repo={repo}
          baseBranch={defaultBranch}
          draftBranch={draftBranch}
          files={draftFiles}
          onSuccess={(prNumber, prUrl) => {
            editorState.setPROpen(prNumber, prUrl);
            // Intentionally keep `draftBranch` and `draftFiles` populated.
            // The branch still exists on GitHub until the PR is merged, and
            // the editor must keep reading from it — the file does not yet
            // exist on the base branch. The server-side DraftBranch DB record
            // was already cleared by the PR route, so a future edit will
            // transparently start a fresh draft branch via the commit route.
          }}
        />
      ) : (
        <CreatePRModal
          open={showPRModal}
          onClose={() => setShowPRModal(false)}
          owner={owner}
          repo={repo}
          filePath={filePath}
          baseBranch={branch}
          originalContent={originalRaw}
          newContent={currentRaw}
          onSuccess={(prNumber, prUrl) => {
            editorState.setPROpen(prNumber, prUrl);
          }}
        />
      )}
    </AppShell>
  );
}

// Sub-component that provides the editor ref to the Toolbar
function EditorWithToolbar({
  initialHtml,
  onUpdate,
  onSelectionChange,
  onAIEdit,
  hasSelection,
  commentRanges,
  onCommentClick,
  onEditorReady: onEditorReadyProp,
  onImageUpload,
  onLinkPopoverOpenChange,
}: {
  initialHtml: string;
  onUpdate: (html: string) => void;
  onSelectionChange: (has: boolean, from: number, to: number, text: string) => void;
  onAIEdit: () => void;
  hasSelection: boolean;
  commentRanges: Array<{ id: string; charStart: number; charEnd: number }>;
  onCommentClick: (id: string) => void;
  onEditorReady?: (editor: import("@tiptap/react").Editor | null) => void;
  onImageUpload?: (file: File, editor: import("@tiptap/react").Editor) => Promise<unknown>;
  onLinkPopoverOpenChange?: (isOpen: boolean) => void;
}) {
  const [editorInstance, setEditorInstance] = useState<import("@tiptap/react").Editor | null>(null);
  const handleEditorReady = useCallback((editor: import("@tiptap/react").Editor | null) => {
    setEditorInstance(editor);
    onEditorReadyProp?.(editor);
  }, [onEditorReadyProp]);

  const handleImageUpload = useCallback(() => {
    if (!editorInstance || !onImageUpload) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        onImageUpload(file, editorInstance);
      }
    };
    input.click();
  }, [editorInstance, onImageUpload]);

  // Notify parent when link popover opens/closes
  const onLinkPopoverOpenChangeRef = useRef(onLinkPopoverOpenChange);
  onLinkPopoverOpenChangeRef.current = onLinkPopoverOpenChange;

  // Link popover state
  const [linkPopover, setLinkPopover] = useState<{
    isOpen: boolean;
    initialUrl: string;
    initialText: string;
    isEditing: boolean;
    position: { top: number; left: number };
  }>({ isOpen: false, initialUrl: "", initialText: "", isEditing: false, position: { top: 0, left: 0 } });

  useEffect(() => {
    onLinkPopoverOpenChangeRef.current?.(linkPopover.isOpen);
  }, [linkPopover.isOpen]);

  const handleOpenLinkPopover = useCallback(() => {
    if (!editorInstance) return;
    const { from } = editorInstance.state.selection;
    const existingHref = editorInstance.getAttributes("link").href || "";
    const isEditing = editorInstance.isActive("link");
    let linkText = "";
    if (isEditing) {
      editorInstance.chain().focus().extendMarkRange("link").run();
      const { from: lf, to: lt } = editorInstance.state.selection;
      linkText = editorInstance.state.doc.textBetween(lf, lt, "");
    }
    const coords = editorInstance.view.coordsAtPos(from);
    const top = coords.bottom + 8;
    const left = Math.min(coords.left, window.innerWidth - 340);
    setLinkPopover({ isOpen: true, initialUrl: existingHref, initialText: linkText, isEditing, position: { top, left } });
  }, [editorInstance]);

  // Link hover preview state
  const [linkHover, setLinkHover] = useState<{
    isOpen: boolean;
    href: string;
    element: HTMLElement | null;
    position: { top: number; left: number };
  }>({ isOpen: false, href: "", element: null, position: { top: 0, left: 0 } });
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLinkHover = useCallback((href: string, rect: DOMRect, element: HTMLElement) => {
    if (linkPopover.isOpen) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const top = rect.bottom + 6;
    const left = Math.min(rect.left, window.innerWidth - 300);
    setLinkHover({ isOpen: true, href, element, position: { top, left } });
  }, [linkPopover.isOpen]);

  const handleLinkHoverLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setLinkHover(prev => ({ ...prev, isOpen: false }));
    }, 150);
  }, []);

  const handleLinkHoverEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleEditFromPreview = useCallback(() => {
    if (!editorInstance || !linkHover.element) return;
    const href = linkHover.href;
    const pos = linkHover.position;

    // Place cursor on the link and select its full range
    try {
      const domPos = editorInstance.view.posAtDOM(linkHover.element, 0);
      editorInstance.chain().focus().setTextSelection(domPos).extendMarkRange("link").run();
    } catch {
      // fallback: just focus
      editorInstance.commands.focus();
    }

    const { from, to } = editorInstance.state.selection;
    const linkText = editorInstance.state.doc.textBetween(from, to, "");

    setLinkHover(prev => ({ ...prev, isOpen: false }));
    setLinkPopover({ isOpen: true, initialUrl: href, initialText: linkText, isEditing: true, position: { top: pos.top, left: pos.left } });
  }, [editorInstance, linkHover]);

  const handleApplyLink = useCallback((url: string, text?: string) => {
    if (!editorInstance) return;
    if (text !== undefined && linkPopover.isEditing) {
      // Replace the link text and URL: selection should already cover the link range
      editorInstance.chain().focus().extendMarkRange("link").deleteSelection().insertContent({
        type: "text",
        text,
        marks: [{ type: "link", attrs: { href: url } }],
      }).run();
    } else {
      editorInstance.chain().focus().setLink({ href: url }).run();
    }
    setLinkPopover(prev => ({ ...prev, isOpen: false }));
  }, [editorInstance, linkPopover.isEditing]);

  const handleRemoveLink = useCallback(() => {
    if (!editorInstance) return;
    editorInstance.chain().focus().unsetLink().run();
    setLinkPopover(prev => ({ ...prev, isOpen: false }));
  }, [editorInstance]);

  const handleCloseLinkPopover = useCallback(() => {
    setLinkPopover(prev => ({ ...prev, isOpen: false }));
  }, []);

  // ⌘K keyboard shortcut to open link popover
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleOpenLinkPopover();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleOpenLinkPopover]);

  // Hover detection via DOM event delegation on the editor container
  const handleEditorMouseOver = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest(".editor-link") as HTMLAnchorElement | null;
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    const rect = target.getBoundingClientRect();
    handleLinkHover(href, rect, target);
  }, [handleLinkHover]);

  const handleEditorMouseOut = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest(".editor-link");
    const related = (e.relatedTarget as HTMLElement | null)?.closest?.(".editor-link");
    if (target && !related) {
      handleLinkHoverLeave();
    }
  }, [handleLinkHoverLeave]);

  return (
    <div className="h-full flex flex-col">
      <Toolbar
        editor={editorInstance}
        onAIEdit={onAIEdit}
        hasSelection={hasSelection && !linkPopover.isOpen}
        onImageUpload={handleImageUpload}
        onLinkClick={handleOpenLinkPopover}
      />
      <div
        className="flex-1 overflow-hidden"
        onMouseOver={handleEditorMouseOver}
        onMouseOut={handleEditorMouseOut}
      >
        <EditorWithRef
          initialHtml={initialHtml}
          onUpdate={onUpdate}
          onSelectionChange={onSelectionChange}
          onEditorReady={handleEditorReady}
          commentRanges={commentRanges}
          onCommentClick={onCommentClick}
          onImageUpload={onImageUpload}
        />
      </div>
      {linkHover.isOpen && !linkPopover.isOpen && (
        <LinkHoverPreview
          href={linkHover.href}
          position={linkHover.position}
          onEdit={handleEditFromPreview}
          onClose={() => setLinkHover(prev => ({ ...prev, isOpen: false }))}
          onMouseEnter={handleLinkHoverEnter}
          onMouseLeave={handleLinkHoverLeave}
        />
      )}
      {linkPopover.isOpen && (
        <LinkPopover
          initialUrl={linkPopover.initialUrl}
          initialText={linkPopover.initialText}
          isEditing={linkPopover.isEditing}
          position={linkPopover.position}
          onApply={handleApplyLink}
          onRemove={handleRemoveLink}
          onClose={handleCloseLinkPopover}
        />
      )}
    </div>
  );
}

// Editor wrapper that exposes the editor instance
function EditorWithRef({
  initialHtml,
  onUpdate,
  onSelectionChange,
  onEditorReady,
  commentRanges,
  onCommentClick,
  onImageUpload,
}: {
  initialHtml: string;
  onUpdate: (html: string) => void;
  onSelectionChange: (has: boolean, from: number, to: number, text: string) => void;
  onEditorReady: (editor: import("@tiptap/react").Editor | null) => void;
  commentRanges: Array<{ id: string; charStart: number; charEnd: number }>;
  onCommentClick: (id: string) => void;
  onImageUpload?: (file: File, editor: import("@tiptap/react").Editor) => Promise<unknown>;
}) {
  const { useEditor, EditorContent } = require("@tiptap/react");
  const StarterKit = require("@tiptap/starter-kit").default;
  const Link = require("@tiptap/extension-link").default;
  const Placeholder = require("@tiptap/extension-placeholder").default;
  const Table = require("@tiptap/extension-table").Table;
  const TableRow = require("@tiptap/extension-table-row").TableRow;
  const TableCell = require("@tiptap/extension-table-cell").TableCell;
  const TableHeader = require("@tiptap/extension-table-header").TableHeader;
  const Underline = require("@tiptap/extension-underline").default;
  const { CodeBlockLowlight } = require("@tiptap/extension-code-block-lowlight");
  const { EditorImage: TipTapImage } = require("@/components/editor/EditorImage");
  const { Extension } = require("@tiptap/core");
  const { Plugin, PluginKey } = require("prosemirror-state");
  const { Decoration, DecorationSet } = require("prosemirror-view");
  const { ImageUploadPlaceholder: PlaceholderNode } = require("@/components/editor/ImageUploadPlaceholder");

  // Lowlight instance — created once per component mount via ref
  const lowlightRef = useRef<any>(null);
  if (!lowlightRef.current) {
    const { createLowlight } = require("lowlight");
    const ll = createLowlight();
    ll.register("javascript", require("highlight.js/lib/languages/javascript"));
    ll.register("typescript", require("highlight.js/lib/languages/typescript"));
    ll.register("python", require("highlight.js/lib/languages/python"));
    ll.register("bash", require("highlight.js/lib/languages/bash"));
    ll.register("json", require("highlight.js/lib/languages/json"));
    ll.register("yaml", require("highlight.js/lib/languages/yaml"));
    ll.register("css", require("highlight.js/lib/languages/css"));
    lowlightRef.current = ll;
  }

  // Stable ref for image upload callback
  const onImageUploadRef = useRef<typeof onImageUpload>(onImageUpload);
  onImageUploadRef.current = onImageUpload;

  // Stable callback ref — always current, safe to read from plugin
  const onCommentClickRef = useRef<(id: string) => void>(onCommentClick);
  onCommentClickRef.current = onCommentClick;

  // Stable plugin key + plugin (created once via ref)
  const pluginKeyRef = useRef<any>(null);
  const pluginRef = useRef<any>(null);
  const extensionRef = useRef<any>(null);
  if (!pluginKeyRef.current) {
    pluginKeyRef.current = new PluginKey("commentHighlights");
    const key = pluginKeyRef.current;
    pluginRef.current = new Plugin({
      key,
      state: {
        init() { return []; },
        apply(tr: any, prev: any) {
          const meta = tr.getMeta(key);
          if (meta !== undefined) return meta;
          if (!tr.docChanged || prev.length === 0) return prev;
          return prev.map((r: any) => ({
            id: r.id,
            charStart: tr.mapping.map(r.charStart, 1),
            charEnd: tr.mapping.map(r.charEnd, -1),
          })).filter((r: any) => r.charEnd > r.charStart);
        },
      },
      props: {
        decorations(state: any) {
          const ranges: Array<{ id: string; charStart: number; charEnd: number }> = key.getState(state) || [];
          const maxPos = state.doc.content.size;
          const decos = ranges.flatMap((r) => {
            try {
              if (r.charStart >= maxPos || r.charEnd <= r.charStart) return [];
              return [Decoration.inline(r.charStart, Math.min(r.charEnd, maxPos), { class: "comment-highlight" })];
            } catch { return []; }
          });
          return DecorationSet.create(state.doc, decos);
        },
        handleClick(view: any, pos: number) {
          const ranges: Array<{ id: string; charStart: number; charEnd: number }> = key.getState(view.state) || [];
          const clicked = ranges.find((r) => pos >= r.charStart && pos < r.charEnd);
          if (clicked) {
            onCommentClickRef.current(clicked.id);
            return true;
          }
          return false;
        },
      },
    });
    extensionRef.current = Extension.create({
      name: "commentHighlights",
      addProseMirrorPlugins() { return [pluginRef.current]; },
    });
  }

  // Stable ref for the editor instance so drag/drop/paste handlers can access it
  const editorInstanceRef = useRef<import("@tiptap/react").Editor | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight: lowlightRef.current }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "editor-link" } }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      Table.configure({
        resizable: true,
        handleWidth: 5,
        cellMinWidth: 100,
        lastColumnResizable: true,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      TipTapImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "editor-image" },
      }),
      PlaceholderNode,
      extensionRef.current,
    ],
    content: initialHtml,
    onUpdate: ({ editor }: { editor: import("@tiptap/react").Editor }) => {
      onUpdate(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }: { editor: import("@tiptap/react").Editor }) => {
      const { from, to } = editor.state.selection;
      const text = from !== to ? editor.state.doc.textBetween(from, to, " ") : "";
      onSelectionChange(from !== to, from, to, text);
    },
    onCreate: ({ editor }: { editor: import("@tiptap/react").Editor }) => {
      editorInstanceRef.current = editor;
      onEditorReady(editor);
    },
    onDestroy: () => {
      editorInstanceRef.current = null;
      onEditorReady(null);
    },
    editorProps: {
      attributes: {
        class: "prose prose-gray dark:prose-invert max-w-none focus:outline-none",
      },
      handleDrop: (_view: unknown, event: DragEvent) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (!imageFile) return false;
        event.preventDefault();
        const ed = editorInstanceRef.current;
        if (ed && onImageUploadRef.current) {
          onImageUploadRef.current(imageFile, ed);
        }
        return true;
      },
      handlePaste: (_view: unknown, event: ClipboardEvent) => {
        // Image paste takes priority
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
          if (imageFile) {
            event.preventDefault();
            const ed = editorInstanceRef.current;
            if (ed && onImageUploadRef.current) {
              onImageUploadRef.current(imageFile, ed);
            }
            return true;
          }
        }
        // Convert backtick markdown syntax to code marks/blocks.
        // Checks text/plain regardless of whether text/html is also present,
        // so this works for both plain-text and rich-text (Notion) paste.
        const text = event.clipboardData?.getData("text/plain");
        if (text && /`/.test(text)) {
          event.preventDefault();
          const ed = editorInstanceRef.current;
          if (!ed) return true;
          const { DOMParser: PMDOMParser } = require("prosemirror-model");
          const html = text
            .split(/\n{2,}/)
            .map((block: string) => {
              const cbMatch = block.match(/^```([\w-]*)\n?([\s\S]*?)```$/);
              if (cbMatch) {
                const lang = cbMatch[1];
                const code = cbMatch[2].trim();
                return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${code}</code></pre>`;
              }
              const inline = block.replace(/`([^`\n]+)`/g, "<code>$1</code>");
              return `<p>${inline}</p>`;
            })
            .join("");
          const dom = document.createElement("div");
          dom.innerHTML = html;
          const slice = PMDOMParser.fromSchema(ed.view.state.schema).parseSlice(dom, {
            preserveWhitespace: true,
          });
          ed.view.dispatch(ed.view.state.tr.replaceSelection(slice));
          return true;
        }
        return false;
      },
    },
  });

  // Push updated comment ranges into the ProseMirror plugin
  useEffect(() => {
    if (!editor) return;
    try {
      editor.view.dispatch(
        editor.view.state.tr.setMeta(pluginKeyRef.current, commentRanges)
      );
    } catch { /* ignore if editor is destroyed */ }
  }, [editor, commentRanges]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const TableControls = require("@/components/editor/table/TableControls").TableControls;

  const handleGutterClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === scrollRef.current && editor) {
      editor.commands.focus("end");
    }
  }, [editor]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto relative" onClick={handleGutterClick}>
      <div className="editor-body">
        <EditorContent editor={editor} />
      </div>
      {editor && (
        <TableControls editor={editor} scrollContainerRef={scrollRef} />
      )}
    </div>
  );
}
