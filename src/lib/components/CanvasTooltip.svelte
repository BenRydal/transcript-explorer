<script lang="ts">
	import TooltipStore from '../../stores/tooltipStore';

	const TOOLTIP_MAX_WIDTH = 350;
	const EDGE_PADDING = 20;

	// Get the p5 container for positioning relative to it
	let containerRect: DOMRect | null = null;

	$: if ($TooltipStore.visible) {
		const container = document.getElementById('p5-container');
		if (container) {
			containerRect = container.getBoundingClientRect();
		}
	}

	// Calculate tooltip position with edge detection
	$: tooltipStyle = (() => {
		if (!containerRect || !$TooltipStore.visible) return '';

		const { x, y, position } = $TooltipStore;
		const containerWidth = containerRect.width;

		// Default: center on mouse
		let left = x;
		let translateX = '-50%';

		// Only adjust if tooltip would go off-screen
		// Estimate tooltip taking up half its max width on each side
		const halfWidth = TOOLTIP_MAX_WIDTH / 2;

		if (x < halfWidth + EDGE_PADDING) {
			// Too close to left edge - anchor to left
			left = EDGE_PADDING;
			translateX = '0';
		} else if (x > containerWidth - halfWidth - EDGE_PADDING) {
			// Too close to right edge - anchor to right
			left = containerWidth - EDGE_PADDING;
			translateX = '-100%';
		}

		// Vertical position
		let top: number;
		if (position === 'below') {
			top = y + 20;
		} else {
			top = y - 20;
		}

		const translateY = position === 'above' ? 'translateY(-100%)' : '';

		return `
			left: ${left}px;
			top: ${top}px;
			transform: translateX(${translateX}) ${translateY};
		`;
	})();
</script>

{#if $TooltipStore.visible}
	<div
		class="canvas-tooltip"
		style={tooltipStyle}
	>
		<div class="tooltip-content" style="border-color: {$TooltipStore.speakerColor}">
			<p style="color: {$TooltipStore.speakerColor}">{$TooltipStore.content}</p>
		</div>
		<div
			class="tooltip-arrow"
			class:arrow-up={$TooltipStore.position === 'below'}
			class:arrow-down={$TooltipStore.position === 'above'}
			style="border-bottom-color: {$TooltipStore.position === 'below' ? $TooltipStore.speakerColor : 'transparent'}; border-top-color: {$TooltipStore.position === 'above' ? $TooltipStore.speakerColor : 'transparent'};"
		/>
	</div>
{/if}

<style>
	.canvas-tooltip {
		position: absolute;
		z-index: 1000;
		pointer-events: none;
		max-width: 350px;
	}

	.tooltip-content {
		background: rgba(255, 255, 255, 0.95);
		border: 2px solid;
		border-radius: 8px;
		padding: 10px 14px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.tooltip-content p {
		margin: 0;
		font-size: 22px;
		line-height: 1.4;
		word-wrap: break-word;
	}

	.tooltip-arrow {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
	}

	.arrow-up {
		top: -8px;
		border-bottom: 8px solid;
	}

	.arrow-down {
		bottom: -8px;
		border-top: 8px solid;
	}
</style>
