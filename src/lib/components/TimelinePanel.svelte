<script lang="ts">
	import { formatTime, formatTimeAuto } from '../core/time-utils';
	import TimelineStore from '../../stores/timelineStore';
	import P5Store from '../../stores/p5Store';
	import ConfigStore from '../../stores/configStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import { SkipBack, Play, Pause } from '@lucide/svelte';
	import RangeSlider from './RangeSlider.svelte';
	import type { TimingMode } from '../../models/transcript';

	$: timelineLeft = $TimelineStore.leftMarker;
	$: timelineRight = $TimelineStore.rightMarker;
	$: timelineCurr = $TimelineStore.currTime;
	$: startTime = $TimelineStore.startTime;
	$: endTime = $TimelineStore.endTime;
	$: isAnimating = $TimelineStore.isAnimating;

	// Formatted time displays
	$: formattedCurr = formatTimeDisplay(timelineCurr, currentTimeFormat);
	$: formattedStart = formatTimeDisplay(startTime, currentTimeFormat);
	$: formattedEnd = formatTimeDisplay(endTime, currentTimeFormat);

	type TimeFormat = 'HHMMSS' | 'MMSS' | 'SECONDS' | 'DECIMAL' | 'WORDS';

	let currentTimeFormat: TimeFormat = 'HHMMSS';
	let previousTimingMode: TimingMode = 'untimed';

	// Update time format when timing mode changes
	$: {
		const timingMode = $TranscriptStore.timingMode;
		if ($TranscriptStore.wordArray.length > 0) {
			if (timingMode === 'untimed') {
				currentTimeFormat = 'WORDS';
			} else if (previousTimingMode === 'untimed') {
				currentTimeFormat = 'MMSS';
			}
		}
		previousTimingMode = timingMode;
	}

	function cycleTimeFormat() {
		let formats: TimeFormat[];

		if ($TranscriptStore.timingMode === 'untimed') {
			formats = ['WORDS'];
		} else {
			formats = ['HHMMSS', 'MMSS', 'SECONDS', 'DECIMAL', 'WORDS'];
		}

		const currentIndex = formats.indexOf(currentTimeFormat);
		const nextIndex = (currentIndex + 1) % formats.length;
		currentTimeFormat = formats[nextIndex];
	}

	function formatTimeDisplay(seconds: number, format: TimeFormat): string {
		switch (format) {
			case 'HHMMSS':
				return formatTime(seconds);
			case 'MMSS':
				return formatTimeAuto(seconds);
			case 'SECONDS':
				return `${Math.round(seconds)}s`;
			case 'DECIMAL':
				return seconds.toFixed(1) + 's';
			case 'WORDS':
				return `${Math.round(seconds)} words`;
		}
	}

	let debounceTimeout: number;

	const toggleAnimation = () => {
		TimelineStore.update((timeline) => {
			timeline.isAnimating = !timeline.isAnimating;
			return timeline;
		});

		if ($P5Store) {
			if (!isAnimating) {
				const targetIndex = $P5Store.getAnimationTargetIndex();
				$P5Store.setAnimationCounter(targetIndex);
			} else {
				$P5Store.fillAllData();
			}
		}
	};

	const handleSliderChange = (event: CustomEvent<{ left: number; right: number }>) => {
		const { left, right } = event.detail;
		if (left === timelineLeft && right === timelineRight) return;

		if (!$TimelineStore.isAnimating) {
			clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(() => {
				$P5Store.fillSelectedData();
			}, 100);
		}

		TimelineStore.update((t) => {
			const leftMoved = left !== t.leftMarker;
			t.leftMarker = left;
			t.rightMarker = right;
			// Reset to left marker when left handle moves, otherwise just clamp
			if (leftMoved) t.currTime = left;
			else if (t.currTime > right) t.currTime = right;
			return t;
		});
	};

	// Speed presets for animation (multiplier of real-time)
	const SPEED_PRESETS = [
		{ value: 1, label: '1x' },
		{ value: 3, label: '3x' },
		{ value: 6, label: '6x' },
		{ value: 15, label: '15x' },
		{ value: 30, label: '30x' }
	];

	$: speedLabel = SPEED_PRESETS.find((p) => p.value === $ConfigStore.animationRate)?.label ?? '3x';

	const cycleSpeed = () => {
		ConfigStore.update((currentConfig) => {
			const currentIndex = SPEED_PRESETS.findIndex((p) => p.value === currentConfig.animationRate);
			const nextIndex = (currentIndex + 1) % SPEED_PRESETS.length;
			return { ...currentConfig, animationRate: SPEED_PRESETS[nextIndex].value };
		});
	};

	const resetToStart = () => {
		TimelineStore.update((timeline) => {
			timeline.currTime = timeline.leftMarker;
			return timeline;
		});

		if ($P5Store && !isAnimating) {
			$P5Store.fillSelectedData();
		}
	};

</script>

<div class="flex flex-col w-11/12 h-full py-3">
	<div class="slider-row">
		<span class="edge-time">{formattedStart}</span>
		<div class="slider-container">
			<RangeSlider
				min={startTime}
				max={endTime}
				leftValue={timelineLeft}
				rightValue={timelineRight}
				progressValue={timelineCurr}
				on:change={handleSliderChange}
			/>
		</div>
		<span class="edge-time">{formattedEnd}</span>
	</div>

	<div class="controls-row">
		<span class="control-label">Animation</span>

		<div class="control-group">
			<button on:click={toggleAnimation} class="control-btn play-btn" aria-label={isAnimating ? 'Pause' : 'Play'}>
				{#if isAnimating}
					<Pause size={16} />
				{:else}
					<Play size={16} />
				{/if}
			</button>

			<div class="control-divider"></div>

			<button class="control-btn" on:click={resetToStart} title="Skip to start" aria-label="Skip to start">
				<SkipBack size={16} />
			</button>

			<div class="control-divider"></div>

			<button class="control-btn speed-btn" on:click={cycleSpeed} title="Click to change speed" aria-label="Animation speed: {speedLabel}">
				{speedLabel}
			</button>
		</div>

		<button class="current-time" on:click={cycleTimeFormat} title="Click to change time format">
			{formattedCurr} <span class="format-indicator">▾</span>
		</button>
	</div>
</div>

<style>
	.slider-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.edge-time {
		font-family: monospace;
		font-size: 0.75rem;
		color: #6b7280;
		white-space: nowrap;
		min-width: 3.5rem;
	}

	.edge-time:first-child {
		text-align: right;
	}

	.slider-container {
		flex: 1;
	}

	.controls-row {
		display: flex;
		width: 100%;
		margin-top: 0.5rem;
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
		width: 32px;
		height: 32px;
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
		height: 20px;
		background: #e5e7eb;
	}

	.current-time {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-family: monospace;
		font-size: 1.1rem;
		font-weight: 600;
		color: #1f2937;
		background: #f3f4f6;
		padding: 0.25rem 0.75rem;
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
