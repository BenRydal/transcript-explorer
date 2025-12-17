<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { TimeUtils } from '../core/time-utils';
	import TimelineStore from '../../stores/timelineStore';
	import P5Store from '../../stores/p5Store';
	import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
	import MdRefresh from 'svelte-icons/md/MdRefresh.svelte';
	import type p5 from 'p5';
	import TranscriptStore from '../../stores/transcriptStore';

	$: timelineLeft = $TimelineStore.getLeftMarker();
	$: timelineRight = $TimelineStore.getRightMarker();
	$: timelineCurr = $TimelineStore.getCurrTime();
	$: startTime = $TimelineStore.getStartTime();
	$: endTime = $TimelineStore.getEndTime();
	$: isAnimating = $TimelineStore.getIsAnimating();

	// Formatted time displays (reactive to both time values and format changes)
	$: formattedLeft = formatTimeDisplay(timelineLeft, currentTimeFormat);
	$: formattedRight = formatTimeDisplay(timelineRight, currentTimeFormat);
	$: formattedCurr = formatTimeDisplay(timelineCurr, currentTimeFormat);

	// Progress fill: starts at left marker, extends to current time (only when in range)
	$: leftMarkerPercent = endTime > startTime ? ((timelineLeft - startTime) / (endTime - startTime)) * 100 : 0;
	$: currTimePercent = endTime > startTime ? ((timelineCurr - startTime) / (endTime - startTime)) * 100 : 0;
	$: fillWidth = timelineCurr >= timelineLeft && timelineCurr <= timelineRight
		? Math.max(0, currTimePercent - leftMarkerPercent)
		: 0;

	import type { TimingMode } from '../../models/transcript';

	type TimeFormat = 'HHMMSS' | 'MMSS' | 'SECONDS' | 'DECIMAL' | 'WORDS';

	let currentTimeFormat: TimeFormat = 'HHMMSS';
	let timingMode: TimingMode = 'untimed';

	TranscriptStore.subscribe((data) => {
		const previousTimingMode = timingMode;
		timingMode = data.timingMode;

		// Update time format when timing mode changes
		if (data.wordArray.length > 0) {
			if (timingMode === 'untimed') {
				// Default to WORDS format for untimed transcripts
				currentTimeFormat = 'WORDS';
			} else if (previousTimingMode === 'untimed') {
				// Switching from untimed to timed mode - use time-based format
				currentTimeFormat = 'MMSS';
			}
		}
	});

	function cycleTimeFormat() {
		let formats: TimeFormat[];

		if (timingMode === 'untimed') {
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
				return TimeUtils.formatTime(seconds);
			case 'MMSS':
				return TimeUtils.formatTimeAuto(seconds);
			case 'SECONDS':
				return `${Math.round(seconds)}s`;
			case 'DECIMAL':
				return seconds.toFixed(1) + 's';
			case 'WORDS':
				return `${Math.round(seconds)} words`;
			default:
				return timingMode === 'untimed' ? `${Math.round(seconds)} words` : TimeUtils.formatTimeAuto(seconds);
		}
	}

	let p5Instance: p5 | null = null;

	P5Store.subscribe((value) => {
		p5Instance = value;
	});

	let sliderContainer: HTMLDivElement;
	let loaded = false;
	let debounceTimeout: number;

	let config: ConfigStoreType;
	ConfigStore.subscribe((value) => {
		config = value;
	});

	const toggleAnimation = () => {
		TimelineStore.update((timeline) => {
			timeline.setIsAnimating(!timeline.getIsAnimating());
			return timeline;
		});

		if (p5Instance) {
			if (!isAnimating) {
				let targetIndex = p5Instance.getAnimationTargetIndex();
				p5Instance.setAnimationCounter(targetIndex);
			} else {
				p5Instance.fillAllData();
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
		const leftX = rect.left;
		const rightX = rect.right;

		TimelineStore.update((timeline) => {
			timeline.updateXPositions({ leftX, rightX });
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
		const timeline = $TimelineStore;
		if (!timeline.getIsAnimating()) {
			clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(() => {
				p5Instance.fillSelectedData();
			}, 100);
		}

		TimelineStore.update((timeline) => {
			timeline.setLeftMarker(value1);
			// Keep currTime within bounds
			if (timeline.getCurrTime() < value1) {
				timeline.setCurrTime(value1);
			} else if (timeline.getCurrTime() > value2) {
				timeline.setCurrTime(value2);
			}
			timeline.setRightMarker(value2);
			updateXPositions();
			return timeline;
		});
	};

	// Speed presets for animation
	const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4];
	$: speedLabel = config.animationRate < 1
		? `${config.animationRate}x`
		: `${Math.round(config.animationRate)}x`;

	const increaseSpeed = () => {
		ConfigStore.update((currentConfig) => {
			const currentIndex = SPEED_PRESETS.findIndex(s => s >= currentConfig.animationRate);
			const nextIndex = Math.min(currentIndex + 1, SPEED_PRESETS.length - 1);
			return { ...currentConfig, animationRate: SPEED_PRESETS[nextIndex] };
		});
	};

	const decreaseSpeed = () => {
		ConfigStore.update((currentConfig) => {
			const currentIndex = SPEED_PRESETS.findIndex(s => s >= currentConfig.animationRate);
			const prevIndex = Math.max(currentIndex - 1, 0);
			return { ...currentConfig, animationRate: SPEED_PRESETS[prevIndex] };
		});
	};

	const resetToStart = () => {
		TimelineStore.update((timeline) => {
			timeline.setCurrTime(timeline.getLeftMarker());
			return timeline;
		});

		if (p5Instance && !isAnimating) {
			p5Instance.fillSelectedData();
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
				generate-labels="true"
				range-dragging="true"
				pointer1-width="6px"
				pointer1-height="30px"
				pointer1-radius="0"
				pointer2-width="6px"
				pointer2-height="30px"
				pointer2-radius="0"
				on:change={handleChange}
			/>
		</div>

		<div class="controls-row">
			<!-- Left: Animation label + play/pause + reset + speed -->
			<div class="flex items-center gap-3">
				<span class="section-label">Animation</span>

				<div class="flex items-center gap-1">
					<button on:click={toggleAnimation} class="play-pause-btn" aria-label={isAnimating ? 'Pause' : 'Play'}>
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

					<button
						class="reset-btn"
						on:click={resetToStart}
						title="Reset to start"
						aria-label="Reset to start"
					>
						<MdRefresh />
					</button>
				</div>

				<div class="speed-controls">
					<button
						class="speed-adjust"
						on:click={decreaseSpeed}
						title="Slower"
						aria-label="Decrease speed"
					>
						−
					</button>
					<span class="speed-display">{speedLabel}</span>
					<button
						class="speed-adjust"
						on:click={increaseSpeed}
						title="Faster"
						aria-label="Increase speed"
					>
						+
					</button>
				</div>
			</div>

			<!-- Center: Current time display -->
			<button
				class="current-time"
				on:click={cycleTimeFormat}
				title="Click to change time format"
			>
				{formattedCurr}
			</button>

			<!-- Right: Time range -->
			<button
				class="time-range"
				on:click={cycleTimeFormat}
				title="Click to change time format"
			>
				<span class="font-mono text-sm text-gray-500">{formattedLeft} – {formattedRight}</span>
			</button>
		</div>
	</div>
{/if}

<style>
	.controls-row {
		display: flex;
		width: 100%;
		margin-top: 0.5rem;
		align-items: center;
		justify-content: space-between;
	}

	.section-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.current-time {
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

	.reset-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
		transition: background-color 0.2s, color 0.2s;
		padding: 2px;
	}

	.reset-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.reset-btn :global(svg) {
		width: 16px;
		height: 16px;
	}

	.time-range {
		border: none;
		background: none;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background-color 0.2s;
	}

	.time-range:hover {
		background: #f3f4f6;
	}

	.slider-container {
		position: relative;
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

	:host {
		width: 100% !important;
	}

	.play-pause-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 50%;
		background-color: #3b82f6;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.play-pause-btn:hover {
		background-color: #2563eb;
	}

	.play-pause-btn svg {
		width: 16px;
		height: 16px;
		color: #ffffff;
	}

	.speed-controls {
		display: flex;
		align-items: center;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
	}

	.speed-adjust {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background-color: #ffffff;
		color: #6b7280;
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
		font-size: 1rem;
		font-weight: 500;
	}

	.speed-adjust:hover {
		background-color: #f3f4f6;
		color: #374151;
	}

	.speed-display {
		font-family: monospace;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		color: #374151;
		min-width: 2.5rem;
		text-align: center;
		border-left: 1px solid #e5e7eb;
		border-right: 1px solid #e5e7eb;
	}
</style>
