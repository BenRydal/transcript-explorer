<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	// Position and size state
	let x = 20;
	let y = 20;
	let width = 320;
	let height = 180;

	let isDragging = false;
	let isResizing = false;
	let resizeCorner = '';

	// For drag calculations
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartPosX = 0;
	let dragStartPosY = 0;

	// For resize calculations
	let resizeStartX = 0;
	let resizeStartY = 0;
	let resizeStartWidth = 0;
	let resizeStartHeight = 0;
	let resizeStartPosX = 0;
	let resizeStartPosY = 0;

	// Aspect ratio
	let aspectRatio = 16 / 9;

	const MIN_WIDTH = 160;
	const DRAG_HANDLE_HEIGHT = 24;

	export let visible = false;

	// Sync position to the actual video element
	function syncVideoPosition() {
		const moviePlayer = document.getElementById('moviePlayer');
		if (moviePlayer) {
			moviePlayer.style.position = 'absolute';
			moviePlayer.style.left = `${x}px`;
			moviePlayer.style.top = `${y + DRAG_HANDLE_HEIGHT}px`;
			moviePlayer.style.width = `${width}px`;
			moviePlayer.style.height = `${height - DRAG_HANDLE_HEIGHT}px`;
			moviePlayer.style.zIndex = '99';
			moviePlayer.style.display = visible ? 'block' : 'none';
		}
	}

	function initializeFromVideo() {
		const moviePlayer = document.getElementById('moviePlayer');
		if (moviePlayer) {
			const videoWidth = moviePlayer.offsetWidth || parseInt(moviePlayer.style.width) || 320;
			const videoHeight = moviePlayer.offsetHeight || parseInt(moviePlayer.style.height) || 180;

			if (videoWidth > 0 && videoHeight > 0) {
				width = videoWidth;
				height = videoHeight + DRAG_HANDLE_HEIGHT;
				aspectRatio = videoWidth / videoHeight;
			}
			syncVideoPosition();
		}
	}

	let lastVideoElement: Element | null = null;

	// Watch for moviePlayer element being removed (when switching datasets)
	function checkVideoElement() {
		const moviePlayer = document.getElementById('moviePlayer');
		if (lastVideoElement && !moviePlayer) {
			// Video was removed - reset position for next video
			x = 20;
			y = 20;
			width = 320;
			height = 180;
			aspectRatio = 16 / 9;
		}
		lastVideoElement = moviePlayer;
	}

	onMount(() => {
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		// Watch for video element changes
		const observer = new MutationObserver(() => {
			checkVideoElement();
		});
		observer.observe(document.body, { childList: true, subtree: true });

		// Try to initialize from video
		if (visible) {
			initializeFromVideo();
			setTimeout(initializeFromVideo, 100);
			setTimeout(initializeFromVideo, 300);
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
			observer.disconnect();
		};
	});

	// When visibility changes
	$: if (browser && visible) {
		initializeFromVideo();
		setTimeout(initializeFromVideo, 50);
		setTimeout(initializeFromVideo, 150);
	} else if (browser && !visible) {
		// Hide the video element when overlay is hidden
		const moviePlayer = document.getElementById('moviePlayer');
		if (moviePlayer) {
			moviePlayer.style.display = 'none';
		}
	}

	// Sync position whenever it changes
	$: if (browser && visible) {
		syncVideoPosition();
	}

	function handleDragStart(e: MouseEvent) {
		if (isResizing) return;
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartPosX = x;
		dragStartPosY = y;
		e.preventDefault();
	}

	function handleResizeStart(e: MouseEvent, corner: string) {
		isResizing = true;
		resizeCorner = corner;
		resizeStartX = e.clientX;
		resizeStartY = e.clientY;
		resizeStartWidth = width;
		resizeStartHeight = height;
		resizeStartPosX = x;
		resizeStartPosY = y;
		e.preventDefault();
		e.stopPropagation();
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDragging) {
			const dx = e.clientX - dragStartX;
			const dy = e.clientY - dragStartY;
			x = dragStartPosX + dx;
			y = dragStartPosY + dy;

			// Constrain to viewport
			const containerEl = document.getElementById('p5-container');
			if (containerEl) {
				const rect = containerEl.getBoundingClientRect();
				x = Math.max(0, Math.min(x, rect.width - width));
				y = Math.max(0, Math.min(y, rect.height - height));
			}

			syncVideoPosition();
		}

		if (isResizing) {
			const dx = e.clientX - resizeStartX;

			let newWidth = resizeStartWidth;
			let newHeight = resizeStartHeight;
			let newX = resizeStartPosX;
			let newY = resizeStartPosY;

			// Calculate new dimensions based on which corner is being dragged
			if (resizeCorner === 'se') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth + dx);
				newHeight = (newWidth - DRAG_HANDLE_HEIGHT) / aspectRatio + DRAG_HANDLE_HEIGHT;
			} else if (resizeCorner === 'sw') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth - dx);
				newHeight = (newWidth - DRAG_HANDLE_HEIGHT) / aspectRatio + DRAG_HANDLE_HEIGHT;
				newX = resizeStartPosX + (resizeStartWidth - newWidth);
			} else if (resizeCorner === 'ne') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth + dx);
				newHeight = (newWidth - DRAG_HANDLE_HEIGHT) / aspectRatio + DRAG_HANDLE_HEIGHT;
				newY = resizeStartPosY + (resizeStartHeight - newHeight);
			} else if (resizeCorner === 'nw') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth - dx);
				newHeight = (newWidth - DRAG_HANDLE_HEIGHT) / aspectRatio + DRAG_HANDLE_HEIGHT;
				newX = resizeStartPosX + (resizeStartWidth - newWidth);
				newY = resizeStartPosY + (resizeStartHeight - newHeight);
			}

			width = newWidth;
			height = newHeight;
			x = newX;
			y = newY;

			syncVideoPosition();
		}
	}

	function handleMouseUp() {
		isDragging = false;
		isResizing = false;
		resizeCorner = '';
	}
