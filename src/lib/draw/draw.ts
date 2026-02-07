import type p5 from 'p5';
import type { DataPoint } from '../../models/dataPoint';
import { TurnChart } from './turn-chart';
import { ContributionCloud } from './contribution-cloud';
import { SpeakerGarden } from './speaker-garden';
import { SpeakerHeatmap } from './speaker-heatmap';
import { TurnNetwork } from './turn-network';
import { WordRain } from './word-rain';
import { TurnLengthDistribution } from './turn-length-distribution';
import { SpeakerFingerprint } from './speaker-fingerprint';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { resetTooltipFrame, finalizeTooltipFrame } from '../../stores/tooltipStore';
import type { Bounds } from './types/bounds';
import { CANVAS_SPACING } from '../constants/ui';

interface DrawResult {
	hover: DataPoint | null;
	hoveredSpeaker: string | null;
	arrayOfFirstWords: DataPoint[];
	overflowBounds: Bounds[];
	/** Panel key that produced the hover (for turn-level cross-highlight) */
	hoverSource?: string;
	/** Turn numbers involved in a turn-network edge hover */
	edgeTurns?: number[] | null;
}

const emptyResult: DrawResult = { hover: null, hoveredSpeaker: null, arrayOfFirstWords: [], overflowBounds: [] };

function result(overrides: Partial<DrawResult>): DrawResult {
	return { ...emptyResult, ...overrides };
}

let currConfig: ConfigStoreType;

ConfigStore.subscribe((data) => {
	currConfig = data;
});

/** Panels that produce turn-level (not just speaker-level) cross-highlighting */
const TURN_LEVEL_SOURCES = new Set(['turnChart', 'contributionCloud', 'speakerHeatmap']);

const TOGGLE_TO_PANEL: [keyof ConfigStoreType, string][] = [
	['speakerGardenToggle', 'speakerGarden'],
	['turnChartToggle', 'turnChart'],
	['contributionCloudToggle', 'contributionCloud'],
	['turnNetworkToggle', 'turnNetwork'],
	['wordRainToggle', 'wordRain'],
	['speakerHeatmapToggle', 'speakerHeatmap'],
	['turnLengthToggle', 'turnLength'],
	['speakerFingerprintToggle', 'speakerFingerprint']
];

export class Draw {
	sk: p5;

	constructor(sketch: p5) {
		this.sk = sketch;
	}

	drawViz(): void {
		resetTooltipFrame();

		let drawResult: DrawResult;
		const activePanel = TOGGLE_TO_PANEL.find(([toggle]) => currConfig[toggle]);

		if (activePanel) {
			drawResult = this.updatePanel(activePanel[1], this.getFullScreenBounds());
		} else {
			drawResult = this.drawDashboard();
		}

		this.applyDrawResult(drawResult, !activePanel);
		finalizeTooltipFrame();
	}

	/** Write draw results to stores. Single place for all store writes per frame. */
	applyDrawResult(r: DrawResult, isDashboard: boolean): void {
		// Compute cross-highlight fields for next frame
		let highlightSpeaker: string | null = null;
		let highlightTurn: number | null = null;
		let highlightTurns: number[] | null = null;

		if (isDashboard) {
			highlightSpeaker = r.hoveredSpeaker ?? null;
			if (r.edgeTurns && r.edgeTurns.length > 0) {
				// Edge hover in turn network: highlight specific turns, not speaker
				highlightTurns = r.edgeTurns;
				highlightSpeaker = null;
			} else if (highlightSpeaker && r.hoverSource && TURN_LEVEL_SOURCES.has(r.hoverSource) && r.hover) {
				highlightTurn = r.hover.turnNumber;
			}
		}

		ConfigStore.update((c) => ({
			...c,
			hoveredDataPoint: r.hover,
			overflowBounds: r.overflowBounds,
			arrayOfFirstWords: r.arrayOfFirstWords,
			hoveredSpeakerInGarden: r.hoveredSpeaker,
			dashboardHighlightSpeaker: highlightSpeaker,
			dashboardHighlightTurn: highlightTurn,
			dashboardHighlightAllTurns: highlightTurns
		}));
	}

