<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import VideoStore, { togglePlayPause, toggleMute, setCurrentTime } from '../../stores/videoStore';
	import { formatTime, getCurrentTime, type VideoPlayer } from '../video/video-service';

	export let player: VideoPlayer | null = null;

	let animationFrameId: number;

	$: isPlaying = $VideoStore.isPlaying;
	$: isMuted = $VideoStore.isMuted;
	$: currentTime = $VideoStore.currentTime;
	$: duration = $VideoStore.duration;

	// Update current time from player
	function updateTime() {
		if (player && isPlaying) {
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

	onMount(() => {
		if (browser) {
			animationFrameId = requestAnimationFrame(updateTime);
		}
	});

	onDestroy(() => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});
</script>

<div class="video-controls" on:mousedown|stopPropagation on:click|stopPropagation role="toolbar" tabindex="0" on:keydown|stopPropagation>
	<button class="control-btn play-pause" on:click={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
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

	<div class="time-display">
		<span class="current-time">{formatTime(currentTime)}</span>
		<span class="separator">/</span>
		<span class="duration">{formatTime(duration)}</span>
	</div>

	<button class="control-btn mute" on:click={handleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
		{#if isMuted}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
			</svg>
		{/if}
	</button>
</div>

<style>
	.video-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.4));
		user-select: none;
	}

	.control-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 4px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		transition: background 0.15s;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.control-btn svg {
		width: 16px;
		height: 16px;
	}

	.time-display {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		font-family: monospace;
		font-size: 12px;
		color: white;
	}

	.separator {
		opacity: 0.6;
	}

	.duration {
		opacity: 0.8;
	}
</style>