</script>

{#if visible}
	<!-- Transparent overlay to prevent YouTube iframe from stealing clicks -->
	<div
		class="video-click-shield"
		style="left: {x}px; top: {y + DRAG_HANDLE_HEIGHT}px; width: {width}px; height: {height - DRAG_HANDLE_HEIGHT}px;"
	></div>

	<!-- Drag handle positioned above the video -->
	<div
		class="video-drag-handle"
		style="left: {x}px; top: {y}px; width: {width}px;"
		on:mousedown={handleDragStart}
		class:dragging={isDragging}
		role="button"
		tabindex="0"
		aria-label="Drag to move video"
	>
		<span class="drag-dots">⋮⋮</span>
	</div>

	<!-- Resize handles - made larger for easier grabbing -->
	<button
		class="resize-handle nw"
		style="left: {x - 8}px; top: {y - 8}px;"
		on:mousedown={(e) => handleResizeStart(e, 'nw')}
		aria-label="Resize from top-left corner"
	></button>
	<button
		class="resize-handle ne"
		style="left: {x + width - 12}px; top: {y - 8}px;"
		on:mousedown={(e) => handleResizeStart(e, 'ne')}
		aria-label="Resize from top-right corner"
	></button>
	<button
		class="resize-handle sw"
		style="left: {x - 8}px; top: {y + height - 12}px;"
		on:mousedown={(e) => handleResizeStart(e, 'sw')}
		aria-label="Resize from bottom-left corner"
	></button>
	<button
		class="resize-handle se"
		style="left: {x + width - 12}px; top: {y + height - 12}px;"
		on:mousedown={(e) => handleResizeStart(e, 'se')}
		aria-label="Resize from bottom-right corner"
	></button>

	<!-- Border overlay (visual only, doesn't capture events) -->
	<div
		class="video-border"
		style="left: {x}px; top: {y}px; width: {width}px; height: {height}px;"
	></div>
{/if}

<style>
	.video-click-shield {
		position: absolute;
		z-index: 100;
		background: transparent;
		/* Allow clicks to pass through to visualizations behind, but block iframe */
		pointer-events: auto;
	}

	.video-drag-handle {
		position: absolute;
		z-index: 101;
		height: 24px;
		background: linear-gradient(to bottom, #444, #333);
		border-radius: 6px 6px 0 0;
		cursor: grab;
		display: flex;
		justify-content: center;
		align-items: center;
		user-select: none;
		border: 2px solid rgba(0, 0, 0, 0.5);
		border-bottom: none;
		box-sizing: border-box;
	}

	.video-drag-handle.dragging {
		cursor: grabbing;
		background: linear-gradient(to bottom, #555, #444);
	}

	.drag-dots {
		color: rgba(255, 255, 255, 0.6);
		font-size: 12px;
		letter-spacing: 2px;
	}

	.video-border {
		position: absolute;
		z-index: 98;
		border: 2px solid rgba(0, 0, 0, 0.5);
		border-radius: 6px;
		pointer-events: none;
		box-sizing: border-box;
	}

	.resize-handle {
		position: absolute;
		width: 20px;
		height: 20px;
		background: rgba(255, 255, 255, 0.95);
		border: 2px solid rgba(0, 0, 0, 0.5);
		border-radius: 3px;
		z-index: 103;
		padding: 0;
	}

	.resize-handle:hover {
		background: rgba(100, 150, 255, 0.95);
		transform: scale(1.1);
	}

	.resize-handle.nw {
		cursor: nw-resize;
	}

	.resize-handle.ne {
		cursor: ne-resize;
	}

	.resize-handle.sw {
		cursor: sw-resize;
	}

	.resize-handle.se {
		cursor: se-resize;
	}
</style>
