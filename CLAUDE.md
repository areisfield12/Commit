# CLAUDE.md — MDocs

This file is instructions for Claude Code. Read it fully before making any changes.

---

## What we're building

MDocs is a collaborative markdown editor that connects to GitHub. The north star UX is:

> A non-technical person (marketer, content writer) opens a link, navigates a familiar folder sidebar to find their blog posts, clicks one, edits it in a friendly WYSIWYG editor, hits Save, and a GitHub PR is created automatically — without ever seeing a raw file path, branch name, or git command.

Think: Webflow CMS or Contentful, but the files actually live in the GitHub repo. No sync. No separate CMS database. GitHub is always the source of truth.

The navigation model is **Webflow CMS / Finder hybrid**: a Miller columns browser (horizontal cascading columns) lets users drill into folders left-to-right. When a folder contains only files, the rightmost column expands into a full row-based file list with Title, Status, Date, Author, and Modified columns. Files are shown by their frontmatter title, not their filename. A breadcrumb bar tracks the current path. The left sidebar shows global nav (Starred, Settings) and a REPOSITORIES section — there is no separate dashboard page.

---

## Primary use case (build for this first)

**Content teams on code-based websites.**

Engineers have built the marketing site in Next.js, Astro, or Remix. Blog posts, how-to guides, case studies, and changelog entries live as `.md` or `.mdx` files in the repo (commonly in `/content/`, `/posts/`, `/blog/`, or similar). The content team needs to edit these files regularly but cannot use GitHub's editor or VS Code.

MDocs solves this by giving them a CMS-like interface that reads and writes directly to the repo.

---

## Secondary use case (also important, do not neglect)

**AI-native teams managing agent configs and GTM docs.**

`CLAUDE.md` files, `cursor_rules`, brand style guides, sales playbooks, and persona definitions that live in GitHub repos. These users are more technical but still benefit from collaboration features, inline comments, and PR workflows.

---

## Current state of the app (as of March 2026)

### Infrastructure

- **Deployed to Vercel** at `usecommit.co` (the `m-docs-omega.vercel.app` Vercel default domain redirects to apex)
- `NEXTAUTH_URL` is set to `https://usecommit.co`
- `postinstall` script runs `prisma generate` on every Vercel build (ensures client is generated before app starts)
- **Database migrations**: use `db push` (not `migrate dev`) for schema changes in this project

### Architecture overview

