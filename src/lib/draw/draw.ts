import type p5 from 'p5';
import type { DataPoint } from '../../models/dataPoint';
import { TurnChart } from './turn-chart';
import { ContributionCloud } from './contribution-cloud';
import { DistributionDiagram } from './distribution-diagram';
import { SpeakerHeatmap } from './speaker-heatmap';
import { TurnNetwork } from './turn-network';
import { WordRain } from './word-rain';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import { resetTooltipFrame, finalizeTooltipFrame } from '../../stores/tooltipStore';
import type { Bounds, DashboardBounds } from './types/bounds';

interface DrawResult {
	hover: DataPoint | null;
	hoveredSpeaker: string | null;
	arrayOfFirstWords: DataPoint[];
	cloudHasOverflow: boolean;
}

let currConfig: ConfigStoreType;

ConfigStore.subscribe((data) => {
	currConfig = data;
});

export class Draw {
	sk: p5;
	// Previous frame's cloud hover, used for turn chart cross-highlighting in dashboard (1-frame lag)
	private prevCloudHover: DataPoint | null = null;

	constructor(sketch: p5) {
		this.sk = sketch;
	}

	drawViz(): void {
		resetTooltipFrame();

		let result: DrawResult;

		if (currConfig.distributionDiagramToggle) {
			result = this.updateDistributionDiagram(this.getFullScreenBounds());
		} else if (currConfig.turnChartToggle) {
			result = this.updateTurnChart(this.getFullScreenBounds());
		} else if (currConfig.contributionCloudToggle) {
			result = this.updateContributionCloud(this.getFullScreenBounds());
		} else if (currConfig.turnNetworkToggle) {
			result = this.updateTurnNetwork(this.getFullScreenBounds());
		} else if (currConfig.wordRainToggle) {
			result = this.updateWordRain(this.getFullScreenBounds());
		} else if (currConfig.speakerHeatmapToggle) {
			result = this.updateSpeakerHeatmap(this.getFullScreenBounds());
		} else {
			result = this.drawDashboard();
		}

		this.applyDrawResult(result);
		finalizeTooltipFrame();
	}

	/** Write draw results to stores. Single place for all store writes in non-dashboard mode. */
	applyDrawResult(result: DrawResult): void {
		ConfigStore.update((c) => ({
			...c,
			hoveredDataPoint: result.hover,
			cloudHasOverflow: result.cloudHasOverflow,
			arrayOfFirstWords: result.arrayOfFirstWords,
			hoveredSpeakerInDistributionDiagram: result.hoveredSpeaker
		}));
	}

	updateDistributionDiagram(pos: Bounds): DrawResult {
		const distributionDiagram = new DistributionDiagram(this.sk, pos);
		const { hoveredSpeaker } = distributionDiagram.draw(this.sk.dynamicData.getDynamicArrayForDistributionDiagram());
		return {
			hover: null,
			hoveredSpeaker,
			arrayOfFirstWords: distributionDiagram.localArrayOfFirstWords,
			cloudHasOverflow: false
		};
	}

	updateTurnChart(pos: Bounds): DrawResult {
		const turnChart = new TurnChart(this.sk, pos);
		turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
		return {
			hover: turnChart.userSelectedTurn.turn[0] ?? turnChart.annotationHover ?? null,
			hoveredSpeaker: null,
			arrayOfFirstWords: [],
			cloudHasOverflow: false
		};
	}

	updateSpeakerHeatmap(pos: Bounds): DrawResult {
		const heatmap = new SpeakerHeatmap(this.sk, pos);
		const { hoveredCell } = heatmap.draw(this.sk.dynamicData.getProcessedWords(true));
		return {
			hover: hoveredCell,
			hoveredSpeaker: null,
			arrayOfFirstWords: [],
			cloudHasOverflow: false
		};
	}

	updateTurnNetwork(pos: Bounds): DrawResult {
		const turnNetwork = new TurnNetwork(this.sk, pos);
		const { snippetPoints } = turnNetwork.draw(this.sk.dynamicData.getDynamicArrayForTurnNetwork());
		return {
			hover: null,
			hoveredSpeaker: null,
			arrayOfFirstWords: snippetPoints,
			cloudHasOverflow: false
		};
	}

	updateWordRain(pos: Bounds): DrawResult {
		const wordRain = new WordRain(this.sk, pos);
		const { hoveredOccurrences } = wordRain.draw(this.sk.dynamicData.getProcessedWords(true));
		return {
			hover: null,
			hoveredSpeaker: null,
			arrayOfFirstWords: hoveredOccurrences,
			cloudHasOverflow: false
		};
	}

	updateContributionCloud(pos: Bounds): DrawResult {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord, hasOverflow } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		return {
			hover: hoveredWord ?? null,
			hoveredSpeaker: null,
			arrayOfFirstWords: [],
			cloudHasOverflow: hasOverflow
		};
	}

	drawDashboard(): DrawResult {
		const { top, bottomLeft, bottomRight } = this.getDashboardBounds();
		this.drawDashboardDividers(top, bottomLeft);

		// Seed hoveredDataPoint with previous frame's cloud hover for cross-highlighting
		ConfigStore.update((c) => ({ ...c, hoveredDataPoint: this.prevCloudHover }));
		const turnResult = this.updateTurnChart(top);

		// Write turn hover so cloud can cross-highlight
		ConfigStore.update((c) => ({ ...c, hoveredDataPoint: turnResult.hover }));
		const cloudResult = this.updateContributionCloud(bottomRight);

		// Write cloud hover so distribution diagram can cross-highlight
		ConfigStore.update((c) => ({ ...c, hoveredDataPoint: cloudResult.hover }));
		const diagramResult = this.updateDistributionDiagram(bottomLeft);

		this.prevCloudHover = cloudResult.hover;

		return {
			hover: turnResult.hover ?? cloudResult.hover,
			hoveredSpeaker: diagramResult.hoveredSpeaker,
			arrayOfFirstWords: diagramResult.arrayOfFirstWords,
			cloudHasOverflow: cloudResult.cloudHasOverflow
		};
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

	/**
	 * Get bounds for full screen visualization.
	 * Returns { x, y, width, height } where x,y is top-left and width,height are dimensions.
	 */
	getFullScreenBounds(): Bounds {
		const padding = this.sk.SPACING;
		return {
			x: padding,
			y: padding,
			width: this.sk.width - padding * 2,
			height: this.sk.height - padding * 2
		};
	}

	/**
	 * Get bounds for dashboard layout (3 panels).
	 * Returns { top, bottomLeft, bottomRight } each with { x, y, width, height }.
	 */
	getDashboardBounds(): DashboardBounds {
		const padding = this.sk.SPACING / 2; // Less padding for dashboard panels
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
