<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let min = 0;
	export let max = 100;
	export let leftValue = 0;
	export let rightValue = 100;
	export let progressValue: number | null = null;

	const dispatch = createEventDispatcher<{ change: { left: number; right: number } }>();

	let track: HTMLDivElement;
	let dragging: 'left' | 'right' | 'range' | null = null;
	let dragStartX = 0;
	let dragStartLeft = 0;
	let dragStartRight = 0;

	$: range = max - min;
	$: leftPercent = range > 0 ? ((leftValue - min) / range) * 100 : 0;
	$: rightPercent = range > 0 ? ((rightValue - min) / range) * 100 : 0;
	$: progressPercent =
		progressValue !== null && range > 0 ? Math.min(Math.max(((progressValue - min) / range) * 100, leftPercent), rightPercent) : leftPercent;

	function clamp(value: number, lo: number, hi: number): number {
		return Math.min(Math.max(value, lo), hi);
	}

	function handleTrackClick(e: MouseEvent) {
		if (dragging) return;
		if (!track) return;
		const rect = track.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		const value = min + percent * range;
		const distToLeft = Math.abs(value - leftValue);
		const distToRight = Math.abs(value - rightValue);

		if (distToLeft <= distToRight) {
			leftValue = clamp(value, min, rightValue);
		} else {
			rightValue = clamp(value, leftValue, max);
		}
		dispatch('change', { left: leftValue, right: rightValue });
	}

	function startDrag(clientX: number, target: 'left' | 'right' | 'range') {
		dragging = target;
		dragStartX = clientX;
		dragStartLeft = leftValue;
		dragStartRight = rightValue;
	}

	function updateDrag(clientX: number) {
		if (!dragging || !track) return;

		const rect = track.getBoundingClientRect();
		const deltaValue = ((clientX - dragStartX) / rect.width) * range;

		if (dragging === 'left') {
			leftValue = clamp(dragStartLeft + deltaValue, min, rightValue);
		} else if (dragging === 'right') {
			rightValue = clamp(dragStartRight + deltaValue, leftValue, max);
		} else {
			const rangeWidth = dragStartRight - dragStartLeft;
			let newLeft = dragStartLeft + deltaValue;
			let newRight = dragStartRight + deltaValue;

			if (newLeft < min) {
				newLeft = min;
				newRight = min + rangeWidth;
			}
			if (newRight > max) {
				newRight = max;
				newLeft = max - rangeWidth;
			}

			leftValue = newLeft;
			rightValue = newRight;
		}

		dispatch('change', { left: leftValue, right: rightValue });
	}

	function endDrag() {
		dragging = null;
	}

	function handleMouseDown(e: MouseEvent, target: 'left' | 'right' | 'range') {
		e.preventDefault();
		e.stopPropagation();
		startDrag(e.clientX, target);
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		updateDrag(e.clientX);
	}

	function handleMouseUp() {
		endDrag();
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}

	function handleTouchStart(e: TouchEvent, target: 'left' | 'right' | 'range') {
		if (e.touches.length !== 1) return;
		e.preventDefault();
		e.stopPropagation();
		startDrag(e.touches[0].clientX, target);
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd);
	}

	function handleTouchMove(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		e.preventDefault();
		updateDrag(e.touches[0].clientX);
	}

	function handleTouchEnd() {
		endDrag();
		window.removeEventListener('touchmove', handleTouchMove);
		window.removeEventListener('touchend', handleTouchEnd);
	}

	function handleKeyDown(e: KeyboardEvent, target: 'left' | 'right') {
		const step = range / 100;
		let handled = true;

		if (target === 'left') {
			if (e.key === 'ArrowLeft') leftValue = clamp(leftValue - step, min, rightValue);
			else if (e.key === 'ArrowRight') leftValue = clamp(leftValue + step, min, rightValue);
			else handled = false;
		} else {
			if (e.key === 'ArrowLeft') rightValue = clamp(rightValue - step, leftValue, max);
			else if (e.key === 'ArrowRight') rightValue = clamp(rightValue + step, leftValue, max);
			else handled = false;
		}

		if (handled) {
			e.preventDefault();
			dispatch('change', { left: leftValue, right: rightValue });
		}
	}
</script>

<div class="slider-track" bind:this={track} on:click={handleTrackClick} role="presentation">
	<div
		class="range-fill"
		style="left: {leftPercent}%; width: {rightPercent - leftPercent}%;"
		on:mousedown={(e) => handleMouseDown(e, 'range')}
		on:touchstart={(e) => handleTouchStart(e, 'range')}
		role="presentation"
	></div>

	{#if progressValue !== null}
		<div class="progress-fill" style="left: {leftPercent}%; width: {progressPercent - leftPercent}%;"></div>
	{/if}

	<div
		class="handle"
		style="left: {leftPercent}%;"
		on:mousedown={(e) => handleMouseDown(e, 'left')}
		on:touchstart={(e) => handleTouchStart(e, 'left')}
		on:keydown={(e) => handleKeyDown(e, 'left')}
		role="slider"
		tabindex="0"
		aria-valuemin={min}
		aria-valuemax={rightValue}
		aria-valuenow={leftValue}
		aria-label="Left marker"
	></div>

	<div
		class="handle"
		style="left: {rightPercent}%;"
		on:mousedown={(e) => handleMouseDown(e, 'right')}
		on:touchstart={(e) => handleTouchStart(e, 'right')}
		on:keydown={(e) => handleKeyDown(e, 'right')}
		role="slider"
		tabindex="0"
		aria-valuemin={leftValue}
		aria-valuemax={max}
		aria-valuenow={rightValue}
		aria-label="Right marker"
	></div>
</div>

<style>
	.slider-track {
		position: relative;
		width: 100%;
		height: 6px;
		background: #e5e7eb;
		border-radius: 3px;
		cursor: pointer;
	}

	.range-fill {
		position: absolute;
		top: 0;
		height: 100%;
		background: #cbd5e1;
		border-radius: 3px;
		cursor: grab;
	}

	.range-fill:active {
		cursor: grabbing;
	}

	.progress-fill {
		position: absolute;
		top: 0;
		height: 100%;
		background: #3b82f6;
		border-radius: 3px;
		pointer-events: none;
	}

	.handle {
		position: absolute;
		top: 50%;
		width: 6px;
		height: 30px;
		background: #ffffff;
		border: 1px solid #d1d5db;
		border-radius: 2px;
		transform: translate(-50%, -50%);
		cursor: ew-resize;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}

	.handle:hover,
	.handle:focus {
		border-color: #9ca3af;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
		outline: none;
	}

	.handle:active {
		border-color: #3b82f6;
	}
</style>
