# Transcript Explorer — Layout Reorganization Plan

**Status**: plan, uncommitted. Authored during a session that completed the svelte-p5 Tier-S library refactor (phases 1–4 of `library-refactor-plan.md`) and a partial cleanup pass. This document is the roadmap for the next chunk of work: reorganizing TE's chrome around an activity-bar + primary-sidebar pattern.

> **How to use this doc**
> Each phase section has a **Prompt to execute this phase** block that is self-contained — paste it into a fresh Claude session (or hand it to a teammate) and they should be able to run it without needing to re-derive context. Read "Session context" and "Global rules" first. Phases are ordered by leverage; B and D are safe to do first.

---

## Session context — what's already done, what's uncommitted

### Repos

| repo | path | role |
|---|---|---|
| Transcript Explorer (TE) | `/home/edwin/git/phd/temp/transcript-explorer` | consumer app (yarn berry 4.5.3, SvelteKit 2, Svelte 5) |
| svelte-p5 library | `/home/edwin/git/svelte-p5` | pnpm monorepo with 3 packages: `svelte-p5` (primitives), `svelte-p5-components` (chrome), `svelte-p5-viz` (contract) |

### Current branches

- TE: `refactor/svelte-p5-library-adoption` (≥5 commits ahead of `main`), plus `wip/pre-refactor-snapshot` archiving earlier scaffolding.
- svelte-p5: work on the timeline and `EntityToggleList` is **uncommitted** in the library working tree. See "uncommitted changes" below.

### What's shipped (committed on TE `refactor/svelte-p5-library-adoption`)

1. `chore(deps): add svelte-p5-components and -viz, pin svelte-p5 0.3.0`
2. `refactor: replace page layout with library CanvasFrame + SplitPane`
3. `refactor: replace SpeakerControls with library EntityToggleList`
4. `refactor: replace TimelinePanel + RangeSlider with library TimelineScrubber`

Net: ~1,000 LOC removed from TE; 5 local forks deleted (`SplitPane`, `SpeakerControls`, `UserButtonGroup`, `TimelinePanel`, `RangeSlider`); timeline and speaker UX routed through the library.

### What's uncommitted (as of handoff)

**Library (`/home/edwin/git/svelte-p5/packages/components/src/lib/`):**

- `TimelineTrack.svelte` — **complete rewrite**. Old zoom-viewWindow model → new `selectionStart`/`selectionEnd` model with draggable in/out handles, draggable selection band, hover-reveal chrome, red progress fill, keyboard navigation, a11y roles. ~694 lines.
- `TimelineScrubber.svelte` — **complete rewrite**. Stacked layout (track on top, controls row below), inline SVG icons (no `@lucide/svelte` peer dep), time-mode toggle (total↔remaining), subtle bordered buttons. All controls are left-aligned. ~280 lines.
- `EntityToggleList.svelte` — **added `onRename` prop**, inline-edit mode, pencil affordance on hover, bumped sizing (13px font, 14px swatch, 32px min tap-target, 6/10 padding), a11y focus outlines.

**TE (`/home/edwin/git/phd/temp/transcript-explorer/`):**

- `package.json` — portal-linked to the library via `portal:../../../svelte-p5/packages/{core,components,viz}`; has `@neodrag/core@3.0.0-next.8` direct dep as a workaround (see "Known traps").
- `src/routes/+page.svelte` — 891 LOC (down from 992 this session, from ~859 pre-refactor). Currently wires new timeline + rename + wheel-scroll.
- `src/lib/timeline/scrubber-bridge.ts` — **new**, 71 LOC. Extracted timeline handlers (seek / play / speed / selection).
- `src/lib/speakers/speaker-handlers.ts` — **new**, 48 LOC. Extracted speaker handlers (toggle / color / rename).
- `src/lib/core/transcript-lifecycle.ts` — **new**, 70 LOC. Extracted transcript helpers (applyTranscriptResult / triggerCanvasResize / openEditor / handleDiscard).
- `src/lib/components/TranscribeModeLayout.svelte` — now imports `SplitPane` from library.
- Deleted: `SplitPane.svelte`, `SpeakerControls.svelte`, `UserButtonGroup.svelte`, `TimelinePanel.svelte`, `RangeSlider.svelte`, `UserButton.svelte`, 3 dead barrel files (`$lib/p5/index.ts`, `$lib/draw/index.ts`, `$lib/video/index.ts`).

