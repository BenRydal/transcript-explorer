import type p5 from 'p5';
import { TurnChart } from './turn-chart';
import { ContributionCloud } from './contribution-cloud';
import { WordRain } from './word-rain';
import { DistributionDiagram } from './distribution-diagram';
import { TurnNetwork } from './turn-network';
import { SpeakerHeatmap } from './speaker-heatmap';
import { TurnLengthDistribution } from './turn-length-distribution';
import { TurnChartAnnotations, ANNOTATION_STRIP_HEIGHT } from './turn-chart-annotations';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import TranscriptStore from '../../stores/transcriptStore';
import { get } from 'svelte/store';
import EditorStore, { type EditorState, type EditorSelection } from '../../stores/editorStore';
import { resetTooltipFrame, finalizeTooltipFrame } from '../../stores/tooltipStore';
import type { DataPoint } from '../../models/dataPoint';
import type { Bounds, DashboardBounds } from './types/bounds';

type SelectionSource = EditorSelection['selectionSource'];

let currConfig: ConfigStoreType;

ConfigStore.subscribe((data) => {
	currConfig = data;
});

// Helper to check if speaker filter is locked
const isFilterLocked = (state: EditorState): boolean => state.selection.selectionSource === 'distributionDiagramClick';

// Helper to update editor selection while preserving locked filter
const updateEditorSelection = (updates: Partial<EditorSelection>, source: SelectionSource): void => {
	EditorStore.update((state) => {
		const locked = isFilterLocked(state);
		return {
			...state,
			selection: {
				...state.selection,
				...updates,
				filteredSpeaker: locked ? state.selection.filteredSpeaker : (updates.filteredSpeaker ?? null),
				selectionSource: locked ? state.selection.selectionSource : source
			}
		};
	});
};

const syncHoverToEditor = (hoveredDataPoint: DataPoint | null, source: SelectionSource): void => {
	updateEditorSelection(
		{ selectedTurnNumber: hoveredDataPoint?.turnNumber ?? null, highlightedSpeaker: null },
		source
	);
};

const getBinCount = (width: number): number => Math.max(20, Math.min(80, Math.floor(width / 10)));

export class Draw {
	sk: p5;

	constructor(sketch: p5) {
		this.sk = sketch;
	}

	drawViz(): void {
		// Reset tooltip state at start of each frame
		resetTooltipFrame();

		if (currConfig.distributionDiagramToggle) {
			this.updateDistributionDiagram(this.getFullScreenBounds());
		} else if (currConfig.turnChartToggle) {
			this.updateTurnChart(this.getFullScreenBounds());
		} else if (currConfig.contributionCloudToggle) {
			this.updateContributionCloud(this.getFullScreenBounds());
		} else if (currConfig.wordRainToggle) {
			this.updateWordRain(this.getFullScreenBounds());
		} else if (currConfig.turnNetworkToggle) {
			this.updateTurnNetwork(this.getFullScreenBounds());
		} else if (currConfig.speakerHeatmapToggle) {
			this.updateSpeakerHeatmap(this.getFullScreenBounds());
		} else if (currConfig.turnLengthToggle) {
			this.updateTurnLengthDistribution(this.getFullScreenBounds());
		} else {
			this.drawDashboard();
		}

		// Hide tooltip if nothing requested it this frame
		finalizeTooltipFrame();
	}

	updateDistributionDiagram(pos: Bounds): void {
		const distributionDiagram = new DistributionDiagram(this.sk, pos);
		const { hoveredSpeaker, hoveredPetal } = distributionDiagram.draw(this.sk.dynamicData.getDynamicArrayForDistributionDiagram());
		ConfigStore.update((config) => ({
			...config,
			arrayOfFirstWords: distributionDiagram.localArrayOfFirstWords,
			hoveredSpeakerInDistributionDiagram: hoveredSpeaker,
			hoveredPetalData: hoveredPetal
		}));
		// Sync to EditorStore - only update highlightedSpeaker if filter is locked, otherwise update both
		EditorStore.update((state) => {
			if (isFilterLocked(state)) {
				return { ...state, selection: { ...state.selection, highlightedSpeaker: hoveredSpeaker } };
			}
			return {
				...state,
				selection: {
					...state.selection,
					highlightedSpeaker: hoveredSpeaker,
					filteredSpeaker: hoveredSpeaker,
					selectedTurnNumber: null,
					selectionSource: 'distributionDiagram'
				}
			};
		});
	}

	updateTurnChart(pos: Bounds): void {
		const isTimed = get(TranscriptStore).timingMode !== 'untimed';
		const showStrip = isTimed && pos.height > 80;

		const chartBounds: Bounds = showStrip
			? { ...pos, height: pos.height - ANNOTATION_STRIP_HEIGHT }
			: pos;

		const turnChart = new TurnChart(this.sk, chartBounds);
		turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
		const selectedTurn = turnChart.userSelectedTurn;

		let stripHover: DataPoint | null = null;
		if (showStrip) {
			const stripBounds: Bounds = {
				x: pos.x,
				y: pos.y + pos.height - ANNOTATION_STRIP_HEIGHT,
				width: pos.width,
				height: ANNOTATION_STRIP_HEIGHT
			};
			const annotations = new TurnChartAnnotations(this.sk, stripBounds);
			const { overlaps, gaps } = this.sk.dynamicData.getDynamicArrayForAnnotationStrip();
			stripHover = annotations.draw(overlaps, gaps);
		}

		const turnChartHover = (Array.isArray(selectedTurn?.turn) && selectedTurn.turn[0]) || null;
		const effectiveHover = turnChartHover ?? stripHover;

		ConfigStore.update((config) => ({
			...config,
			firstWordOfTurnSelectedInTurnChart: effectiveHover
		}));
		syncHoverToEditor(effectiveHover, 'turnChart');
	}

