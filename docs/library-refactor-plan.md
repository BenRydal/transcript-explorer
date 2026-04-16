# Library refactor plan

The new `svelte-p5-viz` package (contract + registry + scene format) and the Tier S chrome components (`CanvasFrame`, `SplitPane`, `HoverTooltip`, `EntityToggleList`, `TimelineTrack`, `TimelineScrubber`, `createMediaSync`) are live on `main` in `/home/edwin/git/svelte-p5`. This document is the plan for migrating Transcript Explorer onto them. Scoped to be resumable — each phase is independently mergeable.

## Goal

TE becomes the reference consumer demonstrating the full library stack:

- `<CanvasFrame>` replaces the hand-built page layout.
- `<SplitPane>` replaces the local copy at `src/lib/components/SplitPane.svelte`.
- `<TimelineScrubber>` plus `createMediaSync` replaces `TimelinePanel.svelte` + `RangeSlider.svelte`.
- `<EntityToggleList>` replaces `SpeakerControls.svelte`.
- `<HoverTooltip>` replaces the bespoke `CanvasTooltip.svelte` for canvas-hit tooltips.
- Each of the 10 visualization classes in `src/lib/draw/` is rewritten as a `VizPanel<TData, TConfig>` implementation.
- A `PanelRegistry` replaces the switch in `Draw.updatePanel()`; the dashboard becomes a grid layout reading from a `SceneConfig`.

Expected outcome: TE's `+page.svelte` drops from ~870 LOC to ~300; `Draw` shrinks to a scene-runner adapter; every piece of layout/chrome math is gone.

## Phases

### Phase 1 — wire the library into TE's dependencies

Today TE consumes `svelte-p5@^0.2.2` from npm. The new components and the viz package haven't been published yet — the release-please PR for them is still a commit bump away. Two options:

**Option A (preferred once released):** bump versions in `package.json`:

```jsonc
{
	"dependencies": {
		"svelte-p5": "^0.2.3",
		"svelte-p5-components": "^0.3.0",
		"svelte-p5-viz": "^0.1.0"
	}
}
```

**Option B (development, unreleased library):** yarn berry `portal:` protocol:

```jsonc
{
	"dependencies": {
		"svelte-p5": "portal:../../../svelte-p5/packages/core",
		"svelte-p5-components": "portal:../../../svelte-p5/packages/components",
		"svelte-p5-viz": "portal:../../../svelte-p5/packages/viz"
	}
}
```

Requires running `pnpm build` in each library package first so `dist/` is present. Portal handles transitive peer deps cleanly.

Verify with `yarn install && yarn build`. If Option B's peer-dep resolution complains, fall back to `link:` targeting the same paths — it has fewer validation checks.

### Phase 2 — replace page layout with `<CanvasFrame>` + `<SplitPane>`

Target: `src/routes/+page.svelte`.

Current structure (pseudo):

```svelte
<div class="page-container">
	<AppNavbar ... />
	<div class="main-content">
		<SplitPane ...>
			{#snippet first()}
				<div id="p5-container">
					<Sketch {sketch} bind:instance={p5Instance} />
					<CanvasTooltip />
					<VisualizationLegend />
					{#if $ConfigStore.dashboardToggle}<DashboardOverlay />{/if}
				</div>
			{/snippet}
			{#snippet second()}<TranscriptEditor ... />{/snippet}
		</SplitPane>
	</div>
	<div class="btm-nav">
		<SpeakerControls ... />
		<TimelinePanel />
	</div>
</div>
```

Becomes:

```svelte
<script lang="ts">
	import { CanvasFrame, SplitPane, Sketch } from 'svelte-p5-components';
	// ...
</script>

<CanvasFrame>
	{#snippet top()}<AppNavbar ... />{/snippet}
	{#snippet bottom()}
		<div class="flex">
			<EntityToggleList entities={speakers} ... />
			<TimelineScrubber ... />
		</div>
	{/snippet}
	{#snippet canvas()}
		<SplitPane orientation="horizontal" bind:sizes={panelSizes}>
			{#snippet first()}
				<div id="p5-container">
					<Sketch {sketch} bind:instance={p5Instance} />
				</div>
			{/snippet}
			{#snippet second()}<TranscriptEditor ... />{/snippet}
		</SplitPane>
	{/snippet}
	{#snippet overlay()}
		<HoverTooltip ... />
		<VisualizationLegend />
		{#if $ConfigStore.dashboardToggle}<DashboardOverlay />{/if}
	{/snippet}
</CanvasFrame>
```