### Nothing has been pushed anywhere. Commit strategy below.

### Dev loop

```bash
# One-time: verify both repos are there and dev tooling is in place
ls /home/edwin/git/phd/temp/transcript-explorer
ls /home/edwin/git/svelte-p5

# TE dev server (port 5173)
cd /home/edwin/git/phd/temp/transcript-explorer && yarn dev

# When you edit a library file, rebuild the library so dist/ updates:
cd /home/edwin/git/svelte-p5 && pnpm --filter svelte-p5-components build

# After a library rebuild, the vite cache sometimes corrupts. Clean restart:
pkill -f "vite|yarn dev"
rm -rf /home/edwin/git/phd/temp/transcript-explorer/node_modules/.vite
cd /home/edwin/git/phd/temp/transcript-explorer && yarn dev

# TE production build (verify before committing)
cd /home/edwin/git/phd/temp/transcript-explorer && yarn build
```

---

## Related documents

- `docs/library-refactor-plan.md` — the original Phase 1–7 library-adoption roadmap. Phases 1–4 are done. **Phases 5–7 (viz migration) are paused** per assessment below.
- `docs/architecture.md`, `docs/performance.md` — earlier session notes.
- `/home/edwin/git/svelte-p5/docs/architecture.md` — the library's layered-primitives philosophy. Relevant line: *"p5 draws pixels, Svelte does everything else."*
- `/home/edwin/git/svelte-p5/docs/no-code-product.md` — the library's downstream "svelte-p5-studio" vision. Relevant because it explains some of the VizPanel contract design.

---

## Key prior-session findings (to honor, not re-derive)

### Assessment 1 — "Was the library swap worth it?"

Subagent audit earlier in session concluded: **too early to tell, leaning premature, but don't roll back**. Specifically:

- Tier-S extractions (`SplitPane`, `CanvasFrame`, `EntityToggleList`, `TimelineScrubber`) are defensible primitives.
- `TimelineTrack` needed a full API rewrite on first consumer integration — classic "first consumer discovers the real API" churn. Expect one more rewrite cycle when a second consumer appears.
- Only TE consumes the Tier-S chrome; library's own site imports only `Sketch`, `FPSMonitor`, `DraggableSketch`.
- `svelte-p5-viz` has **zero implementers**.

**Concrete directive from the assessment: pause Phases 5–7 (the 10-class viz migration) until a second real consumer appears.** Do not migrate draw classes to `VizPanel` speculatively.

### Assessment 2 — Panel / layout research

Subagent researched VSCode, Figma, DaVinci, Blender, NN/G modal guidelines, Svelte ecosystem dock managers. Key takeaways that inform this plan:

- **VSCode activity-bar + primary-sidebar** is the right pattern for TE (10 viz modes, scattered filters). 3–5 views per sidebar is comfortable max.
- **NN/G**: modals for one-shot / high-stakes only. Reference-while-working features belong in non-modal drawers.
- **DaVinci task workspaces** (Edit / Color / Fairlight) deliver 80% of customization value for 10% of engineering vs. free-form docking.
- **Figma UI3 rejected hover-reveal panels** → use explicit open/close for panels, hover is only for affordances on already-visible elements.
- **Selection-contextual chrome** (Figma) is a big UX win — click something, get actions near it.
- **Command palette**: wait. Researcher/educator audience won't discover ⌘K. Fix chrome organization first; add palette once 20+ actions exist.
- **Svelte dock managers**: no production-ready option. `dockview-core` is the closest but has no Svelte wrapper. `SplitPane` + hand-rolled sidebar is right for TE's single-viewport tool shape.

