<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { derived } from 'svelte/store';
	import { browser } from '$app/environment';
	import VideoStore, { setLoaded, setAspectRatio } from '../../stores/videoStore';
	import {
		createYouTubePlayer,
		type VideoPlayer,
		destroyPlayer
	} from '../video/video-service';

	const dispatch = createEventDispatcher<{
		ready: { player: VideoPlayer; duration: number };
		error: { message: string };
	}>();

	let containerEl: HTMLDivElement;
	let youtubeContainerEl: HTMLDivElement;
	let videoEl: HTMLVideoElement;
	let player: VideoPlayer | null = null;
	// Use a stable ID for the YouTube container
	const youtubeContainerId = 'youtube-player-container';

	// Create a derived store that only changes when source changes
	// This prevents re-running initialization when other store properties change
	let lastSource = { type: null as 'youtube' | 'file' | null, videoId: undefined as string | undefined, fileUrl: undefined as string | undefined };
	const sourceStore = derived(VideoStore, ($store) => {
		const newSource = $store.source;
		// Only return a new object if source actually changed
		if (newSource.type !== lastSource.type ||
			newSource.videoId !== lastSource.videoId ||
			newSource.fileUrl !== lastSource.fileUrl) {
			lastSource = { ...newSource };
		}
		return lastSource;
	});

	// Track the previous source to detect changes
	let prevSourceType: string | null = null;
	let prevVideoId: string | undefined = undefined;
	let prevFileUrl: string | undefined = undefined;
	let initialized = false;

	// Subscribe to the derived source store
	$: source = $sourceStore;

	// Only trigger initialization when source actually changes
	$: if (browser && source.type && containerEl) {
		const sourceChanged = source.type !== prevSourceType ||
			source.videoId !== prevVideoId ||
			source.fileUrl !== prevFileUrl;

		if (sourceChanged) {
			prevSourceType = source.type;
			prevVideoId = source.videoId;
			prevFileUrl = source.fileUrl;

			if (!initialized) {
				initialized = true;
			}
			initializePlayer();
		}
	}

	function initializePlayer() {
		// Destroy existing player first
		if (player) {
			destroyPlayer(player);
			player = null;
		}

		// Clear the YouTube container if switching away from YouTube
		if (youtubeContainerEl) {
			youtubeContainerEl.innerHTML = '';
		}

		if (source.type === 'youtube' && source.videoId) {
			// Small delay to ensure DOM is ready
			setTimeout(() => initYouTubePlayer(source.videoId!), 50);
		} else if (source.type === 'file' && source.fileUrl) {
			// HTML5 video will be initialized via the element binding
		}
	}

	function initYouTubePlayer(videoId: string) {
		if (!youtubeContainerEl) return;

		// Create a new div for the YouTube player inside our container
		const playerDiv = document.createElement('div');
		playerDiv.id = youtubeContainerId + '-' + Date.now();
		youtubeContainerEl.innerHTML = '';
		youtubeContainerEl.appendChild(playerDiv);

		createYouTubePlayer(
			playerDiv.id,
			videoId,
			(ytPlayer, duration) => {
				player = ytPlayer;
				setLoaded(duration);
				setAspectRatio(16 / 9); // YouTube videos are typically 16:9
				dispatch('ready', { player, duration });
			},
			(error) => {
				dispatch('error', { message: `YouTube error: ${error}` });
			}
		);
	}

	function handleVideoLoaded() {
		if (videoEl) {
			player = videoEl;
			const duration = videoEl.duration;
			const ratio = videoEl.videoWidth / videoEl.videoHeight || 16 / 9;
			setLoaded(duration);
			setAspectRatio(ratio);
			dispatch('ready', { player, duration });
		}
	}

	function handleVideoError() {
		dispatch('error', { message: 'Error loading video file' });
	}

	// Expose player reference
	export function getPlayer(): VideoPlayer | null {
		return player;
	}

	onMount(() => {
		if (source.type) {
			prevSourceType = source.type;
			prevVideoId = source.videoId;
			prevFileUrl = source.fileUrl;
			initialized = true;
			initializePlayer();
		}
	});

	onDestroy(() => {
		if (player) {
			destroyPlayer(player);
			player = null;
		}
	});
</script>

<div class="video-player" bind:this={containerEl}>
	<!-- Always render both containers, hide with CSS -->
	<div
		bind:this={youtubeContainerEl}
		class="youtube-container"
		class:hidden={source.type !== 'youtube'}
	></div>

	{#if source.type === 'file' && source.fileUrl}
		<video
			bind:this={videoEl}
			src={source.fileUrl}
			on:loadedmetadata={handleVideoLoaded}
			on:error={handleVideoError}
			playsinline
		>
			<track kind="captions" />
		</video>
	{/if}
</div>

<style>
	.video-player {
		width: 100%;
		height: 100%;
		background: #000;
	}

	.youtube-container {
		width: 100%;
		height: 100%;
	}

	.youtube-container.hidden {
		display: none;
	}

	.youtube-container :global(iframe) {
		width: 100%;
		height: 100%;
		border: none;
	}

	video {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
