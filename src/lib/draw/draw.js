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
		ConfigStore.update((currConfig) => {
			return {
				...currConfig,
				arrayOfFirstWords: distributionDiagram.localArrayOfFirstWords,
				hoveredSpeakerInDistributionDiagram: hoveredSpeaker
			};
		});
		// Sync to EditorStore for transcript editor filtering (only update hover state, not locked filter)
		EditorStore.update((state) => {
			// Don't override locked filter from click
			if (state.selection.selectionSource === 'distributionDiagramClick') {
				return {
					...state,
					selection: {
						...state.selection,
						highlightedSpeaker: hoveredSpeaker
					}
				};
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
		ConfigStore.update((currConfig) => {
			return { ...currConfig, firstWordOfTurnSelectedInTurnChart: selectedTurn.turn[0] };
		});
		// Sync to EditorStore for transcript editor highlighting (preserve locked filter)
		const turnNumber = selectedTurn?.turn?.[0]?.turnNumber ?? null;
		EditorStore.update((state) => {
			const isLocked = state.selection.selectionSource === 'distributionDiagramClick';
			return {
				...state,
				selection: {
					...state.selection,
					selectedTurnNumber: turnNumber,
					highlightedSpeaker: null,
					filteredSpeaker: isLocked ? state.selection.filteredSpeaker : null,
					selectedWordIndex: null,
					selectionSource: isLocked ? state.selection.selectionSource : 'turnChart'
				}
			};
		});
	}

	updateContributionCloud(pos) {
		const contributionCloud = new ContributionCloud(this.sk, pos);
		const { hoveredWord } = contributionCloud.draw(this.sk.dynamicData.getDynamicArraySortedForContributionCloud());
		ConfigStore.update((currConfig) => {
			return { ...currConfig, selectedWordFromContributionCloud: hoveredWord };
		});
		// Sync to EditorStore for transcript editor highlighting (preserve locked filter)
		EditorStore.update((state) => {
			const isLocked = state.selection.selectionSource === 'distributionDiagramClick';
			return {
				...state,
				selection: {
					...state.selection,
					selectedTurnNumber: hoveredWord?.turnNumber ?? null,
					highlightedSpeaker: null,
					filteredSpeaker: isLocked ? state.selection.filteredSpeaker : null,
					selectedWordIndex: null,
					selectionSource: isLocked ? state.selection.selectionSource : 'contributionCloud'
				}
			};
		});
	}

	drawDashboard() {
		const { top, bottomLeft, bottomRight } = this.getDashboardBounds();
		this.drawDashboardDividers(top, bottomLeft, bottomRight);
		this.updateTurnChart(top);
		this.updateContributionCloud(bottomRight);
		this.updateDistributionDiagram(bottomLeft); // draw last to display dd text over other visualizations
	}

	drawDashboardDividers(top, bottomLeft, bottomRight) {
		this.sk.stroke(200);
		this.sk.strokeWeight(2);
		const gap = this.sk.SPACING;
		const horizontalY = top.y + top.height + gap / 2;
		const verticalX = bottomLeft.x + bottomLeft.width + gap / 2;
		// Horizontal divider between top and bottom (edge to edge)
		this.sk.line(0, horizontalY, this.sk.width, horizontalY);
		// Vertical divider between bottom left and right (from horizontal divider to bottom)
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
