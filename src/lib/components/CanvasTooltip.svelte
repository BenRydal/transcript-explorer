<script lang="ts">
	import { tick } from 'svelte';
	import TooltipStore from '../../stores/tooltipStore';
	import { getP5ContainerRect, clamp } from '../core/layout-utils';

	const EDGE_PADDING = 20;
	const MAX_PREVIEW_WORDS = 100;

	// Truncate long plain-text content; HTML-structured content is already
	// truncated by the visualization so we leave it alone.
	function formatContent(content: string): string {
		if (content.includes('<')) return content;
		const words = content.split(/\s+/).filter((w) => w.length > 0);
		if (words.length <= MAX_PREVIEW_WORDS) return content;
		return `${words.slice(0, MAX_PREVIEW_WORDS).join(' ')}... (${words.length} words)`;
	}

	// Gap in px between the mouse pointer and the nearest edge of the tooltip.
	const POINTER_GAP = 20;

	let displayContent = $derived(formatContent($TooltipStore.content));

	// Get the p5 container for positioning relative to it
	let containerRect: DOMRect | null = $state(null);
	let tooltipEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if ($TooltipStore.visible) {
			containerRect = getP5ContainerRect();
		}
	});

	// Resolved placement, computed after measuring the rendered tooltip so it can
	// never spill past any container edge. `measured` gates visibility so the very
	// first frame (before we know the tooltip's size) isn't painted at a stale spot.
	let left = $state(0);
	let top = $state(0);
	let arrowLeftPx = $state(0);
	let arrowSide: 'above' | 'below' = $state('above');
	let measured = $state(false);

	// Cap width/height so an unusually large tooltip stays inside the container
	// (e.g. a long tooltip in a narrow split-pane, or a short viewport). These are
	// derived from the container so the cap is applied to the DOM *before* we
	// measure below — otherwise the measured width would ignore the constraint.
	const TOOLTIP_MAX_WIDTH = 500;
	let maxWidth = $derived.by(() => {
		const rect = containerRect;
		if (!rect) return TOOLTIP_MAX_WIDTH;
		return Math.min(TOOLTIP_MAX_WIDTH, rect.width - 2 * EDGE_PADDING);
	});
	let maxHeight = $derived.by(() => {
		const rect = containerRect;
		if (!rect) return 0;
		return rect.height - 2 * EDGE_PADDING;
	});

	// Re-hide (and re-measure) whenever the tooltip is dismissed.
	$effect(() => {
		if (!$TooltipStore.visible) measured = false;
	});

	// Measure the actual rendered tooltip, then clamp it fully on-screen on both
	// axes. Depends on x/y/content + containerRect so it recomputes as the pointer
	// moves or the content changes.
	$effect(() => {
		if (!$TooltipStore.visible || !containerRect) return;
		const { x, y, position } = $TooltipStore;
		const rect = containerRect;

		tick().then(() => {
			if (!tooltipEl || !$TooltipStore.visible) return;

			const cw = rect.width;
			const ch = rect.height;
			const tw = tooltipEl.offsetWidth;
			const th = tooltipEl.offsetHeight;

			// Horizontal: center on the pointer, then clamp within the padding.
			const maxLeft = Math.max(EDGE_PADDING, cw - tw - EDGE_PADDING);
			const resolvedLeft = clamp(x - tw / 2, EDGE_PADDING, maxLeft);

			// Vertical: honour the requested side when it fits, otherwise flip, then
			// clamp as a last resort (very tall tooltip / very short container).
			const fitsAbove = y - POINTER_GAP - th >= EDGE_PADDING;
			const fitsBelow = y + POINTER_GAP + th <= ch - EDGE_PADDING;
			let side: 'above' | 'below';
			if (position === 'above') side = fitsAbove || !fitsBelow ? 'above' : 'below';
			else side = fitsBelow || !fitsAbove ? 'below' : 'above';

			const maxTop = Math.max(EDGE_PADDING, ch - th - EDGE_PADDING);
			const rawTop = side === 'above' ? y - POINTER_GAP - th : y + POINTER_GAP;
			const resolvedTop = clamp(rawTop, EDGE_PADDING, maxTop);

			left = resolvedLeft;
			top = resolvedTop;
			arrowSide = side;
			// Point the arrow at the pointer, kept within the tooltip's own width.
			arrowLeftPx = clamp(x - resolvedLeft, 12, Math.max(12, tw - 12));
			measured = true;
		});
	});

	let containerStyle = $derived(`left: ${left}px; top: ${top}px; max-width: ${maxWidth}px; visibility: ${measured ? 'visible' : 'hidden'};`);
</script>

{#if $TooltipStore.visible}
	<div class="canvas-tooltip" style={containerStyle} bind:this={tooltipEl}>
		<div class="tooltip-content" style="border-color: {$TooltipStore.speakerColor}; max-height: {maxHeight ? `${maxHeight}px` : 'none'}">
			<p style="color: {$TooltipStore.speakerColor}">{@html displayContent}</p>
		</div>
		<div
			class="tooltip-arrow"
			class:arrow-up={arrowSide === 'below'}
			class:arrow-down={arrowSide === 'above'}
			style="left: {arrowLeftPx}px; border-bottom-color: {arrowSide === 'below'
				? $TooltipStore.speakerColor
				: 'transparent'}; border-top-color: {arrowSide === 'above' ? $TooltipStore.speakerColor : 'transparent'};"
		></div>
	</div>
{/if}

<style>
	.canvas-tooltip {
		position: absolute;
		z-index: 1000;
		pointer-events: none;
		width: max-content;
		max-width: 500px;
		min-width: 150px;
	}

	.tooltip-content {
		background: rgba(255, 255, 255, 0.95);
		border: 2px solid;
		border-radius: 8px;
		padding: 10px 14px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		/* Keeps an unusually tall tooltip from spilling past the container; the
		   max-height cap is applied inline from the measured container height. */
		overflow: hidden;
	}

	.tooltip-content p {
		margin: 0;
		font-size: 22px;
		line-height: 1.4;
		word-wrap: break-word;
		white-space: pre-wrap;
	}

	.tooltip-arrow {
		position: absolute;
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
