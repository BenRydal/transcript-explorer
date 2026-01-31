# Architectural Cleanup: Unify Hover State & Simplify Selection Source

## Change 1: Replace 6 per-visualization hover fields with single `hoveredDataPoint`

### configStore.ts
- Remove from interface: `selectedWordFromContributionCloud`, `firstWordOfTurnSelectedInTurnChart`, `selectedWordFromWordRain`, `selectedElementFromTurnNetwork`, `selectedCellFromHeatmap`, `hoveredBarFromTurnLength`
- Add to interface: `hoveredDataPoint: DataPoint | null`
- Same removals/addition in `initialConfig`

### draw.ts
- `updateTurnChart`: set `hoveredDataPoint` instead of `firstWordOfTurnSelectedInTurnChart`
- `updateContributionCloud`: set `hoveredDataPoint` instead of `selectedWordFromContributionCloud`
- `updateWordRain`: set `hoveredDataPoint` instead of `selectedWordFromWordRain`
- `updateTurnNetwork`: set `hoveredDataPoint` instead of `selectedElementFromTurnNetwork`
- `updateSpeakerHeatmap`: set `hoveredDataPoint` instead of `selectedCellFromHeatmap`
- `updateTurnLengthDistribution`: set `hoveredDataPoint` instead of `hoveredBarFromTurnLength`
- `drawDashboard`: read `currConfig.hoveredDataPoint` instead of two separate fields

### video-interaction.ts
- Replace 6-line `||` chain with `config.hoveredDataPoint`

### igsSketch.ts
- Replace 6-line `||` chain with `currConfig.hoveredDataPoint`

### contribution-cloud.ts (line 284)
- `shouldDraw(word, 'turnNumber', 'firstWordOfTurnSelectedInTurnChart')` → `shouldDraw(word, 'turnNumber', 'hoveredDataPoint')`

### turn-chart.ts (line 72)
- `shouldDraw(array[0], 'turnNumber', 'selectedWordFromContributionCloud')` → `shouldDraw(array[0], 'turnNumber', 'hoveredDataPoint')`

### TranscriptEditor.svelte (lines 96-101)
- Replace `firstWordOfTurnSelectedInTurnChart: firstWord` + `selectedWordFromContributionCloud: firstWord` with `hoveredDataPoint: firstWord`

## Change 2: Simplify `selectionSource` union

### editorStore.ts
- `'editor' | 'distributionDiagram' | 'distributionDiagramClick' | 'turnChart' | 'contributionCloud' | 'wordRain' | 'turnNetwork' | 'speakerHeatmap' | 'turnLength' | 'video' | null`
- → `'editor' | 'visualization' | 'visualizationClick' | 'video' | null`

### draw.ts
- `syncHoverToEditor(*, 'turnChart')` → `'visualization'` (and same for all 5 other viz sources)
- `selectionSource: 'distributionDiagram'` → `'visualization'` (line 108)
- `isFilterLocked` check: `=== 'distributionDiagramClick'` → `=== 'visualizationClick'`

### igsSketch.ts
- `selectionSource: 'distributionDiagramClick'` → `'visualizationClick'` (line 207)

### TranscriptEditor.svelte
- `=== 'distributionDiagramClick'` → `=== 'visualizationClick'` (line 503)
- `!== 'editor'` stays the same (line 315)
- `selectionSource: null` stays (line 55)
- `selectionSource: 'editor'` stays (line 86)

### TranscribeModeLayout.svelte
- `selectionSource: 'video'` stays (no change)

## Verification
- `yarn check` — type-check passes (no new errors)
- `yarn build` — builds successfully
- Manual: load an example, verify each visualization mode shows hover cursor + tooltip + video click works
- Manual: verify editor selection sync (clicking a turn in turn chart highlights in editor)
- Manual: verify dashboard cross-highlighting still works
- Manual: verify distribution diagram click-to-lock filter still works