	updatePanel(key: string, bounds: Bounds): DrawResult {
		switch (key) {
			case 'speakerGarden':
				return this.updateSpeakerGarden(bounds);
			case 'turnChart':
				return this.updateTurnChart(bounds);
			case 'contributionCloud':
				return this.updateContributionCloud(bounds);
			case 'turnNetwork':
				return this.updateTurnNetwork(bounds);
			case 'wordRain':
				return this.updateWordRain(bounds);
			case 'speakerHeatmap':
				return this.updateSpeakerHeatmap(bounds);
			case 'turnLength':
				return this.updateTurnLengthDistribution(bounds);
			case 'speakerFingerprint':
				return this.updateSpeakerFingerprint(bounds);
			default:
				return result({});
		}
	}

	updateSpeakerGarden(pos: Bounds): DrawResult {
		const garden = new SpeakerGarden(this.sk, pos);
		const { hoveredSpeaker } = garden.draw(this.sk.dynamicData.getDynamicArrayForSpeakerGarden());
		return result({ hoveredSpeaker, arrayOfFirstWords: garden.localArrayOfFirstWords });
	}

	updateTurnChart(pos: Bounds): DrawResult {
		const turnChart = new TurnChart(this.sk, pos);
		const { hoveredSpeaker } = turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
		return result({ hover: turnChart.userSelectedTurn.turn[0] ?? turnChart.annotationHover ?? null, hoveredSpeaker });
	}

	updateSpeakerHeatmap(pos: Bounds): DrawResult {
		const heatmap = new SpeakerHeatmap(this.sk, pos);
		const { hoveredCell, hoveredSpeaker } = heatmap.draw(this.sk.dynamicData.getProcessedWords(true));
		return result({ hover: hoveredCell, hoveredSpeaker });
	}

	updateTurnLengthDistribution(pos: Bounds): DrawResult {
		const viz = new TurnLengthDistribution(this.sk, pos);
		const { snippetPoints, hoveredSpeaker } = viz.draw(this.sk.dynamicData.getTurnSummaries());
		return result({ arrayOfFirstWords: snippetPoints, hoveredSpeaker });
	}

	updateTurnNetwork(pos: Bounds): DrawResult {
		const turnNetwork = new TurnNetwork(this.sk, pos);
		const { snippetPoints, hoveredSpeaker, edgeTurns } = turnNetwork.draw(this.sk.dynamicData.getDynamicArrayForTurnNetwork());
		return result({ arrayOfFirstWords: snippetPoints, hoveredSpeaker, edgeTurns });
	}

	updateWordRain(pos: Bounds): DrawResult {
		const wordRain = new WordRain(this.sk, pos);
		const { hoveredOccurrences, hoveredSpeaker, hasOverflow } = wordRain.draw(this.sk.dynamicData.getProcessedWords(true));
		return result({ arrayOfFirstWords: hoveredOccurrences, hoveredSpeaker, overflowBounds: hasOverflow ? [pos] : [] });
	}