- **Auth**: Hybrid NextAuth GitHub OAuth + GitHub App. JWT session stores `id`, `githubLogin`, `githubId`, `avatarUrl`. All GitHub API read/write calls on repo content use the GitHub App installation token via `getOctokitForRepo(owner)` in `src/lib/github-app.ts` — never the user's OAuth token. The user's OAuth token (in the `Account` table) is read **only** to call `apps.listInstallationsForAuthenticatedUser` in `src/app/api/github/repos/route.ts`, since that's the one operation that requires user context (it returns installs across personal + org accounts the user belongs to).
- **Editor**: TipTap v3.20.0 with StarterKit, Underline, Link, Placeholder, Table, CodeBlockLowlight, CharacterCount (installed but unused)
- **Markdown pipeline**: `gray-matter` strips frontmatter on load → TipTap gets HTML only → `matter.stringify()` re-prepends YAML on save. Lives in `src/lib/markdown.ts`.
- **Save state**: Managed in `src/hooks/useEditorState.ts` with states: `clean → unsaved → saving → saved → clean` (also `error` and `pr-open`)
- **PR-required draft branches**: When `RepoSettings.requirePR` is `true` (now the default), every write — folder creation, file creation, edit, image upload — is silently routed to a per-user draft branch via `getOrCreateDraftBranch` in `src/lib/github-app.ts`. The branch name is `commit/{githubLogin}/draft-{shortId}`, recorded in the `DraftBranch` table (unique on `userId + owner + repo`). Clicking "Propose changes" opens a single PR from that branch to the default branch via `/api/github/[owner]/[repo]/pr` with `mode: "draft"`, then clears the DB record so the next edit starts fresh. The helper also self-heals: if the branch was deleted on GitHub or already has an open PR, the row is dropped and a new branch is created.
- **GitHub error handling**: All `/api/github/*` route handlers funnel caught errors through `githubErrorResponse(error, context)` in `src/lib/utils.ts`. The helper `console.error`s the raw error with route context (so Vercel function logs capture the upstream message + status), then returns the friendly JSON with the *upstream* HTTP status code (404, 403, 422, 429, …) rather than always 500.
- **Frontmatter panel**: Three-file architecture in `src/components/editor/`: `FrontmatterPanel.tsx` (right sidebar wrapper, routes schema vs no-schema), `FrontmatterEditor.tsx` (no-schema fallback with auto-detected field types), `FrontmatterFields.tsx` (shared field components: TextInput, AutoResizeTextInput, DateInput, TagsInput, ToggleInput, SelectInput, plus type coercion helpers and `detectFieldType`). All field components use design system tokens from `src/styles/tokens.css` — never hardcoded Tailwind color classes like `violet-*`.
- **Navigation**: Miller columns browser replaced the old sidebar folder tree. Left sidebar shows global nav + repo list (no separate dashboard page). `src/app/repos/[owner]/[repo]/RepoBrowserClient.tsx` renders the Miller columns layout.
- **Design system**: `src/styles/tokens.css` and `design-system.md` define color system, type scale (Geist + DM Sans + Geist Mono), spacing, border radius, shadow, and animation tokens.
- **Logo**: `src/components/Logo.tsx` — canonical `<Logo>` component (inline SVG, dark/light auto-switching via `next-themes`). Props: `variant="lockup"|"icon"`, `theme="light"|"dark"|"auto"`, `size`. SVG assets in `public/images/logo/`. Favicons and `site.webmanifest` in `public/`. Full docs in `design-system.md` → "Logo & Brand Assets". Do not render logo via `<img>` — always use this component.
- **Key files**: `src/lib/github-app.ts`, `src/lib/auth.ts`, `src/lib/markdown.ts`, `src/hooks/useEditorState.ts`, `src/components/editor/`, `src/app/repos/[owner]/[repo]/RepoBrowserClient.tsx`, `src/components/Logo.tsx`

### What is working

