<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import VideoStore, { updatePosition, updateSize, setDragging, setResizing, clearSeekRequest } from '../../stores/videoStore';
	import EditorStore from '../../stores/editorStore';
	import { playVideo, pauseVideo, seekTo, muteVideo, unmuteVideo, type VideoPlayer } from '../video/video-service';
	import { getP5Container, getP5ContainerRect, clamp } from '../core/layout-utils';
	import VideoPlayerComponent from './VideoPlayer.svelte';
	import VideoControls from './VideoControls.svelte';

	const DRAG_HANDLE_HEIGHT = 24;
	const MIN_WIDTH = 160;
	const CONTROLS_HEIGHT = 36;
	const CHROME_HEIGHT = DRAG_HANDLE_HEIGHT + CONTROLS_HEIGHT;
	const FULLSCREEN_PADDING = 8;

	let player: VideoPlayer | null = $state(null);
	let isFullscreen = $state(false);
	let resizeObserver: ResizeObserver | null = $state(null);

	// Store pre-fullscreen state for restoration
	let preFullscreenPosition = $state({ x: 0, y: 0 });
	let preFullscreenSize = $state({ width: 320, height: 180 });

	// Get reactive state from store
	let position = $derived($VideoStore.position);
	let size = $derived($VideoStore.size);
	let aspectRatio = $derived($VideoStore.aspectRatio);
	let isDragging = $derived($VideoStore.isDragging);
	let isResizing = $derived($VideoStore.isResizing);
	let isPlaying = $derived($VideoStore.isPlaying);
	let isMuted = $derived($VideoStore.isMuted);
	let seekRequest = $derived($VideoStore.seekRequest);
	let isVisible = $derived($VideoStore.isVisible);
	let snippetsMode = $derived($VideoStore.snippetsMode);
	let showAdvancedControls = $derived($EditorStore.config.showAdvancedVideoControls);

	// Handle seek requests from p5 or other sources
	let lastSeekRequestId = $state(0);
	$effect(() => {
		if (player && seekRequest && seekRequest.id !== lastSeekRequestId) {
			lastSeekRequestId = seekRequest.id;
			seekTo(player, seekRequest.time);
			clearSeekRequest();
		}
	});

	// Drag state
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let dragStartPosX = $state(0);
	let dragStartPosY = $state(0);

	// Resize state
	let resizeCorner = $state('');
	let resizeStartX = $state(0);
	let resizeStartWidth = $state(0);
	let resizeStartHeight = $state(0);
	let resizeStartPosX = $state(0);
	let resizeStartPosY = $state(0);

	// Track previous state to only call player methods when state actually changes
	let prevIsPlaying: boolean | null = $state(null);
	let prevIsMuted: boolean | null = $state(null);

	// Sync playback state with actual player
	// Use isLoaded to ensure player is fully ready before sending commands
	$effect(() => {
		if (player && browser && $VideoStore.isLoaded) {
			// Only act when isPlaying actually changes, not on other store updates
			if (isPlaying !== prevIsPlaying) {
				if (isPlaying) {
					playVideo(player);
				} else if (prevIsPlaying === true) {
					// Only pause if we were actually playing before
					pauseVideo(player);
				}
				prevIsPlaying = isPlaying;
			}
		}
	});

	$effect(() => {
		if (player && browser && $VideoStore.isLoaded) {
			// Only act when isMuted actually changes
			if (isMuted !== prevIsMuted) {
				if (isMuted) {
					muteVideo(player);
				} else if (prevIsMuted === true) {
					// Only unmute if we were actually muted before
					unmuteVideo(player);
				}
				prevIsMuted = isMuted;
			}
		}
	});

	function handlePlayerReady(data: { player: VideoPlayer; duration: number }) {
		player = data.player;
		// Reset previous state tracking when a new player is ready
		// This prevents reactive statements from immediately trying to pause/unmute
		prevIsPlaying = isPlaying;
		prevIsMuted = isMuted;
	}

	function handleDragStart(e: MouseEvent) {
		if (isResizing || isFullscreen) return;
		setDragging(true);
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartPosX = position.x;
		dragStartPosY = position.y;
		e.preventDefault();
	}

	function handleResizeStart(e: MouseEvent, corner: string) {
		setResizing(true);
		resizeCorner = corner;
		resizeStartX = e.clientX;
		resizeStartWidth = size.width;
		resizeStartHeight = size.height;
		resizeStartPosX = position.x;
		resizeStartPosY = position.y;
		e.preventDefault();
		e.stopPropagation();
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDragging) {
			const dx = e.clientX - dragStartX;
			const dy = e.clientY - dragStartY;
			let newX = dragStartPosX + dx;
			let newY = dragStartPosY + dy;

			// Constrain to viewport
			const rect = getP5ContainerRect();
			if (rect) {
				newX = clamp(newX, 0, rect.width - size.width);
				newY = clamp(newY, 0, rect.height - size.height);
			}

			updatePosition(newX, newY);
		}

		if (isResizing) {
			const dx = e.clientX - resizeStartX;

			let newWidth = resizeStartWidth;
			let newHeight = resizeStartHeight;
			let newX = resizeStartPosX;
			let newY = resizeStartPosY;

			// Calculate video height (excluding drag handle)
			const videoHeight = (w: number) => w / aspectRatio;
			const totalHeight = (w: number) => videoHeight(w) + DRAG_HANDLE_HEIGHT;

			if (resizeCorner === 'se') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth + dx);
				newHeight = totalHeight(newWidth);
			} else if (resizeCorner === 'sw') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth - dx);
				newHeight = totalHeight(newWidth);
				newX = resizeStartPosX + (resizeStartWidth - newWidth);
			} else if (resizeCorner === 'ne') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth + dx);
				newHeight = totalHeight(newWidth);
				newY = resizeStartPosY + (resizeStartHeight - newHeight);
			} else if (resizeCorner === 'nw') {
				newWidth = Math.max(MIN_WIDTH, resizeStartWidth - dx);
				newHeight = totalHeight(newWidth);
				newX = resizeStartPosX + (resizeStartWidth - newWidth);
				newY = resizeStartPosY + (resizeStartHeight - newHeight);
			}

			updateSize(newWidth, newHeight);
			updatePosition(newX, newY);
		}
	}

	function handleMouseUp() {
		setDragging(false);
		setResizing(false);
		resizeCorner = '';
	}

	// Expose seekTo for external use
	export function videoSeekTo(time: number) {
		if (player) {
			seekTo(player, time);
		}
	}

	export function getPlayer(): VideoPlayer | null {
		return player;
	}

	// Calculate fullscreen dimensions based on container rect
	function calculateFullscreenDimensions(rect: DOMRect) {
		// Available space in the container (with padding)
		const availableWidth = rect.width - FULLSCREEN_PADDING * 2;
		const availableHeight = rect.height - FULLSCREEN_PADDING * 2;

		// Calculate video dimensions that fit while maintaining aspect ratio
		let newWidth = availableWidth;
		let videoHeight = newWidth / aspectRatio;
		let totalHeight = videoHeight + CHROME_HEIGHT;

		// If too tall, constrain by height instead
		if (totalHeight > availableHeight) {
			totalHeight = availableHeight;
			videoHeight = totalHeight - CHROME_HEIGHT;
			newWidth = videoHeight * aspectRatio;
		}

		// Center in container
		const newX = (rect.width - newWidth) / 2;
		const newY = (rect.height - totalHeight) / 2;

		return {
			x: Math.max(0, newX),
			y: Math.max(0, newY),
			width: newWidth,
			height: totalHeight
		};
	}

	// Update fullscreen dimensions when container resizes
	function handleContainerResize() {
		if (!isFullscreen) return;

		const rect = getP5ContainerRect();
		if (!rect) return;

		const dims = calculateFullscreenDimensions(rect);
		updatePosition(dims.x, dims.y);
		updateSize(dims.width, dims.height);
	}

	function handleToggleFullscreen() {
		const rect = getP5ContainerRect();
		if (!rect) return;

		if (isFullscreen) {
			// Exit fullscreen - restore previous position and size
			updatePosition(preFullscreenPosition.x, preFullscreenPosition.y);
			updateSize(preFullscreenSize.width, preFullscreenSize.height);
			isFullscreen = false;

			// Stop observing container resize
			if (resizeObserver) {
				resizeObserver.disconnect();
				resizeObserver = null;
			}
		} else {
			// Enter fullscreen - save current state and expand
			preFullscreenPosition = { x: position.x, y: position.y };
			preFullscreenSize = { width: size.width, height: size.height };

			const dims = calculateFullscreenDimensions(rect);
			updatePosition(dims.x, dims.y);
			updateSize(dims.width, dims.height);
			isFullscreen = true;

			// Start observing container resize to adapt fullscreen dimensions
			const container = getP5Container();
			if (container) {
				resizeObserver = new ResizeObserver(handleContainerResize);
				resizeObserver.observe(container);
			}
		}
	}

	onMount(() => {
		if (browser) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		}
	});

	onDestroy(() => {
		if (browser) {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		}
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
	});