---

## Reorganization plan — 7 phases, ranked by leverage

Each phase is designed to be independently mergeable. Phases B and D are safe first steps (mechanical, non-breaking). Phase A is the main event. C, E, F, G follow from A.

### Phase B — Split `ConfigStore` into four cohesive stores (do first)

**Why first**: The current `ConfigStore` is a 30+ field flat bag. That's the structural reason controls get jammed wherever there's room. Splitting it enables per-sidebar-panel binding in Phase A.

**Goal**: Break `ConfigStore` along responsibility lines:

- `VizStore` — active viz toggle + per-viz config (11 viz toggles + their options like `separateToggle`, `wordRainMinFrequency`, etc.)
- `FiltersStore` — `wordToSearch`, `showUncoded`, `scaleToVisibleData`, `codeColorMode`, + the speaker-visibility derivation (which currently lives in `UserStore`)
- `AppSettingsStore` — `speechRateWordsPerSecond`, `preserveGapsBetweenTurns`, `snippetDurationSeconds`, `animationRate`
- `UIStateStore` — `legendVisible`, dashboard panel layout config, later: active sidebar tab, workspace mode, panel widths

**Acceptance**: `yarn build` passes; no behavior change; `+page.svelte` imports from 4 stores instead of 1 where relevant.

**Effort**: 2h mechanical.

**Prompt to execute this phase**:

```
Refactor-only task. Zero behavior change.

Working in /home/edwin/git/phd/temp/transcript-explorer. Read docs/layout-reorganization-plan.md first for context. Current branch is refactor/svelte-p5-library-adoption.

Split src/stores/configStore.ts into four stores by responsibility:

  VizStore         — active viz toggle + per-viz config
  FiltersStore     — word search, showUncoded, scaleToVisibleData, codeColorMode
  AppSettingsStore — speechRate, preserveGaps, snippetDuration, animationRate
  UIStateStore     — legendVisible, dashboardPanels (layout list)

Steps:
  1. Create the four new store files under src/stores/ matching the existing store pattern (writable-based, not runes — TE's stores are all classic Svelte stores).
  2. Move fields from ConfigStore into the appropriate store, preserving initial values.
  3. Find every import of ConfigStore across src/ (use grep/Grep). For each import site, update to pull from the new store.
  4. Delete configStore.ts once no references remain. If one reference is stubborn (e.g. filterToggleKey derived store), keep a thin aggregator file with JUST that derivation.
  5. Run `yarn build` after each store extraction; keep build green throughout.
  6. Do NOT touch store values, defaults, or semantics. Pure relocation.
  7. Don't commit. Leave changes in working tree.

Report: which stores exist after, what each holds, and a diff summary.

Gotchas:
  - `filterToggleKey` is a derived store exported from configStore.ts — preserve it.
  - AppNavbar.svelte destructures many ConfigStore fields — audit the resulting imports carefully there (it's 703 LOC).
  - The `dashboardPanels` field is an array of panel keys; it belongs in UIStateStore (layout), not VizStore.
```

---

### Phase D — Bottom bar to full-width timeline (quick win)

**Why early**: Phase A will move speaker toggles into the Filters sidebar, making the bottom bar's left half empty. This phase just prepares for that by giving the timeline its full width.

