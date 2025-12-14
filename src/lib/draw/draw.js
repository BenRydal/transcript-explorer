import { TurnChart } from './turn-chart.js';
import { ContributionCloud } from './contribution-cloud.js';
import { DistributionDiagram } from './distribution-diagram.js';
import ConfigStore from '../../stores/configStore';
import EditorStore from '../../stores/editorStore';
import { resetTooltipFrame, finalizeTooltipFrame } from '../../stores/tooltipStore';

let currConfig;

ConfigStore.subscribe((data) => {
	currConfig = data;
});

// Helper to check if speaker filter is locked
const isFilterLocked = (state) => state.selection.selectionSource === 'distributionDiagramClick';

// Helper to update editor selection while preserving locked filter
const updateEditorSelection = (updates, source) => {
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
	constructor(sketch) {
		this.sk = sketch;
	}

	drawViz() {
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

	updateDistributionDiagram(pos) {
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
					selectedWordIndex: null,
					selectionSource: 'distributionDiagram'
				}
			};
		});
	}

	updateTurnChart(pos) {
		const turnChart = new TurnChart(this.sk, pos);
		turnChart.draw(this.sk.dynamicData.getDynamicArrayForTurnChart());
		const selectedTurn = turnChart.userSelectedTurn;
		ConfigStore.update((config) => ({
			...config,
			firstWordOfTurnSelectedInTurnChart: selectedTurn.turn[0]
		}));
		updateEditorSelection({
			selectedTurnNumber: selectedTurn?.turn?.[0]?.turnNumber ?? null,
			highlightedSpeaker: null,
			selectedWordIndex: null
		}, 'turnChart');
	}

	updateContributionCloud(pos) {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		ConfigStore.update((config) => ({
			...config,
			selectedWordFromContributionCloud: hoveredWord
		}));
		updateEditorSelection({
			selectedTurnNumber: hoveredWord?.turnNumber ?? null,
			highlightedSpeaker: null,
			selectedWordIndex: null
		}, 'contributionCloud');
	}

	drawDashboard() {
		const { top, bottomLeft, bottomRight } = this.getDashboardBounds();
		this.drawDashboardDividers(top, bottomLeft);
		this.updateTurnChart(top);
		this.updateContributionCloud(bottomRight);
		this.updateDistributionDiagram(bottomLeft); // draw last to display dd text over other visualizations
	}

	drawDashboardDividers(top, bottomLeft) {
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
	getFullScreenBounds() {
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
	getDashboardBounds() {
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