	updateContributionCloud(pos: Bounds): DrawResult {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord, hasOverflow, hoveredSpeaker } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		return result({ hover: hoveredWord ?? null, overflowBounds: hasOverflow ? [pos] : [], hoveredSpeaker });
	}

	updateSpeakerFingerprint(pos: Bounds): DrawResult {
		const fingerprint = new SpeakerFingerprint(this.sk, pos);
		const { snippetPoints, hoveredSpeaker } = fingerprint.draw(this.sk.dynamicData.getSpeakerFingerprints());
		return result({ arrayOfFirstWords: snippetPoints, hoveredSpeaker });
	}

	drawDashboard(): DrawResult {
		const panels = currConfig.dashboardPanels;
		const boundsArray = this.getDashboardLayout(panels.length);
		this.drawDashboardDividers(boundsArray, panels.length);

		let mergedHover: DataPoint | null = null;
		let mergedHoveredSpeaker: string | null = null;
		let hoverSource: string | undefined;
		let mergedEdgeTurns: number[] | null | undefined;
		const mergedArrayOfFirstWords: DataPoint[] = [];
		const mergedOverflowBounds: Bounds[] = [];

		for (let i = 0; i < panels.length; i++) {
			const panelResult = this.updatePanel(panels[i], boundsArray[i]);
			const hasHover = panelResult.hover != null || panelResult.hoveredSpeaker != null;

			if (!hoverSource && hasHover) {
				hoverSource = panels[i];
			}
			mergedHover ??= panelResult.hover;
			mergedHoveredSpeaker ??= panelResult.hoveredSpeaker;
			mergedEdgeTurns ??= panelResult.edgeTurns;
			mergedArrayOfFirstWords.push(...panelResult.arrayOfFirstWords);
			mergedOverflowBounds.push(...panelResult.overflowBounds);
		}

		return {
			hover: mergedHover,
			hoveredSpeaker: mergedHoveredSpeaker,
			arrayOfFirstWords: mergedArrayOfFirstWords,
			overflowBounds: mergedOverflowBounds,
			hoverSource,
			edgeTurns: mergedEdgeTurns ?? null
		};
	}

	drawDashboardDividers(boundsArray: Bounds[], count: number): void {
		this.sk.stroke(200);
		this.sk.strokeWeight(2);
		const gap = CANVAS_SPACING;

		if (count === 2) {
			// Vertical divider between two side-by-side panels
			const verticalX = boundsArray[0].x + boundsArray[0].width + gap / 2;
			this.sk.line(verticalX, 0, verticalX, this.sk.height);
		} else if (count === 3) {
			// Horizontal divider below top panel + vertical divider in bottom half
			const horizontalY = boundsArray[0].y + boundsArray[0].height + gap / 2;
			const verticalX = boundsArray[1].x + boundsArray[1].width + gap / 2;
			this.sk.line(0, horizontalY, this.sk.width, horizontalY);
			this.sk.line(verticalX, horizontalY, verticalX, this.sk.height);
		} else if (count === 4) {
			// Cross: horizontal divider between rows + vertical divider between columns
			const horizontalY = boundsArray[0].y + boundsArray[0].height + gap / 2;
			const verticalX = boundsArray[0].x + boundsArray[0].width + gap / 2;
			this.sk.line(0, horizontalY, this.sk.width, horizontalY);
			this.sk.line(verticalX, 0, verticalX, this.sk.height);
		}
	}

	/**
	 * Get bounds for full screen visualization.
	 * Returns { x, y, width, height } where x,y is top-left and width,height are dimensions.
	 */
	getFullScreenBounds(): Bounds {
		const padding = CANVAS_SPACING;
		return {
			x: padding,
			y: padding,
			width: this.sk.width - padding * 2,
			height: this.sk.height - padding * 2
		};
	}

	/**
	 * Get bounds for dashboard layout with variable panel count.
	 * 2 panels: side-by-side
	 * 3 panels: 1 top full-width + 2 bottom
	 * 4 panels: 2x2 grid
	 */
	getDashboardLayout(count: number): Bounds[] {
		const padding = CANVAS_SPACING / 2;
		const gap = CANVAS_SPACING;
		const totalWidth = this.sk.width - padding * 2;
		const totalHeight = this.sk.height - padding * 2;
		const halfWidth = (totalWidth - gap) / 2;
		const halfHeight = (totalHeight - gap) / 2;

		if (count === 2) {
			return [
				{ x: padding, y: padding, width: halfWidth, height: totalHeight },
				{ x: padding + halfWidth + gap, y: padding, width: halfWidth, height: totalHeight }
			];
		} else if (count === 4) {
			return [
				{ x: padding, y: padding, width: halfWidth, height: halfHeight },
				{ x: padding + halfWidth + gap, y: padding, width: halfWidth, height: halfHeight },
				{ x: padding, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight },
				{ x: padding + halfWidth + gap, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight }
			];
		} else {
			// 3 panels (default): top full-width + 2 bottom
			return [
				{ x: padding, y: padding, width: totalWidth, height: halfHeight },
				{ x: padding, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight },
				{ x: padding + halfWidth + gap, y: padding + halfHeight + gap, width: halfWidth, height: halfHeight }
			];
		}
	}
}
