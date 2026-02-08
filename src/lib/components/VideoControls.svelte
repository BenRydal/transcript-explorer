<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import VideoStore, { togglePlayPause, toggleMute, setCurrentTime } from '../../stores/videoStore';
	import { getCurrentTime, seekTo, setPlaybackRate, type VideoPlayer } from '../video/video-service';
	import { formatTimeCompact } from '../core/time-utils';

	interface Props {
		player?: VideoPlayer | null;
		isFullscreen?: boolean;
		showAdvancedControls?: boolean;
		ontoggleFullscreen?: () => void;
	}

	let { player = null, isFullscreen = false, showAdvancedControls = false, ontoggleFullscreen }: Props = $props();

	let animationFrameId: number;
	let isScrubbing = $state(false);
	let scrubTime = $state(0);

	const SKIP_SECONDS = 5;
	const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

	let currentSpeed = $state(1);

	let isPlaying = $derived($VideoStore.isPlaying);
	let isMuted = $derived($VideoStore.isMuted);
	let currentTime = $derived($VideoStore.currentTime);
	let duration = $derived($VideoStore.duration);
	let progressPercent = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);

	// Update current time from player
	function updateTime() {
		if (player && isPlaying && !isScrubbing) {
			const time = getCurrentTime(player);
			setCurrentTime(time);
		}
		animationFrameId = requestAnimationFrame(updateTime);
	}

	function handlePlayPause(e: MouseEvent) {
		e.stopPropagation();
		togglePlayPause();
	}

	function handleMute(e: MouseEvent) {
		e.stopPropagation();
		toggleMute();
	}

	function handleSkipBackward(e: MouseEvent) {
		e.stopPropagation();
		const newTime = Math.max(0, currentTime - SKIP_SECONDS);
		if (player) {
			seekTo(player, newTime);
			setCurrentTime(newTime);
		}
	}

	function handleSkipForward(e: MouseEvent) {
		e.stopPropagation();
		const newTime = Math.min(duration, currentTime + SKIP_SECONDS);
		if (player) {
			seekTo(player, newTime);
			setCurrentTime(newTime);
		}
	}

	function handleSpeedChange(e: MouseEvent) {
		e.stopPropagation();
		const currentIndex = SPEED_OPTIONS.indexOf(currentSpeed);
		const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
		currentSpeed = SPEED_OPTIONS[nextIndex];
		if (player) {
			setPlaybackRate(player, currentSpeed);
		}
	}

	function handleScrubStart(e: MouseEvent) {
		e.stopPropagation();
		isScrubbing = true;
		updateScrubPosition(e);
	}

	function handleScrubMove(e: MouseEvent) {
		if (isScrubbing) {
			updateScrubPosition(e);
		}
	}

	function handleScrubEnd(e: MouseEvent) {
		if (isScrubbing) {
			e.stopPropagation();
			isScrubbing = false;
			if (player) {
				seekTo(player, scrubTime);
				setCurrentTime(scrubTime);
			}
		}
	}

	function updateScrubPosition(e: MouseEvent) {
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
		const percent = x / rect.width;
		scrubTime = percent * duration;
	}

	function handleFullscreenToggle(e: MouseEvent) {
		e.stopPropagation();
		ontoggleFullscreen?.();
	}

	onMount(() => {
		if (browser) {
			animationFrameId = requestAnimationFrame(updateTime);
			// Add global mouse listeners for scrubbing
			window.addEventListener('mousemove', handleScrubMove);
			window.addEventListener('mouseup', handleScrubEnd);
		}
	});

	onDestroy(() => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
		if (browser) {
			window.removeEventListener('mousemove', handleScrubMove);
			window.removeEventListener('mouseup', handleScrubEnd);
		}
	});
</script>

{#if showAdvancedControls}
	<div
		class="video-controls"
		onmousedown={(e) => e.stopPropagation()}
		onclick={(e) => e.stopPropagation()}
		role="toolbar"
		tabindex="0"
		onkeydown={(e) => e.stopPropagation()}
	>
		<!-- Skip backward -->
		<button class="control-btn" onclick={handleSkipBackward} aria-label="Skip back 5 seconds" title="-5s">
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
			</svg>
		</button>

		<!-- Play/Pause -->
		<button class="control-btn play-pause" onclick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
			{#if isPlaying}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="4" width="4" height="16" />
					<rect x="14" y="4" width="4" height="16" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<polygon points="5,3 19,12 5,21" />
				</svg>
			{/if}
		</button>

		<!-- Skip forward -->
		<button class="control-btn" onclick={handleSkipForward} aria-label="Skip forward 5 seconds" title="+5s">
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
			</svg>
		</button>

		<!-- Time display -->
		<div class="time-display">
			<span class="current-time">{formatTimeCompact(isScrubbing ? scrubTime : currentTime)}</span>
			<span class="separator">/</span>
			<span class="duration">{formatTimeCompact(duration)}</span>
		</div>

		<!-- Progress/scrub bar -->
		<div
			class="progress-bar"
			onmousedown={handleScrubStart}
			role="slider"
			aria-label="Video progress"
			aria-valuemin={0}
			aria-valuemax={duration}
			aria-valuenow={currentTime}
			tabindex="0"
		>
			<div class="progress-track">
				<div class="progress-fill" style="width: {isScrubbing ? (scrubTime / duration) * 100 : progressPercent}%"></div>
				<div class="progress-handle" style="left: {isScrubbing ? (scrubTime / duration) * 100 : progressPercent}%"></div>
			</div>
		</div>

		<!-- Speed -->
		<button class="control-btn speed" onclick={handleSpeedChange} aria-label="Playback speed" title="Speed: {currentSpeed}x">
			<span class="speed-text">{currentSpeed}x</span>
		</button>

		<!-- Mute -->
		<button class="control-btn mute" onclick={handleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
			{#if isMuted}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
					/>
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
					/>
				</svg>
			{/if}
		</button>

		<!-- Fullscreen toggle -->
		<button
			class="control-btn"
			onclick={handleFullscreenToggle}
			aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
			title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
		>
			{#if isFullscreen}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
				</svg>
			{/if}
		</button>
	</div>
{/if}

<style>
	.video-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.4));
		user-select: none;
	}

	.control-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 4px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		transition: background 0.15s;
		flex-shrink: 0;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.control-btn svg {
		width: 14px;
		height: 14px;
	}

	.control-btn.speed {
		width: auto;
		min-width: 36px;
		padding: 4px 6px;
	}

	.speed-text {
		font-size: 10px;
		font-weight: 500;
		font-family: monospace;
	}

	.time-display {
		display: flex;
		align-items: center;
		gap: 4px;
		font-family: monospace;
		font-size: 11px;
		color: white;
		flex-shrink: 0;
	}

	.separator {
		opacity: 0.6;
	}

	.duration {
		opacity: 0.8;
	}

	.progress-bar {
		flex: 1;
		min-width: 60px;
		height: 20px;
		display: flex;
		align-items: center;
		cursor: pointer;
		padding: 0 4px;
	}

	.progress-track {
		position: relative;
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.3);
		border-radius: 2px;
	}

	.progress-fill {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		background: #3b82f6;
		border-radius: 2px;
		transition: width 0.1s ease-out;
	}

	.progress-handle {
		position: absolute;
		top: 50%;
		width: 12px;
		height: 12px;
		background: white;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		opacity: 0;
		transition: opacity 0.15s;
	}

	.progress-bar:hover .progress-handle {
		opacity: 1;
	}

	.progress-bar:active .progress-handle {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1.2);
	}
</style>
