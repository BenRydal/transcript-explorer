import type p5 from 'p5';
import { TurnChart } from './turn-chart';
import { ContributionCloud } from './contribution-cloud';
import { DistributionDiagram } from './distribution-diagram.js';
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
		} else {
			this.drawDashboard();
		}

		// Hide tooltip if nothing requested it this frame
		finalizeTooltipFrame();
	}

	updateDistributionDiagram(pos: Bounds): void {
		const distributionDiagram = new DistributionDiagram(this.sk, pos);
		const { hoveredSpeaker } = distributionDiagram.draw(this.sk.dynamicData.getDynamicArrayForDistributionDiagram());
		ConfigStore.update((config) => ({
			...config,
			arrayOfFirstWords: distributionDiagram.localArrayOfFirstWords,
			hoveredSpeakerInDistributionDiagram: hoveredSpeaker
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
		const turnChart = new TurnChart(this.sk, pos);
		turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
		const selectedTurn = turnChart.userSelectedTurn;
		ConfigStore.update((config) => ({
			...config,
			firstWordOfTurnSelectedInTurnChart: selectedTurn.turn[0]
		}));
		updateEditorSelection({
			selectedTurnNumber: selectedTurn?.turn?.[0]?.turnNumber ?? null,
			highlightedSpeaker: null
		}, 'turnChart');
	}

	updateContributionCloud(pos: Bounds): void {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		ConfigStore.update((config) => ({
			...config,
			selectedWordFromContributionCloud: hoveredWord
		}));
		updateEditorSelection({
			selectedTurnNumber: hoveredWord?.turnNumber ?? null,
			highlightedSpeaker: null
		}, 'contributionCloud');
	}

	drawDashboard(): void {
		const { top, bottomLeft, bottomRight } = this.getDashboardBounds();
		this.drawDashboardDividers(top, bottomLeft);
		this.updateTurnChart(top);
		this.updateContributionCloud(bottomRight);
		this.updateDistributionDiagram(bottomLeft); // draw last to display dd text over other visualizations
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
