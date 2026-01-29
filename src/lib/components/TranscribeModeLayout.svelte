<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import VideoStore, { setCurrentTime, togglePlayPause } from '../../stores/videoStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import EditorStore from '../../stores/editorStore';
	import { playVideo, pauseVideo, seekTo, type VideoPlayer } from '../video/video-service';
	import SplitPane from './SplitPane.svelte';
	import TranscribeModeToolbar from './TranscribeModeToolbar.svelte';
	import TranscriptEditor from './TranscriptEditor.svelte';
	import VideoPlayerComponent from './VideoPlayer.svelte';
	import VideoControls from './VideoControls.svelte';

	interface Props {
		onexit?: () => void;
		oncreateTranscript?: () => void;
	}

	let { onexit, oncreateTranscript }: Props = $props();

	let player: VideoPlayer | null = $state(null);
	let panelSizes: [number, number] = $state<[number, number]>([50, 50]);
	let prevIsPlaying: boolean | null = $state<boolean | null>(null);
	let isDraggingDivider = $state(false);

	const SKIP_SECONDS = 5;

	let isPlaying = $derived($VideoStore.isPlaying);
	let currentTime = $derived($VideoStore.currentTime);
	let duration = $derived($VideoStore.duration);

	// Sync playback state with player
	$effect(() => {
		if (player && browser && $VideoStore.isLoaded) {
			if (isPlaying !== prevIsPlaying) {
				if (isPlaying) {
					playVideo(player);
				} else if (prevIsPlaying === true) {
					pauseVideo(player);
				}
				prevIsPlaying = isPlaying;
			}
		}
	});

	// Sync editor selection with video time (only for timed transcripts)
	let prevSyncedTurn: number | null = $state<number | null>(null);
	$effect(() => {
		if ($TranscriptStore.timingMode !== 'untimed') {
			const turn = findTurnAtTime(currentTime, $TranscriptStore.wordArray);
			if (turn !== null && turn !== prevSyncedTurn) {
				prevSyncedTurn = turn;
				EditorStore.update((state) => ({
					...state,
					selection: {
						...state.selection,
						selectedTurnNumber: turn,
						selectionSource: 'video'
					}
				}));
			}
		}
	});

	function findTurnAtTime(time: number, wordArray: { startTime: number; endTime: number; turnNumber: number }[]): number | null {
		let fallbackTurn: number | null = null;
		let fallbackStart = -Infinity;

		for (const word of wordArray) {
			if (time >= word.startTime && time <= word.endTime) return word.turnNumber;
			if (word.startTime <= time && word.startTime > fallbackStart) {
				fallbackStart = word.startTime;
				fallbackTurn = word.turnNumber;
			}
		}
		return fallbackTurn;
	}

	function handlePlayerReady(data: { player: VideoPlayer; duration: number }) {
		player = data.player;
		prevIsPlaying = isPlaying;
	}

	function handlePanelResize(data: { sizes: [number, number] }) {
		panelSizes = data.sizes;
	}

	// Keyboard shortcuts for transcription
	function handleKeydown(event: KeyboardEvent) {
		// Escape always exits transcribe mode
		if (event.key === 'Escape') {
			event.preventDefault();
			onexit?.();
			return;
		}

		// All other shortcuts only work when not in an input field
		const target = event.target as HTMLElement;
		const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
		if (isInInput) return;

		switch (event.key) {
			case ' ':
				event.preventDefault();
				togglePlayPause();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				skipBackward();
				break;
			case 'ArrowRight':
				event.preventDefault();
				skipForward();
				break;
		}
	}

	function skipBackward() {
		if (!player) return;
		const newTime = Math.max(0, currentTime - SKIP_SECONDS);
		seekTo(player, newTime);
		setCurrentTime(newTime);
	}

	function skipForward() {
		if (!player) return;
		const newTime = Math.min(duration, currentTime + SKIP_SECONDS);
		seekTo(player, newTime);
		setCurrentTime(newTime);
	}

	onMount(() => {
		if (browser) {
			window.addEventListener('keydown', handleKeydown);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('keydown', handleKeydown);
		}
	});
</script>

<div class="transcribe-mode-layout">
	<TranscribeModeToolbar onexit={() => onexit?.()} />

	<div class="transcribe-content">
		<SplitPane
			orientation="horizontal"
			sizes={panelSizes}
			minSize={200}
			onresize={handlePanelResize}
			ondragstart={() => (isDraggingDivider = true)}
			ondragend={() => (isDraggingDivider = false)}
		>
			{#snippet first()}
				<div class="video-panel" class:dragging={isDraggingDivider}>
					<div class="video-wrapper">
						<VideoPlayerComponent onready={handlePlayerReady} />
					</div>
					<div class="video-controls-wrapper">
						<VideoControls {player} isFullscreen={false} showAdvancedControls={true} />
					</div>
				</div>
			{/snippet}
			{#snippet second()}
				<div class="editor-panel">
					<TranscriptEditor oncreateTranscript={() => oncreateTranscript?.()} />
				</div>
			{/snippet}
		</SplitPane>
	</div>
</div>

<style>
	.transcribe-mode-layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #1f2937;
	}

	.transcribe-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.video-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: #000;
	}

	.video-panel.dragging {
		pointer-events: none;
	}

	.video-wrapper {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.video-controls-wrapper {
		flex-shrink: 0;
	}

	.editor-panel {
		height: 100%;
		overflow: hidden;
	}
</style>