- GitHub OAuth sign-in via NextAuth + GitHub App installation flow
- **Miller columns navigation** — Webflow/Finder-style horizontal column browser replaced the old sidebar folder tree. Each folder click opens a new column to the right. When a folder contains only files, the rightmost column expands into a full file list view. Breadcrumb bar tracks current path.
- **Integrated sidebar** — left sidebar shows global nav (Starred, Settings) + REPOSITORIES section listing all connected repos with branch and last-updated metadata. Clicking a repo loads its folder tree in the Miller columns area. The old separate dashboard page with repo card grid is gone — the repo list IS the dashboard.
- **File list view** — row-based CMS-style list with Title, Published/Draft status pills, formatted dates, author names, relative modified timestamps, search, and "+ New file" button. Empty author shows em dash fallback.
- **New file creation flow** — "+ New file" opens a modal with title input, live slug preview (date-prefixed, e.g. `2026-03-07-my-title.md`), and creates the file in GitHub via `POST /api/github/[owner]/[repo]/new-file` with pre-populated frontmatter template. On success shows "File created · view on GitHub" toast and navigates directly to editor.
- **Schema-driven frontmatter panel** — right sidebar with typed fields: title (auto-resizing textarea), date (date picker, timezone-safe display), author (text input), tags (pill input with add/remove), published (toggle showing Published/Draft), description (textarea). All fields sync in real time. Falls back to auto-detected field types when no schema exists.
- **Document title display** — frontmatter title displays as a prominent read-only label between the topbar and formatting toolbar, always visible while editing.
- **Save flow UX** — four-state Save button (Saved/unsaved/saving/saved). Post-save confirmation bar slides in below topbar: "Saved · Committed to main · just now · view on GitHub" in green, auto-dismisses after 4 seconds. Cmd+S keyboard shortcut wired.
- **Save confirmation modal** — modal intercepts direct commits and asks the user to confirm before saving. Includes a "Don't show again" checkbox. Dismissal state persisted to `localStorage` under key `"mdocs-save-confirmation-dismissed"`.
- **GitHub file link** — subtle ExternalLink icon next to file path in editor topbar, opens raw file on github.com in new tab.
- **Clickable breadcrumbs** — breadcrumb segments in editor topbar are clickable and navigate back to the correct Miller columns folder level. Replaced the standalone back button. Unsaved changes guard fires on navigation away.
- **Hover and cursor states** — global `cursor:pointer` and smooth 100ms transitions applied to all interactive elements. Hover backgrounds use `rgba` values for visibility in both light and dark mode.
- **Design system** — `tokens.css` and `design-system.md` with full color system, type scale, spacing system, border radius, shadow, animation tokens, and component language.
- **Landing page** — redesigned with new messaging strategy. Hero, two-column problem section, three feature blocks, two use case cards, CTA footer.
- TipTap WYSIWYG editor loading file content from GitHub, with markdown toggle (WYSIWYG ↔ raw via Turndown + remark)
- Direct commit save flow (`POST /api/github/[owner]/[repo]/commit`)
- PR creation flow: creates branch `mdocs/{username}/{filename}` → commits → opens PR → requests reviewers (`POST /api/github/[owner]/[repo]/pr`)
- **PR workflow banner** — post-PR confirmation shown as a persistent banner; duplicate toast removed to avoid double feedback.
- AI inline editing via Claude Sonnet streaming (`POST /api/ai/edit`)
- AI PR description generation (`POST /api/ai/pr-description`)
- Inline comments: create, list, resolve, reply, delete — all working end to end
- **Comments numeric badge** — comment count shown as a numeric badge (e.g. "3") instead of a dot indicator.
- File starring
- **Repo settings page** — full settings UI with: default branch selection, PR-required toggle, protected branches list, image storage folder path, image URL prefix, organize-by-folder toggle. Advanced options in a disclosure section.
- **Settings nav sidebar** — anchor-link sidebar with `IntersectionObserver`-powered active state highlighting the current section as the user scrolls.
- **Default repository setting** — global user preference for a default repo, persisted to `User.defaultRepo` in the database via `GET/PATCH /api/settings/user`.
- **Connect repo button** — redirects users to the GitHub App installation URL to add a new repository.
- **Image upload and insertion** — drag-and-drop onto editor canvas, toolbar button, and clipboard paste all trigger the upload flow. Image is committed to the repo (configurable storage path via repo settings), and `![alt text](url)` is inserted at cursor. Filename is sanitized and timestamp-prefixed. Supported formats: jpg, jpeg, png, gif, webp. API route: `POST /api/github/[owner]/[repo]/upload-image`.
- **Link popover** — inline link insert/edit/remove popover replaces the browser `prompt()`. Appears on link selection or toolbar button click. Fields: URL + optional display text. Remove link button included.
- **Table hover controls** — unified hover zone fix so table row/column insert and delete controls appear correctly without z-index or hit-target issues.
- **Inline code rendering fix** — Tailwind prose `code::before` / `code::after` override applied so backtick characters do not render around inline code in the editor.
- **Frontmatter date serialization fix** — dates save as `YYYY-MM-DD` format, not ISO 8601 timestamps, to match standard frontmatter conventions.
- **Tags serialization fix** — tags save in YAML inline array format (e.g. `[tag1, tag2]`) rather than block list style.
- **PR-required draft branch workflow** — when `RepoSettings.requirePR=true` (default), `new-file`, `commit`, and `upload-image` all transparently route writes to a per-user draft branch instead of failing against branch protection on the default branch. The repo browser shows a sticky banner "N pending changes on your draft branch — not yet merged into `main`" with a Propose / Discard pair. The editor shows a persistent `Draft · {branch}` pill in the header, reads file content from the draft branch when one exists, and re-enables the Save button in PR mode (saves commit to the draft branch). `ProposeDraftModal` (`src/components/pr/ProposeDraftModal.tsx`) opens the PR from the existing draft branch — no per-file content needed. After PR opens, the editor keeps reading from the draft branch (it still exists on GitHub until the PR merges); the next *new* edit transparently starts a fresh draft via `getOrCreateDraftBranch`.

### Known bugs — fix these before building new features

