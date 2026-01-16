<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { formatTime, formatTimeAuto } from '../core/time-utils';
	import TimelineStore from '../../stores/timelineStore';
	import P5Store from '../../stores/p5Store';
	import ConfigStore from '../../stores/configStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import MdSkipPrevious from 'svelte-icons/md/MdSkipPrevious.svelte';
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

	// Progress fill: starts at left marker, extends to current time
	$: leftMarkerPercent = endTime > startTime ? ((timelineLeft - startTime) / (endTime - startTime)) * 100 : 0;
	$: currTimePercent = endTime > startTime ? ((timelineCurr - startTime) / (endTime - startTime)) * 100 : 0;
	$: fillWidth = timelineCurr >= timelineLeft && timelineCurr <= timelineRight
		? Math.max(0, currTimePercent - leftMarkerPercent)
		: 0;

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

	let sliderContainer: HTMLDivElement;
	let loaded = false;
	let debounceTimeout: number;

	const toggleAnimation = () => {
		TimelineStore.update((timeline) => {
			timeline.isAnimating = !timeline.isAnimating;
			return timeline;
		});

		if ($P5Store) {
			if (!isAnimating) {
				let targetIndex = $P5Store.getAnimationTargetIndex();
				$P5Store.setAnimationCounter(targetIndex);
			} else {
				$P5Store.fillAllData();
			}
		}
	};

	const updateXPositions = (): void => {
		if (!sliderContainer) {
			console.warn('Slider container not available.');
			loaded = false;
			return;
		}

		const rect = sliderContainer.getBoundingClientRect();
		TimelineStore.update((timeline) => {
			timeline.leftX = rect.left;
			timeline.rightX = rect.right;
			return timeline;
		});

		loaded = true;
	};

	interface SliderChangeEvent extends Event {
		detail: {
			value1: number;
			value2: number;
		};
	}

	const handleChange = (event: SliderChangeEvent): void => {
		const { value1, value2 } = event.detail;
		if (value1 === timelineLeft && value2 === timelineRight) {
			return;
		}

		if (!$TimelineStore.isAnimating) {
			clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(() => {
				$P5Store.fillSelectedData();
			}, 100);
		}

		TimelineStore.update((t) => {
			t.leftMarker = value1;
			t.rightMarker = value2;
			// Keep currTime within bounds
			if (t.currTime < value1) t.currTime = value1;
			else if (t.currTime > value2) t.currTime = value2;
			updateXPositions();
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

	$: speedLabel = SPEED_PRESETS.find(p => p.value === $ConfigStore.animationRate)?.label ?? '3x';

	const cycleSpeed = () => {
		ConfigStore.update((currentConfig) => {
			const currentIndex = SPEED_PRESETS.findIndex(p => p.value === currentConfig.animationRate);
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

	onMount(async () => {
		if (typeof window !== 'undefined') {
			import('toolcool-range-slider').then(async () => {
				loaded = true;
				const slider = document.querySelector('tc-range-slider');
				if (slider) {
					slider.addEventListener('change', (event: Event) => {
						handleChange(event as SliderChangeEvent);
					});
				}
				await tick();
				updateXPositions();
			});

			window.addEventListener('resize', updateXPositions);
		}
	});

	onDestroy(() => {
		if (typeof window === 'undefined') return;
		window.removeEventListener('resize', updateXPositions);
	});
</script>

{#if loaded}
	<div class="flex flex-col w-11/12 h-full py-3">
		<!-- Slider with edge time labels -->
		<div class="slider-row">
			<span class="edge-time">{formattedStart}</span>
			<div class="slider-container" bind:this={sliderContainer}>
				<!-- Custom progress fill overlay - fills from left marker to current time -->
				<div class="progress-fill" style="left: {leftMarkerPercent}%; width: {fillWidth}%;"></div>

				<tc-range-slider
					min={startTime}
					max={endTime}
					value1={timelineLeft}
					value2={timelineRight}
					round="0"
					slider-width="100%"
					generate-labels="false"
					range-dragging="true"
					slider-bg="#e5e7eb"
					slider-bg-fill="#cbd5e1"
					pointer1-width="6px"
					pointer1-height="30px"
					pointer1-radius="0"
					pointer2-width="6px"
					pointer2-height="30px"
					pointer2-radius="0"
					on:change={handleChange}
				/>
			</div>
			<span class="edge-time">{formattedEnd}</span>
		</div>

		<div class="controls-row">
			<div class="edge-spacer"></div>

			<div class="control-wrapper">
				<span class="control-label">Animation</span>
				<div class="control-group">
				<button on:click={toggleAnimation} class="control-btn play-btn" aria-label={isAnimating ? 'Pause' : 'Play'}>
					{#if isAnimating}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
								clip-rule="evenodd"
							/>
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
								clip-rule="evenodd"
							/>
						</svg>
					{/if}
				</button>

				<div class="control-divider"></div>

				<button
					class="control-btn"
					on:click={resetToStart}
					title="Skip to start"
					aria-label="Skip to start"
				>
					<MdSkipPrevious />
				</button>

				<div class="control-divider"></div>

				<button
					class="control-btn speed-btn"
					on:click={cycleSpeed}
					title="Click to change speed"
					aria-label="Animation speed: {speedLabel}"
				>
					{speedLabel}
				</button>
				</div>
			</div>

			<button
				class="current-time"
				on:click={cycleTimeFormat}
				title="Click to change time format"
			>
				{formattedCurr} <span class="format-indicator">▾</span>
			</button>

			<div class="edge-spacer"></div>
		</div>
	</div>
{/if}

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

	.edge-time:last-child {
		text-align: left;
	}

	.slider-container {
		position: relative;
		flex: 1;
	}

	.progress-fill {
		position: absolute;
		top: 50%;
		left: 0;
		transform: translateY(-50%);
		height: 6px;
		background-color: #3b82f6;
		border-radius: 3px;
		pointer-events: none;
		z-index: 1;
		transition: width 0.05s linear;
	}

	.controls-row {
		display: flex;
		width: 100%;
		margin-top: 0.5rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.edge-spacer {
		min-width: 3.5rem;
	}

	.control-wrapper {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
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
		transition: background-color 0.15s, color 0.15s;
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

	.control-btn svg,
	.control-btn :global(svg) {
		width: 16px;
		height: 16px;
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