**Deletes in this phase:**

- `src/lib/components/SplitPane.svelte` (use library version).
- `src/lib/p5/Sketch.svelte`, `FPSMonitor.svelte`, `SketchDebug.svelte` — these were local copies to work around the neodrag transitive issue. With `svelte-p5-components@^0.3.0` the transitive bug is still in neodrag, but we don't import `<DraggableWindow>` or `<DraggableSketch>`, so tree-shaking should exclude neodrag entirely. Verify with a `yarn build` and inspect the chunk graph.

**Keep for now:**

- `#p5-container` id — still used by `CanvasTooltip`, `VideoContainer`, and `getP5ContainerRect()`.

**Testing:**

- Visual diff: should look identical; the only change is layout plumbing.
- Hard-refresh. `yarn build && yarn preview` to confirm prod-mode parity.

### Phase 3 — swap `SpeakerControls` for `<EntityToggleList>`

Target: wherever TE renders the speaker list in the footer.

Current `SpeakerControls.svelte` is ~150 LOC of bespoke button rendering. The library's `EntityToggleList` takes an `Entity[]` with `id`, `label`, `color`, optional `visible`, optional `group`.

Adapter:

```ts
const speakerEntities = $derived(
	$UserStore.map((u) => ({
		id: u.name,
		label: u.name,
		color: u.color,
		visible: u.enabled
	}))
);

function handleSpeakerToggle(id: string, visible: boolean) {
	UserStore.update((users) => users.map((u) => (u.name === id ? { ...u, enabled: visible } : u)));
}
```

The color-picker dropdown that `SpeakerControls` has becomes `onColorChange`. The codes overlay in `CodesButton.svelte` stays separate — it's a different concern than entity visibility.

**Testing:** click speakers on/off and confirm visualizations update.

### Phase 4 — swap `TimelinePanel` for `<TimelineScrubber>` + `createMediaSync`

Target: replace `src/lib/components/TimelinePanel.svelte` and `RangeSlider.svelte` entirely.

The scrubber takes:

- `duration` — from `$TimelineStore.endTime - $TimelineStore.startTime`
- `currentTime` bindable — wired to `$TimelineStore.currTime`
- `viewWindow` bindable — wired to `{ start: leftMarker, end: rightMarker }`
- `speed` bindable — `$ConfigStore.animationRate`
- `isPlaying` bindable — `$TimelineStore.isAnimating`
- `speedLocked` — `videoSync.isLocked` — this is where the silent-video-override bug surfaces to the user
- `segments` — start empty; in-out markers land when we wire segment mode

Animation engine in `igsSketch.ts` keeps its existing rAF loop but learns to respect `videoSync.isLocked`:

```ts
sk.draw = () => {
	// ...existing...
	if (get(TimelineStore).isAnimating) {
		if (videoSync.isLocked) {
			// Timeline follows the video
			TimelineStore.update((t) => ({ ...t, currTime: videoSync.mediaTime }));
		} else {
			// Timeline advances itself at `speed * dt`
			const rate = get(ConfigStore).animationRate;
			TimelineStore.update((t) => ({
				...t,
				currTime: t.currTime + (rate * Math.min(sk.deltaTime, 100)) / 1000
			}));
		}
	}
};
```

Note how the speed multiplier branch is now honest — `speedLocked` on the scrubber matches the actual engine behavior.

**Deletes:** `TimelinePanel.svelte`, `RangeSlider.svelte`.

**Keep:** the existing time-format utilities (pass `formatTime` prop to scrubber).

**Testing:**

- Play without video → speed multiplier changes rate.
- Play with video → speed button renders locked with the reason tooltip.
- Click anywhere on the track → seeks.
- Drag the playhead → seeks continuously.
- Drag the view-window handles → zoom; seek within zoomed view.

### Phase 5 — `VizPanel` migration for drawing classes

The 10 classes in `src/lib/draw/` each become a `VizPanel`. Informal common structure today:

```ts
class WordRain {
	constructor(ctx: DrawContext, bounds: Bounds) {
		/* ... */
	}
	draw(data: DataPoint[]): { hoveredOccurrences; hoveredSpeaker; hasOverflow } {
		/* ... */
	}
}
```

Becomes:

```ts
interface WordRainData {
	words: DataPoint[];
	users: User[];
	timeline: Timeline;
	codeColorMap: Map<string, string>;
}
interface WordRainConfig {
	separateToggle: boolean;
	sortToggle: boolean;
	// …everything currently on ConfigStore that WordRain reads…
}

export const WordRainPanel: VizPanel<WordRainData, WordRainConfig> = {
	type: 'word-rain',
	defaultConfig: {
		separateToggle: false,
		sortToggle: false /* … */
	},
	render(ctx, data, config) {
		const impl = new WordRainImpl(ctx, data, config);
		const { hoveredOccurrences, hoveredSpeaker, hasOverflow } = impl.draw();
		return {
			hover: hoveredSpeaker ? { id: hoveredSpeaker, meta: { occurrences: hoveredOccurrences } } : null,
			overflow: hasOverflow
		};
	}
};
```

`WordRainImpl` is essentially the existing class with the constructor refactored to take `(ctx, data, config)` instead of `(DrawContext, Bounds)` — same drawing code, new plumbing.

One panel at a time:

1. `SpeakerGarden`
2. `TurnChart`
3. `ContributionCloud`
4. `TurnNetwork`
5. `WordRain`
6. `SpeakerHeatmap`
7. `TurnLengthDistribution`
8. `SpeakerFingerprint`
9. `QuestionFlow`
10. `WordJourney`

Each migration is one commit. Tests to add: none required for the panel itself — if the rendered output is visually identical, the migration is a success.

### Phase 6 — replace `Draw.drawViz()` with a scene runner

After Phase 5, `Draw` is vestigial. Replace:

```ts
// src/lib/p5/igsSketch.ts
const registry = createPanelRegistry();
registry.register(SpeakerGardenPanel);
registry.register(TurnChartPanel);
// ...

const sceneState = createSceneState();

sk.draw = () => {
	const config = get(ConfigStore);
	const layout = resolveSceneLayout(config); // single vs dashboard grid
	const data = computeSceneData(get(TranscriptStore), get(UserStore), ...);

	for (const instance of layout.panels) {
		const panel = registry.get(instance.type);
		if (!panel) continue;
		const bounds = layout.boundsFor(instance.id);
		const merged = { ...panel.defaultConfig, ...instance.config };
		const result = panel.render(
			{
				sk,
				bounds,
				mouse: { x: sk.mouseX, y: sk.mouseY },
				highlights: sceneState.highlights
			},
			data,
			merged
		);
		if (result.hover) sceneState.hover = result.hover;
	}
};
```

Delete: `src/lib/draw/draw.ts`.

### Phase 7 — cleanup pass

With the refactor landed:

- Remove now-unused imports/files identified in the earlier cleanup audit.
- Update `docs/architecture.md` in TE to describe the new layering.
- Add one `docs/examples/transcript-overview-scene.json` showing a hand-written `SceneConfig` as a reference for future studio exports.

## Tradeoffs and risks

- **Neodrag transitive.** Even if we don't import `<DraggableWindow>`, Vite may still try to resolve `@neodrag/core/plugins` during `svelte-p5-components` module parse. We previously worked around this by inlining local `Sketch`/`FPSMonitor`/`SketchDebug`. After Phase 2, test a full `yarn build`; if neodrag resolution fails, keep the local copies and import non-neodrag components from the library.
- **Panel config contract.** Phase 5 panels will want `DrawContext` fields (userMap, codeColorMap, timeline) in their `TData`. Pass those in explicitly rather than importing the store inside each panel — this keeps panels independently testable and studio-compatible.
- **Dashboard layout vs `SceneConfig.grid`.** TE's current dashboard supports 1, 2, 3, 4-panel arrangements with custom divider logic. `GridSceneLayout` only models equal-cell grids. Phase 6 will need a custom layout resolver for TE's dashboard shapes, or a small extension to `SceneLayout` upstream. Decide in Phase 6 based on what the existing visuals demand.
- **Animation engine wiring.** The `createMediaSync` bridge makes the video-locked branch honest, but the consumer still owns the rAF loop. Don't over-centralize: the library should stay framework-level and let TE keep its engine.

## Estimated effort

- Phase 1 — 30 min (package wiring).
- Phase 2 — 2 hours (page layout + delete local copies).
- Phase 3 — 1 hour (adapter + CSS polish).
- Phase 4 — 3 hours (timeline migration + animation engine honesty pass).
- Phase 5 — 1 hour per panel × 10 = 10 hours.
- Phase 6 — 2-3 hours (scene runner + layout resolver for the dashboard shapes).
- Phase 7 — 2 hours.

**Total: ~20-22 hours of focused work**, landable over 4-5 sessions without rushing. Phases 2-4 give immediate visible wins; Phases 5-6 are the quiet mechanical work.