</script>

<div
	class="video-container"
	class:hidden={!isVisible}
	style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px;"
>
	<!-- Drag handle -->
	<div
		class="drag-handle"
		class:dragging={isDragging}
		onmousedown={handleDragStart}
		onkeydown={(e) => e.key === 'Enter' && handleDragStart}
		role="button"
		tabindex="0"
		aria-label="Drag to move video"
	>
		<span class="drag-dots">&#x22EE;&#x22EE;</span>
	</div>

	<!-- Video player area -->
	<div class="video-area" style="height: {size.height - DRAG_HANDLE_HEIGHT}px;">
		<VideoPlayerComponent onready={handlePlayerReady} />

		<!-- Click shield for YouTube -->
		<div class="click-shield"></div>

		<!-- Snippets mode indicator -->
		{#if snippetsMode}
			<div class="snippets-indicator">
				Turn {snippetsMode.currentIndex + 1} of {snippetsMode.turns.length}
			</div>
		{/if}
	</div>

	<!-- Controls bar at bottom -->
	<div class="controls-bar">
		<VideoControls {player} {isFullscreen} {showAdvancedControls} ontoggleFullscreen={handleToggleFullscreen} />
	</div>

	<!-- Resize handles (hidden in fullscreen) -->
	{#if !isFullscreen}
		<button class="resize-handle nw" onmousedown={(e) => handleResizeStart(e, 'nw')} aria-label="Resize from top-left corner"></button>
		<button class="resize-handle ne" onmousedown={(e) => handleResizeStart(e, 'ne')} aria-label="Resize from top-right corner"></button>
		<button class="resize-handle sw" onmousedown={(e) => handleResizeStart(e, 'sw')} aria-label="Resize from bottom-left corner"></button>
		<button class="resize-handle se" onmousedown={(e) => handleResizeStart(e, 'se')} aria-label="Resize from bottom-right corner"></button>
	{/if}
</div>

<style>
	.video-container {
		position: absolute;
		z-index: 100;
		border: 2px solid rgba(0, 0, 0, 0.5);
		border-radius: 6px;
		overflow: hidden;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.video-container.hidden {
		/* Use visibility instead of display:none to keep YouTube iframe attached to DOM */
		visibility: hidden;
		pointer-events: none;
	}

	.drag-handle {
		height: 24px;
		background: linear-gradient(to bottom, #444, #333);
		cursor: grab;
		display: flex;
		justify-content: center;
		align-items: center;
		user-select: none;
	}

	.drag-handle.dragging {
		cursor: grabbing;
		background: linear-gradient(to bottom, #555, #444);
	}

	.drag-dots {
		color: rgba(255, 255, 255, 0.6);
		font-size: 12px;
		letter-spacing: 2px;
	}

	.video-area {
		position: relative;
		background: #000;
	}

	.click-shield {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1;
		background: transparent;
	}

	.snippets-indicator {
		position: absolute;
		top: 8px;
		left: 8px;
		padding: 4px 8px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		font-size: 12px;
		font-weight: 500;
		border-radius: 4px;
		z-index: 2;
	}

	.controls-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 2;
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
		top: -8px;
		left: -8px;
		cursor: nw-resize;
	}

	.resize-handle.ne {
		top: -8px;
		right: -8px;
		cursor: ne-resize;
	}

	.resize-handle.sw {
		bottom: -8px;
		left: -8px;
		cursor: sw-resize;
	}

	.resize-handle.se {
		bottom: -8px;
		right: -8px;
		cursor: se-resize;
	}
</style>