	updateContributionCloud(pos: Bounds): void {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord, hasOverflow } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		ConfigStore.update((config) => ({
			...config,
			selectedWordFromContributionCloud: hoveredWord,
			cloudHasOverflow: hasOverflow
		}));
		syncHoverToEditor(hoveredWord, 'contributionCloud');
	}

	updateWordRain(pos: Bounds): void {
		const wordRain = new WordRain(this.sk, pos);
		const { hoveredWord } = wordRain.draw(this.sk.dynamicData.getDynamicArrayForWordRain());
		ConfigStore.update((config) => ({ ...config, selectedWordFromWordRain: hoveredWord }));
		syncHoverToEditor(hoveredWord, 'wordRain');
	}

	updateTurnNetwork(pos: Bounds): void {
		const turnNetwork = new TurnNetwork(this.sk, pos);
		const { hoveredElement } = turnNetwork.draw(this.sk.dynamicData.getDynamicArrayForTurnNetwork());
		ConfigStore.update((config) => ({ ...config, selectedElementFromTurnNetwork: hoveredElement }));
		syncHoverToEditor(hoveredElement, 'turnNetwork');
	}

	updateSpeakerHeatmap(pos: Bounds): void {
		const { binnedData, speakers } = this.sk.dynamicData.getBinnedData(getBinCount(pos.width));
		const speakerHeatmap = new SpeakerHeatmap(this.sk, pos);
		const { hoveredCell } = speakerHeatmap.draw(binnedData, speakers);
		ConfigStore.update((config) => ({ ...config, selectedCellFromHeatmap: hoveredCell }));
		syncHoverToEditor(hoveredCell, 'speakerHeatmap');
	}

	updateTurnLengthDistribution(pos: Bounds): void {
		const viz = new TurnLengthDistribution(this.sk, pos);
		const { hoveredBar } = viz.draw(this.sk.dynamicData.getDynamicArrayForTurnLengthDistribution());
		ConfigStore.update((config) => ({ ...config, hoveredBarFromTurnLength: hoveredBar }));
		syncHoverToEditor(hoveredBar, 'turnLength');
	}

	drawDashboard(): void {
		const { top, bottomLeft, bottomRight } = this.getDashboardBounds();
		this.drawDashboardDividers(top, bottomLeft);
		this.updateTurnChart(top);
		this.updateContributionCloud(bottomRight);
		this.updateDistributionDiagram(bottomLeft);

		// Correct EditorStore selection: prioritize turn chart/cloud over diagram
		// (diagram runs last and overwrites, so we re-apply if needed)
		const turnChartWord = currConfig.firstWordOfTurnSelectedInTurnChart;
		const cloudWord = currConfig.selectedWordFromContributionCloud;
		if (turnChartWord) {
			syncHoverToEditor(turnChartWord, 'turnChart');
		} else if (cloudWord) {
			syncHoverToEditor(cloudWord, 'contributionCloud');
		}
	}

	drawDashboardDividers(top: Bounds, bottomLeft: Bounds): void {
		this.sk.stroke(200);
		this.sk.strokeWeight(2);
		const gap = this.sk.SPACING;
		const horizontalY = top.y + top.height + gap / 2;
		const verticalX = bottomLeft.x + bottomLeft.width + gap / 2;
		this.sk.line(0, horizontalY, this.sk.width, horizontalY);
		this.sk.line(verticalX, horizontalY, verticalX, this.sk.height);
	}

	getFullScreenBounds(): Bounds {
		const padding = this.sk.SPACING;
		return {
			x: padding,
			y: padding,
			width: this.sk.width - padding * 2,
			height: this.sk.height - padding * 2
		};
	}

	getDashboardBounds(): DashboardBounds {
		const padding = this.sk.SPACING / 2;
		const gap = this.sk.SPACING;
		const totalWidth = this.sk.width - padding * 2;
		const totalHeight = this.sk.height - padding * 2;
		const halfWidth = (totalWidth - gap) / 2;
		const halfHeight = (totalHeight - gap) / 2;

		return {
			top: {
				x: padding,
				y: padding,
				width: totalWidth,
				height: halfHeight
			},
			bottomLeft: {
				x: padding,
				y: padding + halfHeight + gap,
				width: halfWidth,
				height: halfHeight
			},
			bottomRight: {
				x: padding + halfWidth + gap,
				y: padding + halfHeight + gap,
				width: halfWidth,
				height: halfHeight
			}
		};
	}
}
