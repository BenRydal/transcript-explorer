import type p5 from 'p5';
import type { DataPoint } from '../../models/dataPoint';
import { TurnChart } from './turn-chart';
import { ContributionCloud } from './contribution-cloud';
import { DistributionDiagram } from './distribution-diagram';
import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
import EditorStore, { type EditorState, type EditorSelection } from '../../stores/editorStore';
import { resetTooltipFrame, finalizeTooltipFrame } from '../../stores/tooltipStore';
import type { Bounds, DashboardBounds } from './types/bounds';

type SelectionSource = EditorSelection['selectionSource'];

let currConfig: ConfigStoreType;

ConfigStore.subscribe((data) => {
	currConfig = data;
});

// Helper to check if speaker filter is locked
const isFilterLocked = (state: EditorState): boolean => state.selection.selectionSource === 'visualizationClick';

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

export class Draw {
	sk: p5;
	// Previous frame's cloud hover, used for turn chart cross-highlighting in dashboard (1-frame lag)
	private prevCloudHover: DataPoint | null = null;

	constructor(sketch: p5) {
		this.sk = sketch;
	}

	drawViz(): void {
		resetTooltipFrame();

		let hover: DataPoint | null = null;

		if (currConfig.distributionDiagramToggle) {
			this.updateDistributionDiagram(this.getFullScreenBounds());
		} else if (currConfig.turnChartToggle) {
			hover = this.updateTurnChart(this.getFullScreenBounds());
		} else if (currConfig.contributionCloudToggle) {
			hover = this.updateContributionCloud(this.getFullScreenBounds());
		} else {
			hover = this.drawDashboard();
		}

		this.syncHoverState(hover);
		finalizeTooltipFrame();
	}

	/** Write the final hover state to stores. Single owner of hoveredDataPoint + editor selection. */
	syncHoverState(hover: DataPoint | null): void {
		ConfigStore.update((c) => ({ ...c, hoveredDataPoint: hover }));
		if (hover) {
			updateEditorSelection(
				{ selectedTurnNumber: hover.turnNumber, highlightedSpeaker: null },
				'visualization'
			);
		}
	}

	updateDistributionDiagram(pos: Bounds): void {
		const distributionDiagram = new DistributionDiagram(this.sk, pos);
		const { hoveredSpeaker } = distributionDiagram.draw(this.sk.dynamicData.getDynamicArrayForDistributionDiagram());
		ConfigStore.update((config) => ({
			...config,
			arrayOfFirstWords: distributionDiagram.localArrayOfFirstWords,
			hoveredSpeakerInDistributionDiagram: hoveredSpeaker
		}));
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
					selectionSource: 'visualization'
				}
			};
		});
	}

	/** Draw turn chart and return hovered data point. Writes to ConfigStore for dashboard cross-highlighting. */
	updateTurnChart(pos: Bounds): DataPoint | null {
		const turnChart = new TurnChart(this.sk, pos);
		turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
		const hover = turnChart.userSelectedTurn.turn[0] ?? null;
		ConfigStore.update((config) => ({ ...config, hoveredDataPoint: hover }));
		return hover;
	}

	/** Draw contribution cloud and return hovered data point. Writes to ConfigStore for dashboard cross-highlighting. */
	updateContributionCloud(pos: Bounds): DataPoint | null {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord, hasOverflow } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		ConfigStore.update((config) => ({ ...config, hoveredDataPoint: hoveredWord, cloudHasOverflow: hasOverflow }));
		return hoveredWord ?? null;
	}

	drawDashboard(): DataPoint | null {
		const { top, bottomLeft, bottomRight } = this.getDashboardBounds();
		this.drawDashboardDividers(top, bottomLeft);
		// Use previous frame's cloud hover so turn chart cross-highlights from cloud
		// without reading its own hover back (which would cause self-filtering)
		ConfigStore.update((c) => ({ ...c, hoveredDataPoint: this.prevCloudHover }));
		const turnHover = this.updateTurnChart(top);
		const cloudHover = this.updateContributionCloud(bottomRight);
		this.updateDistributionDiagram(bottomLeft);
		this.prevCloudHover = cloudHover;
		return turnHover ?? cloudHover;
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