| Issue | Location | Fix |
|---|---|---|
| ~~AI text insertion uses deprecated `document.execCommand("insertText")`~~ | ~~`EditorPageClient.tsx:200-209`~~ | ~~Fixed — now uses `editor.chain().focus().insertContent()`~~ |
| `EditorWithRef` duplicates editor config using `require()` calls, missing CodeBlockLowlight | Line 433 | Refactor to share single editor config, add CodeBlockLowlight to this instance |
| Selection uses `window.getSelection()` instead of TipTap state | `EditorPageClient.tsx` | Use `editor.state.selection` instead |
| ~~No Cmd+S keyboard shortcut~~ | ~~Editor~~ | ~~Fixed — `useEffect` keydown listener calls save handler~~ |
| "Unsaved changes" shows on newly created files before any edits | Editor | New files should start in `clean` state after creation |

### Not yet built (priority order)

1. ~~Content collections + Webflow-style sidebar navigation~~ — **Done.**
2. ~~Schema-driven frontmatter editor~~ — **Done.**
3. ~~New post creation flow~~ — **Done.**
4. ~~Image upload and insertion~~ — **Done.**
5. Paste from Google Docs / Notion (verify clean paste behavior — may need custom paste handler)
6. Slash commands (`/` menu for inserting blocks)
7. Word count display
8. Find and replace
9. Autosave (debounced background save)
10. Table editing improvements (merge cells, column resize)
11. Heading anchors / document outline sidebar
12. Shareable draft preview link
13. Real-time multiplayer (Yjs) — deprioritized, build last
14. Folder cache / lazy loading — deferred

