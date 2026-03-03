<script lang="ts">
	import { onMount } from 'svelte';
	import {
		TimelineCanvas,
		TimelineControls,
		createTimelineStore,
		formatTime as sharedFormatTime,
		BackgroundLayer,
		PlayheadLayer,
		HoverLayer,
		ZoomSelectionLayer
	} from 'svelte-interactive-timeline';
	import { createPlaybackController } from './playback-controller.svelte';
	import TimelineStore from '../../stores/timelineStore';
	import P5Store from '../../stores/p5Store';
	import ConfigStore from '../../stores/configStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import { SkipBack, Play, Pause } from '@lucide/svelte';

	interface Props {
		height?: number;
	}

	let { height = 24 }: Props = $props();

	// Create shared timeline store
	const store = createTimelineStore();

	// Create layers
	const layers = [
		new BackgroundLayer(),
		new PlayheadLayer(),
		new ZoomSelectionLayer(),
		new HoverLayer()
	];

	// Create playback controller
	const playback = createPlaybackController(store, {
		speeds: [
			{ value: 1, label: '1x' },
			{ value: 3, label: '3x' },
			{ value: 6, label: '6x' },
			{ value: 15, label: '15x' },
			{ value: 30, label: '30x' }
		],
		onFrame: (time) => {
			// Sync back to existing TimelineStore
			TimelineStore.update((t) => ({ ...t, currTime: time }));
			// Drive p5 animation
			const p5 = $P5Store;
			if (p5) {
				p5.continueTimelineAnimation?.();
			}
		},
		endBehavior: 'stop'
	});

	// Time format cycling
	type TimeFormat = 'HHMMSS' | 'MMSS' | 'SECONDS' | 'DECIMAL' | 'WORDS';
	let currentTimeFormat = $state<TimeFormat>('HHMMSS');

	// Sync: initialize from existing TimelineStore
	$effect(() => {
		const timeline = $TimelineStore;
		if (timeline.endTime > timeline.startTime) {
			store.initialize(timeline.endTime, timeline.startTime);
		}
	});

	// Sync: when existing TimelineStore.currTime changes externally (e.g. video), update shared store
	$effect(() => {
		const curr = $TimelineStore.currTime;
		if (Math.abs(store.currentTime - curr) > 0.01) {
			store.setCurrentTime(curr);
		}
	});

	// Sync ConfigStore animationRate -> playback controller
	$effect(() => {
		const rate = $ConfigStore.animationRate;
		playback.setSpeedByValue(rate);
	});

	// Update time format when timing mode changes
	$effect(() => {
		const timingMode = $TranscriptStore.timingMode;
		if ($TranscriptStore.wordArray.length > 0 && timingMode === 'untimed') {
			currentTimeFormat = 'WORDS';
		}
	});

	function cycleTimeFormat() {
		const isTimed = $TranscriptStore.timingMode !== 'untimed';
		const formats: TimeFormat[] = isTimed
			? ['HHMMSS', 'MMSS', 'SECONDS', 'DECIMAL', 'WORDS']
			: ['WORDS'];
		const idx = formats.indexOf(currentTimeFormat);
		currentTimeFormat = formats[(idx + 1) % formats.length];
	}

	function formatTimeDisplay(seconds: number): string {
		switch (currentTimeFormat) {
			case 'HHMMSS':
				return sharedFormatTime(seconds, 'hms');
			case 'MMSS':
				return sharedFormatTime(seconds, 'ms');
			case 'SECONDS':
				return `${Math.round(seconds)}s`;
			case 'DECIMAL':
				return `${seconds.toFixed(1)}s`;
			case 'WORDS':
				return `${Math.round(seconds)} words`;
		}
	}

	function handleTimeChange(time: number) {
		// Sync to existing store
		TimelineStore.update((t) => ({ ...t, currTime: time }));
		// Trigger p5 redraw if not animating
		if (!playback.isPlaying) {
			$P5Store?.fillSelectedData?.();
		}
	}

	function handleViewChange(viewStart: number, viewEnd: number) {
		// Sync zoom to existing store markers
		TimelineStore.update((t) => ({
			...t,
			leftMarker: viewStart,
			rightMarker: viewEnd
		}));
		if (!playback.isPlaying) {
			$P5Store?.fillSelectedData?.();
		}
	}

	function toggleAnimation() {
		playback.togglePlayPause();
		TimelineStore.update((t) => ({ ...t, isAnimating: playback.isPlaying }));

		if (playback.isPlaying) {
			const p5 = $P5Store;
			if (p5) {
				const targetIndex = p5.getAnimationTargetIndex?.();
				p5.setAnimationCounter?.(targetIndex);
			}
		} else {
			$P5Store?.fillAllData?.();
		}
	}

	function resetToStart() {
		playback.reset();
		TimelineStore.update((t) => ({ ...t, currTime: store.viewStart }));
		if (!playback.isPlaying) {
			$P5Store?.fillSelectedData?.();
		}
	}

	function cycleSpeed() {
		playback.cycleSpeed();
		ConfigStore.update((c) => ({ ...c, animationRate: playback.speed }));
	}

	// Subscribe to shared store for reactive time display
	let currentTime = $state(0);
	$effect(() => {
		const unsub = store.subscribe((state) => {
			currentTime = state.currentTime;
		});
		return unsub;
	});

	onMount(() => {
		return () => playback.destroy();
	});