**Goal**: Bottom bar becomes 100% timeline scrubber. Speaker list moves to the Filters sidebar (but since that sidebar doesn't exist yet in phase D, speakers get temporarily relocated — either inline above the timeline as a compact row, or gated behind a "Speakers" button that opens a small popover).

**Recommended approach**: Do Phase D **concurrently with Phase A**, since they're the same region reshuffle. The clean sequencing is B → (A+D together).

**Effort**: 30 min if done concurrently with A; 1h as a separate pre-A step.

**Prompt**: merge into the Phase A prompt below.

---

### Phase A — Activity bar + primary sidebar (biggest win)

**Why**: Replaces the 703-LOC navbar mega-popover with the VSCode pattern. Also consumes `CanvasFrame`'s `leftRail` slot (already in the library, never used in TE).

**Scope**:

1. **New library components** in `svelte-p5-components`:
   - `<ActivityBar>` — vertical icon rail, ~80 LOC. Accepts items with icon / label / id; emits `onSelect(id)`; shows active-state. CSS-only hover states, no JS animation.
   - `<SidePanel>` — slide-in drawer, ~150 LOC. Props: `open`, `title`, `width` (resizable), `onClose`. Snippet slot for content.
2. **TE integrations**:
   - Add left rail via `CanvasFrame`'s `leftRail` slot.
   - 5 activity items: Viz, Filters, Data, Settings, Help.
   - A `SidePanel` docks next to the rail when active; closes on re-click.
   - Move viz catalog content out of `AppNavbar` into the Viz panel.
   - Consolidate filters (speakers, word search, code visibility, timeline-range summary, showUncoded, scaleToVisibleData) into Filters panel.
   - Move `DataExplorerModal` contents into Data panel (delete the modal).
   - Move `SettingsModal` contents into Settings panel (delete the modal).
   - Move `InfoModal` contents into Help panel; keep TourOverlay separate.
   - Bottom bar: speakers row removed, timeline scrubber goes 100% width. Phase D done.

**Acceptance**:
- `AppNavbar.svelte` shrinks from 703 → ~250 LOC (just title + examples + upload/new + editor/video toggles + transcribe).
- `DataExplorerModal`, `SettingsModal`, `InfoModal` deleted from `src/lib/components/`.
- Build passes; tour still works; example-loading still works.

**Effort**: 4–5h (library components first, then TE wiring).

**Prompt to execute this phase**:

```
Multi-part task across /home/edwin/git/svelte-p5 (library) and /home/edwin/git/phd/temp/transcript-explorer (consumer). Read docs/layout-reorganization-plan.md and CLAUDE.md first.

Phase A prerequisite: Phase B (ConfigStore split) must be done. Phase D is merged in.

Part 1 — Library components. Working in /home/edwin/git/svelte-p5/packages/components/src/lib/:

  A. Create ActivityBar.svelte. Props: 
       items: { id: string; icon: Snippet; label: string; badge?: number }[]
       activeId?: string         (bindable)
       onSelect?: (id: string) => void
       width?: number            (default 48)
       orientation?: 'vertical'  (accept only vertical for now)
     Visual: vertical stack of square buttons (48x48), icon centered, active state uses accent-colored left border + background tint. Hover: subtle background. Keyboard: up/down arrow moves focus; enter activates. ARIA role='tablist'.

  B. Create SidePanel.svelte. Props:
       open: boolean              (bindable)
       title?: string
       width?: number             (bindable, default 280)
       minWidth?: number          (default 220)
       maxWidth?: number          (default 480)
       resizable?: boolean        (default true)
       onClose?: () => void
       header?: Snippet
       children?: Snippet
     Layout: absolute-positioned adjacent to activity bar, slides in from left with transform. Header: title + close button. Resize handle on right edge. Resizing persists width. Close button + Escape key close the panel.

  C. Export both from index.ts.

  D. Rebuild: `pnpm --filter svelte-p5-components build` from the monorepo root. Confirm dist has new components.

Part 2 — TE wiring. Working in /home/edwin/git/phd/temp/transcript-explorer/src/:

  A. In +page.svelte, fill in CanvasFrame's leftRail snippet slot:
       - Render <ActivityBar> with 5 items: Viz, Filters, Data, Settings, Help.
       - Render <SidePanel open={sidebarOpen} title={activeSidebarLabel}>...</SidePanel> rendered right next to ActivityBar (same leftRail slot, or via an adjacent div — the frame's leftRail wraps both).
       - Track active sidebar via UIStateStore.activeSidebarTab (set in Phase B).
       - Clicking the same activity again closes the sidebar.

  B. Create 5 new panel components under src/lib/panels/:
       - VizPanel.svelte       — moves content from AppNavbar's viz-grid popover
       - FiltersPanel.svelte   — new; houses:
           • Word search (moves from navbar)
           • Speakers (EntityToggleList — moves from bottom bar)
           • Codes toggle block (moves from CodesButton modal)
           • showUncoded toggle (moves from SettingsModal)
           • scaleToVisibleData toggle (moves from SettingsModal)
           • Timeline in/out summary (read-only display of current range + a "Reset" button)
       - DataPanel.svelte      — content from DataExplorerModal
       - SettingsPanel.svelte  — content from SettingsModal (minus filter-like items that moved to FiltersPanel)
       - HelpPanel.svelte      — content from InfoModal (minus tour trigger)

  C. In +page.svelte template:
       - Remove the viz dropdown from AppNavbar usage (need to refactor AppNavbar too, see Part 3).
       - Remove the bottom-bar speakers row entirely.
       - Timeline scrubber takes 100% width of the bottom bar.
       - Delete the DataExplorerModal, SettingsModal, InfoModal render slots (they're now panels).
       - Keep TourOverlay, RecoveryModal, UploadModal, PasteModal, TranscriptionModal, ConfirmModal as modals.

  D. Delete src/lib/components/DataExplorerModal.svelte, SettingsModal.svelte, InfoModal.svelte.

Part 3 — Shrink AppNavbar.svelte:

  - Remove: viz dropdown (entire popover), word search input, settings icon, help icon.
  - Keep: title, examples dropdown, editor toggle, video toggle, transcribe mode, upload, new.
  - The mobile menu shrinks accordingly.
  - Target LOC: ~250 (from 703).

Part 4 — Verify:

  - yarn build passes cleanly.
  - yarn dev works; every activity icon opens its panel; no modal regressions.
  - Tour still starts from Help panel (`onStartTour` callback).

Do NOT commit. Do NOT push.

Report: final LOC of AppNavbar and +page.svelte, new files, deleted files, any judgment calls.

Gotchas (see the "Known traps" section of the plan doc):
  - daisyUI .btm-nav / .navbar classes apply position:fixed and mangle children; use neutral class names inside CanvasFrame slots.
  - After library rebuild, restart dev server to avoid PostCSS cache issues.
  - EntityToggleList inside the sidebar should NOT force flex-nowrap (the bottom-bar override was for horizontal overflow; in the sidebar it should wrap naturally).
  - p5Instance/viz refresh: toggling a viz from the new VizPanel should still trigger p5Instance.fillAllData() — wire this through Phase B's new VizStore.
```

---

### Phase C — Modal → panel migration (merges into A)

Folded into Phase A's prompt. The three modals becoming panels (Data, Settings, Help) are deleted there. **Keep as modals**: Upload, Paste, Transcription, Confirm, Recovery, plus TourOverlay (overlay, not modal).

---

### Phase E — Selection-contextual canvas menu

**Why**: Figma-style contextual actions. Click a glyph / word on the canvas → floating action menu near the cursor with: seek video, apply code, set in-point, set out-point, filter to this speaker. Big UX win.

**Scope**:

1. New library component `<ContextMenu>` — positioned at a screen point, auto-flips near edges, dismisses on outside click / Escape.
2. In `igsSketch.ts` (TE), when a glyph is clicked, fire an event that TE handles to pin a context menu at the cursor with actions.
3. The existing `HoverTooltip` already has half the positioning logic — factor shared code into a `useAnchoredPosition` helper or similar.

**Acceptance**: clicking a word in Word Rain opens a menu with "Seek video here / Filter to [speaker] / Apply code…"; menu dismisses correctly.

**Effort**: 2–3h.

**Prompt**:

```
Self-contained task. Read docs/layout-reorganization-plan.md first. Requires Phase A done (for the left rail and UIStateStore pattern).

Part 1 — Library component. In /home/edwin/git/svelte-p5/packages/components/src/lib/:

  Create ContextMenu.svelte. Props:
    open: boolean                 (bindable)
    anchor: { x: number; y: number } | null
    items: { id: string; label: string; icon?: Snippet; disabled?: boolean; danger?: boolean }[]
    onSelect?: (id: string) => void
    onClose?: () => void

  Behavior:
    - Renders as absolute-positioned div at anchor coords.
    - Auto-flips horizontally/vertically if near viewport edges.
    - Dismisses on outside pointerdown, Escape, blur.
    - Up/Down arrow keys navigate items; Enter activates.
    - role="menu", items are role="menuitem".
  
  Add to library index.ts, rebuild.

Part 2 — TE wiring. In /home/edwin/git/phd/temp/transcript-explorer/src/:

  A. Add context-menu state to UIStateStore: `contextMenu: { open: false, x: 0, y: 0, payload: null }`.
  B. In igsSketch.ts: when the user clicks a viz glyph (existing click handling in mousePressed), instead of immediately triggering the current action, set UIStateStore.contextMenu with the click x/y and a payload describing what was clicked (speaker, turn, time).
  C. In +page.svelte: render <ContextMenu> bound to UIStateStore.contextMenu.
  D. Action list depends on payload:
       - Seek video here        → seek to click-time
       - Set in-point here      → TimelineStore.leftMarker = click-time
       - Set out-point here     → TimelineStore.rightMarker = click-time
       - Filter to [speaker]    → UserStore: disable all speakers except this one
       - Apply code…            → open a submenu or a small popover for code selection (or defer to Phase E.1)

  E. Leave the direct click → seek-video-to-time path as a double-click shortcut (single-click opens menu; double-click = common action).

Acceptance: clicking a word in Word Rain visualization opens a menu with relevant actions near the cursor. Menu dismisses on Escape, outside click, or selection. yarn build passes.

Don't commit.
```

---

### Phase F — Task workspaces (Analyze / Code / Present)

**Why**: DaVinci-style named presets for different tasks. 80% of customization value, 10% of engineering.

**Scope**:

1. Add workspace state to `UIStateStore`: `activeWorkspace: 'analyze' | 'code' | 'present'`.
2. Define each workspace's layout snapshot: which sidebar is open (or none), editor visibility, video visibility, dashboard visibility.
3. Add a small workspace switcher to the top-right of the navbar (three buttons or a dropdown).
4. Keyboard shortcuts `1`/`2`/`3` to switch.
5. Persist `activeWorkspace` to localStorage.

**Acceptance**: switching workspace instantly rearranges the layout; preference persists across reloads.

**Effort**: 1h.

**Prompt**:

```
Self-contained task. Requires Phase A done.

In /home/edwin/git/phd/temp/transcript-explorer:

  1. Add to UIStateStore:
       activeWorkspace: 'analyze' | 'code' | 'present'
     Default to 'analyze'. Persist to localStorage via a subscribe that writes on change; restore on load.

  2. Define three workspace presets as pure functions returning partial UIState:
       const workspaces = {
         analyze: { sidebarTab: 'filters', editorVisible: true,  videoVisible: true,  dashboardVisible: false },
         code:    { sidebarTab: 'data',    editorVisible: true,  videoVisible: false, dashboardVisible: false },
         present: { sidebarTab: null,      editorVisible: false, videoVisible: true,  dashboardVisible: false },
       }
     Applying = UIStateStore.update(u => ({ ...u, ...workspaces[id], activeWorkspace: id }))

  3. Add a workspace switcher to AppNavbar. A segmented control (3 pills) or a dropdown. Shows current workspace name; clicking switches.

  4. Add keyboard shortcuts in +page.svelte onMount: '1' → analyze, '2' → code, '3' → present. Skip if focus is in an input/textarea.

  5. Add a note to HelpPanel documenting the three workspaces.

Acceptance: switching workspaces immediately reshuffles the visible chrome. Preference persists across reload. yarn build passes.

Don't commit.
```

---

### Phase G — Command palette (deferred)

**Deferred until Phases A–F land.** Rationale: your users are researchers/educators, not developers; the palette only earns its keep once there are 20+ discoverable actions and users already know the app's action vocabulary. Well-organized sidebars + workspaces will cover 80% of the value without palette discovery cost.

When the time comes: look at [`cmdk-sv`](https://cmdk-sv.com/) or `bits-ui` Command — both Svelte 5 compatible.

---

## What NOT to do

1. **Don't adopt `dockview-core`.** No Svelte wrapper; overkill for a single-viewport app. SplitPane + ActivityBar + SidePanel covers your needs.
2. **Don't implement free-form panel rearrangement.** Task workspaces (Phase F) give 80% of the value.
3. **Don't hide panels on hover.** Figma tried in UI3 and shipped without it.
4. **Don't start the viz migration (`VizPanel` for draw classes)** — prior session agent explicitly recommended pausing this until a second library consumer exists.
5. **Don't add a command palette until Phases A–F land.** It's a consolation prize for disorganized chrome; fix the chrome first.

---

## Global rules (honor across all phases)

From `~/.claude/CLAUDE.md`:

- **Plan before non-trivial work.** Present plan → get approval → code.
- **Diagnose root causes**, don't patch symptoms.
- **Keep changes focused.** No refactors beyond what the task requires.
- **Tech stack**: Svelte 5 with runes (`$state`, `$derived`, `$props`). TypeScript strict. SvelteKit 2. Tailwind. daisyUI.
- **Commits** follow conventional-commits format: `type(scope): subject`. Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`, `ci`, `build`, `perf`. No AI attribution (no `Co-Authored-By`).
- **Branches**: `type/short-description` (lowercase, hyphens). Current work is on `refactor/svelte-p5-library-adoption`.
- **Never push to main.** Never `--no-verify`. Use `--force-with-lease` if force-push needed.
- **Notion is the primary knowledge base** — check it before assuming info doesn't exist.

---

## Known traps (discovered this session — don't re-stub your toe)

1. **`@neodrag/svelte@3.0.0-next.8`** imports `@neodrag/core/plugins` at module scope without declaring `@neodrag/core` in its deps. Rollup build fails with "Could not resolve `@neodrag/core/plugins`". **Fix**: add `@neodrag/core@3.0.0-next.8` as a direct dep in TE's `package.json`. Already in place.

2. **`svelte-p5-components@0.4.1`** declares `"svelte-p5": "workspace:^"` as a peer dep, which doesn't resolve outside the monorepo. Install prints a warning; build works. Library-side packaging bug; filing upstream is a future-Edwin task.

3. **daisyUI class collisions**. `.btm-nav`, `.navbar`, `.card`, `.timeline` are **whole-component stylers** — apply one inside a library-provided layout shell and it fights the shell's contract. Example from this session: `.btm-nav` applies `position: fixed; bottom: 0` and mangles children, which broke `CanvasFrame`'s bottom region. **Rule**: use neutral class names (`.te-bottom-bar`, `.te-speakers-side`) inside CanvasFrame slots; let tailwind utilities do the actual styling.

4. **Yarn berry 4.0.1** crashes in post-resolution validation (`TypeError: Cannot read properties of null (reading 'set')`) on the current peer-dep graph. **Fix**: `corepack use yarn@4.5.3`.

5. **Portal-linked library + vite + library rebuild** = PostCSS cache corruption. Vite's style-extraction pipeline gets confused, tries to parse whole `.svelte` files as CSS. **Workaround**: after any library rebuild, kill dev server, `rm -rf node_modules/.vite`, restart. Plan: unpin from portal and use published npm versions once library hits 0.5.0.

6. **`pkg.pr.new/<owner>/<repo>/<pkg>@main` URLs** aren't resolvable by yarn berry as native descriptors (they work with `pnpm add`). If you want bleeding-edge library tracking in TE, either (a) publish to npm and pin, (b) use portal, or (c) write a yarn resolver shim.

7. **Scoped library CSS in `dist/`**. The library's scoped `.svelte` files ship with hashed class names (e.g. `s-y_bCXRrkrYfP`). If you `:global()` into them from TE CSS, your selector still works because `:global` escapes scoping — but the hashed classes themselves can change across library versions. Target the *public* class names (`.entity-toggle-list__row`, `.timeline-scrubber__btn`) which are author-written and stable.

8. **`+page.svelte` file-upload state** was explicitly left in place during the handler-extraction pass because cleanly extracting it needs a reactive class in `*.svelte.ts`. It's the biggest remaining single chunk (~150 LOC). If a phase below feels blocked by it, extract it to `src/lib/files/file-processor.svelte.ts` as a class with `$state` fields.

---

## Commit strategy for the current uncommitted work (independent of the plan phases)

Before starting Phase B, commit what's already done in logical chunks. Suggested sequence (from the TE `refactor/svelte-p5-library-adoption` branch, and the svelte-p5 main):

### Library commits (`/home/edwin/git/svelte-p5`)

1. `feat(components)!: rewrite TimelineTrack around selection-range model`
   - Files: `packages/components/src/lib/TimelineTrack.svelte`
   - Note the `!` (breaking) — `TimelineViewWindow` type renamed to `TimelineSelection`; `viewWindow`/`onViewWindowChange` props replaced with `selectionStart`/`selectionEnd`/`onSelectionChange`/`onSelectionCommit`.
2. `feat(components)!: rewrite TimelineScrubber as stacked player bar`
   - Files: `packages/components/src/lib/TimelineScrubber.svelte`
   - Breaking because the old scrubber's API passed through `viewWindow`.
3. `feat(components): add onRename to EntityToggleList with inline-edit mode`
   - Files: `packages/components/src/lib/EntityToggleList.svelte`
   - Non-breaking — purely additive prop.

These three together justify `svelte-p5-components@0.5.0`. Release-please on the library should handle the version bump automatically from the commit types.

### TE commits (`/home/edwin/git/phd/temp/transcript-explorer`, branch `refactor/svelte-p5-library-adoption`)

4. `chore: switch to portal-linked svelte-p5 library for local iteration`
   - Files: `package.json`, `yarn.lock`
5. `refactor(page): extract scrubber / speaker / lifecycle handlers into modules`
   - Files: `src/routes/+page.svelte`, `src/lib/timeline/scrubber-bridge.ts` (new), `src/lib/speakers/speaker-handlers.ts` (new), `src/lib/core/transcript-lifecycle.ts` (new)
6. `fix(ui): restore wheel-to-horizontal-scroll on speaker list`
   - Files: `src/routes/+page.svelte`
7. `feat(ui): wire library onRename into TE speaker list`
   - Files: `src/lib/speakers/speaker-handlers.ts` (handleSpeakerRename), `src/routes/+page.svelte`
8. `chore: delete orphaned components and dead barrel files`
   - Deletes UserButton.svelte, 3 barrel files.
9. `docs: add layout-reorganization-plan`
   - Adds this file.

Don't push yet. After Phase B lands its own commit, evaluate whether to publish the library and unpin from portal.

---

## Quick-start if you're picking this up cold

1. Open this file in your editor. Skim "Session context" and "Known traps."
2. Decide a phase: start with **B** if you want a safe mechanical win, **A** if you're committing to the full reorg.
3. Copy the relevant "Prompt to execute this phase" block into a fresh Claude session or a teammate's inbox.
4. Expect to spend the estimated effort — round up by 50% for a first attempt.
5. After each phase: `yarn build` passes, dev server behaves, then commit with a conventional message.

Good luck.