### Existing API routes (do not duplicate)

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth handler |
| `/api/github/repos` | GET | List repos where App is installed |
| `/api/github/[owner]/[repo]/files` | GET | List markdown files (recursive tree) |
| `/api/github/[owner]/[repo]/file` | GET | Get single file content + last commit |
| `/api/github/[owner]/[repo]/new-file` | POST | Create new file with pre-populated frontmatter |
| `/api/github/[owner]/[repo]/commit` | POST | Direct commit to branch |
| `/api/github/[owner]/[repo]/pr` | POST | Create PR. Two modes: legacy single-file (pass `path`, `content`, `sha` — creates a branch + commit + PR) or draft mode (pass `mode: "draft"` — opens PR from the caller's existing draft branch and clears the DB record on success). |
| `/api/github/[owner]/[repo]/draft` | GET/DELETE | GET returns the user's current draft state `{ branch, baseBranch, files[] }` (via `compareCommitsWithBasehead`); DELETE wipes the branch on GitHub and the DB record (Discard button). Self-heals if the branch was deleted manually. |
| `/api/github/[owner]/[repo]/prs` | GET | List MDocs-created PRs |
| `/api/github/[owner]/[repo]/collaborators` | GET | List repo collaborators |
| `/api/github/[owner]/[repo]/upload-image` | POST | Commit image file to repo, return URL |
| `/api/comments` | GET/POST | List/create comments |
| `/api/comments/[commentId]` | PATCH/DELETE | Resolve/delete comments |
| `/api/comments/[commentId]/replies` | POST | Add reply |
| `/api/ai/edit` | POST | AI inline editing (streaming) |
| `/api/ai/pr-description` | POST | AI PR title/body from diff |
| `/api/settings/repo` | POST | Upsert repo settings |
| `/api/settings/user` | GET/PATCH | Get/update user preferences (defaultRepo) |
| `/api/stars` | GET/POST/DELETE | Star/unstar files |
| `/api/collections` | GET/POST | List/create collections |
| `/api/collections/[id]` | PATCH/DELETE | Update/delete a collection |
| `/api/github/[owner]/[repo]/tree` | GET | Folder tree (folders only, nested) |
| `/api/github/[owner]/[repo]/collection` | GET | List files in a folder with parsed frontmatter |

### Existing Prisma models (additive changes only)

`Account`, `Session`, `VerificationToken`, `User`, `Comment`, `Reply`, `Suggestion` (DB only — no API routes or UI yet), `StarredFile`, `RepoSettings`, `Collection`, `DraftBranch`

**Notable fields added (do not re-add):**
- `User.defaultRepo String?` — stores the user's preferred default repository
- `RepoSettings.imageStorageFolder String?` — folder path where uploaded images are committed (e.g. `public/images`)
- `RepoSettings.imageUrlPrefix String?` — URL prefix prepended to committed image filenames (e.g. `/images`)
- `RepoSettings.organizeByFolder Boolean` — whether to organize uploaded images into subfolders by date/slug
- `RepoSettings.requirePR Boolean` — **default is `true`**. Gates the draft branch workflow described above. Server-side fallback when no row exists is also `true`.
- `DraftBranch` — one row per (`userId`, `repoOwner`, `repoName`); stores `branch` + `baseBranch` so the user's active draft survives across sessions until a PR opens or the branch is discarded.

### Key dependencies

| Package | Version |
|---|---|
| next | ^16.1.6 |
| react | ^19.2.4 |
| next-auth | ^4.24.13 |
| @tiptap/* | ^3.20.0 |
| octokit | ^5.0.5 |
| @prisma/client | ^6.19.2 |
| @anthropic-ai/sdk | ^0.78.0 |
| gray-matter | ^4.0.3 |
| turndown | ^7.2.2 |
| tailwindcss | ^4.2.1 |
| zod | ^4.3.6 |

---

## What to build next — detailed specs

### ~~1. Content Collections & Sidebar Navigation~~ — SHIPPED

Miller columns navigation, integrated sidebar with repo list, file list view with status/date/author columns, clickable breadcrumbs. See "What is working" above.

---

### ~~2. Frontmatter Editor~~ — SHIPPED

Schema-driven right sidebar panel with typed fields. Falls back to auto-detected field types. See "What is working" above.

---

### ~~3. New Post Creation Flow~~ — SHIPPED

"+ New file" modal with title input, live slug preview, date-prefixed filename, pre-populated frontmatter. Commits to GitHub and navigates to editor. See "What is working" above.

---

### ~~4. Image Upload and Insertion~~ — SHIPPED

Drag-and-drop, toolbar button, and clipboard paste. Commits image to the repo at a configurable path (set in repo settings). Inserts `![alt text](url)` at cursor. Timestamp-prefixed filenames to avoid collisions. Formats: jpg, jpeg, png, gif, webp. Route: `POST /api/github/[owner]/[repo]/upload-image`.

---

### 5. Paste from Google Docs / Notion

**Status:** Unverified. May need a custom paste handler to strip non-markdown formatting, convert rich text to TipTap-compatible HTML, and handle embedded images. Verify current paste behavior before building.

---

### 6. Slash Commands

**What it is:** Typing `/` in the editor opens a command menu for inserting blocks (heading, image, table, code block, divider, etc.).

---

## UX principles — enforce these in every feature

1. **File paths are navigation, not labels.** Users navigate folder structure visually via the sidebar. Files are always labeled by frontmatter title. Full path strings (e.g. `/content/blog/2024-03-01-post.md`) should never appear as primary labels — a small gray breadcrumb in the editor for context is acceptable.

2. **Plain language first, git context second — always both.** Every button or action that touches GitHub must follow this pattern:
   - **Primary label**: plain English (e.g. "Save changes", "Propose changes", "Publishing to...")
   - **Secondary info**: git context in smaller, muted text below or after the action
   - **After the action**: always show a "view on GitHub" link

   Examples:
   ```
   [ Save changes ]
     Will commit directly to main

   ✓ Saved
     Committed to main · just now · view on GitHub ↗

   [ Propose changes ]
     Opens a pull request for review

   ✓ Changes proposed
     PR #42 open · waiting for review · view on GitHub ↗
   ```

   Never hide git concepts entirely — they build trust and give technical users confidence. Never lead with git concepts — they confuse non-technical users. Always show both layers.

3. **Save state must always be visible** — persistent indicator in the editor toolbar: `Unsaved changes` / `Saving...` / `Saved · view on GitHub ↗` / `PR #42 open · view on GitHub ↗`

4. **Errors must suggest a fix** — never show raw API errors to users. Translate GitHub API errors into plain English with a suggested action.

5. **The editor is the primary surface** — don't clutter it with chrome. Sidebar panels should be collapsible.

---

## Important architectural context

- **The left sidebar file list is permanently removed** — do not re-add it. Navigation is Miller columns only.
- **The dashboard route now renders the integrated sidebar + Miller layout**, not a separate repo card grid. There is no standalone dashboard page.
- **All frontmatter date display uses UTC-safe parsing** to avoid timezone shift bugs (dates displaying as previous day).
- **New file creation commits to GitHub immediately** via `POST /api/github/[owner]/[repo]/new-file` — it does not create a local-only draft.
- **Image uploads commit directly to GitHub** via the GitHub App installation token. Storage path and URL prefix are configured per-repo in `RepoSettings`.
- **PR-required mode is the default.** When extending any `/api/github/*` write route, look up `RepoSettings.requirePR` and call `getOrCreateDraftBranch` to resolve the target branch. The `commit` route ignores the client-passed `branch` in PR-required mode and always writes to the draft branch — the client doesn't need to know which branch is active. The editor on mount fetches `/draft` to resolve the effective branch for *reads*.
- **Never `console.error(error)` directly inside a `/api/github/*` route handler** — use `githubErrorResponse(error, context)` from `src/lib/utils.ts`. It does the logging, extracts the upstream HTTP status, and returns the friendly JSON in one call. Pass identifying context (route name, owner, repo, path, ref) so Vercel logs are debuggable.

---

## What NOT to change without asking

- The GitHub App authentication model — all writes must use `getOctokitForRepo(owner)` from `src/lib/github-app.ts`, never user OAuth tokens
- The Prisma schema for `Comment`, `Reply`, `Suggestion`, `User`, `StarredFile`, `RepoSettings`, `Collection`, `DraftBranch` — additive changes only, never modify existing fields
- The draft-branch lifecycle: `getOrCreateDraftBranch` is the only function that creates rows in `DraftBranch`, and `clearDraftBranch` is the only one that deletes them. Don't bypass these — the resume/self-heal logic depends on them.
- The TipTap editor core setup in `src/components/editor/` — extend it, don't replace it
- NextAuth configuration in `src/lib/auth.ts`
- The markdown pipeline in `src/lib/markdown.ts` — extend `prepareFileForEditor()` and `buildRawMarkdown()` if needed, don't rewrite them
- Existing API routes — never change method signatures or response shapes, only add new routes

---

## Code conventions

- TypeScript strict mode — no `any` types
- All GitHub API calls go through `src/lib/github-app.ts` helper functions, never inline in components or API routes
- All database queries go through Prisma client — import from `src/lib/prisma.ts` or equivalent
- API routes live in `/app/api/` using Next.js App Router route handlers
- Components use Tailwind for styling — no inline styles, no CSS modules
- Use design system color tokens from `src/styles/tokens.css` (mapped via `@theme` in `globals.css`). Use `bg-accent`, `text-accent`, `text-success`, `border-accent-border`, etc. — never hardcoded Tailwind palette colors like `violet-500`, `purple-400`, `green-400`, `indigo-*` for UI chrome. Hardcoded palette colors are only acceptable for one-off semantic uses (e.g. red for destructive actions)
- Use `zod` for all API request validation
- Error boundaries around all editor and GitHub API surfaces
- When extending the TipTap editor, use `editor.chain().focus()` command API — never `document.execCommand()`
- When reading editor selection, use `editor.state.selection` — never `window.getSelection()`
- Error responses from `/api/github/*` routes use `githubErrorResponse(error, context)` from `src/lib/utils.ts` — it logs the raw error with route context and preserves the upstream HTTP status. Do not return `NextResponse.json(formatGitHubError(...), { status: 500 })` directly.

---

## Environment variables required

```
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
DATABASE_URL=
ANTHROPIC_API_KEY=
```

---

## Definition of done for the content editing use case

A non-technical user (no GitHub knowledge) should be able to:
1. Sign in with GitHub in under 60 seconds
2. Navigate a familiar folder sidebar to find their blog posts — no raw file paths visible
3. See posts listed by title, date, and published status in a row-based list (like Webflow CMS)
4. Click a post and edit it in a clean WYSIWYG editor
5. Update the title, date, and published status in a friendly sidebar form
6. Paste or drag in an image and have it appear in the document
7. Hit "Propose changes" and have a PR created without any git concepts shown
8. Create a brand new blog post from scratch with a "New post" button

If all eight of these work end-to-end without confusion, the content editing milestone is done.
