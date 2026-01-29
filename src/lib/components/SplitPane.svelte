<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		orientation?: 'horizontal' | 'vertical';
		sizes?: [number, number];
		minSize?: number;
		collapsed?: boolean;
		collapsedPanel?: 'first' | 'second';
		first?: Snippet;
		second?: Snippet;
		ondragstart?: () => void;
		ondragend?: () => void;
		onresize?: (data: { sizes: [number, number] }) => void;
	}

	let {
		orientation = 'vertical',
		sizes = $bindable<[number, number]>([60, 40]),
		minSize = 100,
		collapsed = false,
		collapsedPanel = 'second',
		first,
		second,
		ondragstart,
		ondragend,
		onresize
	}: Props = $props();

	let container: HTMLElement;
	let isDragging = $state(false);
	let startPos = $state(0);
	let startSizes: [number, number] = $state([...sizes]);

	let flexDirection = $derived(orientation === 'vertical' ? 'column' : 'row');
	let cursorStyle = $derived(orientation === 'vertical' ? 'row-resize' : 'col-resize');

	function getContainerSize(): number {
		if (!container) return 0;
		return orientation === 'vertical' ? container.offsetHeight : container.offsetWidth;
	}

	function handleMouseDown(event: MouseEvent) {
		if (collapsed) return;
		isDragging = true;
		startPos = orientation === 'vertical' ? event.clientY : event.clientX;
		startSizes = [...sizes];
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		document.body.style.cursor = cursorStyle;
		document.body.style.userSelect = 'none';
		ondragstart?.();
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;

		const currentPos = orientation === 'vertical' ? event.clientY : event.clientX;
		const delta = currentPos - startPos;
		const containerSize = getContainerSize();

		if (containerSize === 0) return;

		const deltaPercent = (delta / containerSize) * 100;
		let newFirstSize = startSizes[0] + deltaPercent;
		let newSecondSize = startSizes[1] - deltaPercent;

		// Calculate minimum percentage based on minSize
		const minPercent = (minSize / containerSize) * 100;

		// Clamp values
		if (newFirstSize < minPercent) {
			newFirstSize = minPercent;
			newSecondSize = 100 - minPercent;
		} else if (newSecondSize < minPercent) {
			newSecondSize = minPercent;
			newFirstSize = 100 - minPercent;
		}

		sizes = [newFirstSize, newSecondSize];
		onresize?.({ sizes });
	}

	function handleMouseUp() {
		isDragging = false;
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		ondragend?.();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (collapsed) return;

		const step = 2; // percentage step for keyboard resize
		let newSizes = [...sizes] as [number, number];

		if (orientation === 'vertical') {
			if (event.key === 'ArrowUp') {
				newSizes[0] = Math.max(10, sizes[0] - step);
				newSizes[1] = 100 - newSizes[0];
			} else if (event.key === 'ArrowDown') {
				newSizes[0] = Math.min(90, sizes[0] + step);
				newSizes[1] = 100 - newSizes[0];
			}
		} else {
			if (event.key === 'ArrowLeft') {
				newSizes[0] = Math.max(10, sizes[0] - step);
				newSizes[1] = 100 - newSizes[0];
			} else if (event.key === 'ArrowRight') {
				newSizes[0] = Math.min(90, sizes[0] + step);
				newSizes[1] = 100 - newSizes[0];
			}
		}

		if (newSizes[0] !== sizes[0]) {
			sizes = newSizes;
			onresize?.({ sizes });
		}
	}

	onDestroy(() => {
		if (typeof document !== 'undefined') {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		}
	});
</script>

<div class="split-pane" bind:this={container} style="flex-direction: {flexDirection};">
	<div
		class="split-pane-panel first-panel"
		style="{orientation === 'vertical' ? 'height' : 'width'}: {collapsed && collapsedPanel === 'first' ? '0%' : collapsed ? '100%' : sizes[0] + '%'};"
	>
		{@render first?.()}
	</div>

	{#if !collapsed}
		<div
			class="split-pane-divider"
			class:vertical={orientation === 'vertical'}
			class:horizontal={orientation === 'horizontal'}
			class:dragging={isDragging}
			role="separator"
			tabindex="0"
			aria-orientation={orientation}
			aria-valuenow={Math.round(sizes[0])}
			aria-valuemin="10"
			aria-valuemax="90"
			onmousedown={handleMouseDown}
			onkeydown={handleKeyDown}
		>
			<div class="divider-handle"></div>
		</div>
	{/if}

	<div
		class="split-pane-panel second-panel"
		style="{orientation === 'vertical' ? 'height' : 'width'}: {collapsed && collapsedPanel === 'second'
			? '0%'
			: collapsed
				? '100%'
				: sizes[1] + '%'};"
	>
		{@render second?.()}
	</div>
</div>

<style>
	.split-pane {
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.split-pane-panel {
		overflow: hidden;
		position: relative;
	}

	.first-panel {
		flex-shrink: 0;
	}

	.second-panel {
		flex-grow: 1;
		min-height: 0;
		min-width: 0;
	}

	.split-pane-divider {
		flex-shrink: 0;
		background-color: #e5e7eb;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.15s;
	}

	.split-pane-divider:hover,
	.split-pane-divider.dragging {
		background-color: #d1d5db;
	}

	.split-pane-divider:focus {
		outline: 2px solid #3b82f6;
		outline-offset: -2px;
	}

	.split-pane-divider.vertical {
		width: 100%;
		height: 8px;
		cursor: row-resize;
	}

	.split-pane-divider.horizontal {
		width: 8px;
		height: 100%;
		cursor: col-resize;
	}

	.divider-handle {
		background-color: #9ca3af;
		border-radius: 2px;
	}

	.vertical .divider-handle {
		width: 40px;
		height: 4px;
	}

	.horizontal .divider-handle {
		width: 4px;
		height: 40px;
	}

	.split-pane-divider:hover .divider-handle,
	.split-pane-divider.dragging .divider-handle {
		background-color: #6b7280;
	}
</style>