</script>

<div class="flex flex-col w-11/12 py-1 gap-0.5">
	<!-- Canvas timeline (replaces RangeSlider) -->
	<div class="w-full flex-shrink-0" style="height: {height}px;">
		<TimelineCanvas
			{store}
			{layers}
			onTimeChange={handleTimeChange}
			onViewChange={handleViewChange}
		/>
	</div>

	<!-- Controls row (matches existing design) -->
	<div class="controls-row">
		<span class="control-label">Animation</span>

		<div class="control-group">
			<button
				onclick={toggleAnimation}
				class="control-btn play-btn"
				aria-label={playback.isPlaying ? 'Pause' : 'Play'}
			>
				{#if playback.isPlaying}
					<Pause size={16} />
				{:else}
					<Play size={16} />
				{/if}
			</button>

			<div class="control-divider"></div>

			<button
				class="control-btn"
				onclick={resetToStart}
				title="Skip to start"
				aria-label="Skip to start"
			>
				<SkipBack size={16} />
			</button>

			<div class="control-divider"></div>

			<button
				class="control-btn speed-btn"
				onclick={cycleSpeed}
				title="Click to change speed"
				aria-label="Animation speed: {playback.speedLabel}"
			>
				{playback.speedLabel}
			</button>
		</div>

		<button
			class="current-time"
			onclick={cycleTimeFormat}
			title="Click to change time format"
		>
			{formatTimeDisplay(currentTime)} <span class="format-indicator">&#9662;</span>
		</button>
	</div>
</div>

<style>
	.controls-row {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}
	.control-label {
		font-size: 0.65rem;
		font-weight: 500;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.control-group {
		display: flex;
		align-items: center;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		overflow: hidden;
	}
	.control-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
	}
	.control-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}
	.control-btn.play-btn {
		background: #3b82f6;
		color: #ffffff;
	}
	.control-btn.play-btn:hover {
		background: #2563eb;
		color: #ffffff;
	}
	.control-btn.speed-btn {
		font-family: monospace;
		font-size: 0.8rem;
		font-weight: 600;
		width: auto;
		padding: 0 0.5rem;
		min-width: 2.5rem;
	}
	.control-divider {
		width: 1px;
		height: 16px;
		background: #e5e7eb;
	}
	.current-time {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-family: monospace;
		font-size: 0.95rem;
		font-weight: 600;
		color: #1f2937;
		background: #f3f4f6;
		padding: 0.125rem 0.5rem;
		border-radius: 6px;
		border: none;
		cursor: pointer;
		transition: background-color 0.2s;
	}
	.current-time:hover {
		background: #e5e7eb;
	}
	.format-indicator {
		font-size: 0.7rem;
		color: #9ca3af;
		margin-left: 0.125rem;
	}
</style>
