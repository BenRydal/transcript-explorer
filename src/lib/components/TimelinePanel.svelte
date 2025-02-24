<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { TimeUtils } from '../core/time-utils';
	import TimelineStore from '../../stores/timelineStore';
	import P5Store from '../../stores/p5Store';
	import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
	import MdFastForward from 'svelte-icons/md/MdFastForward.svelte';
	import MdFastRewind from 'svelte-icons/md/MdFastRewind.svelte';
	import type p5 from 'p5';
	import TranscriptStore from '../../stores/transcriptStore';

	$: timelineLeft = $TimelineStore.getLeftMarker();
	$: timelineRight = $TimelineStore.getRightMarker();
	$: timelineCurr = $TimelineStore.getCurrTime();
	$: startTime = $TimelineStore.getStartTime();
	$: endTime = $TimelineStore.getEndTime();
	$: leftX = $TimelineStore.getLeftX();
	$: rightX = $TimelineStore.getRightX();
	$: isAnimating = $TimelineStore.getIsAnimating();

	$: formattedLeft = formatTimeDisplay(timelineLeft);
	$: formattedRight = formatTimeDisplay(timelineRight);
	$: formattedCurr = formatTimeDisplay(timelineCurr);

	$: {
		if (currentTimeFormat) {
			formattedLeft = formatTimeDisplay(timelineLeft);
			formattedRight = formatTimeDisplay(timelineRight);
			formattedCurr = formatTimeDisplay(timelineCurr);
		}
	}

	type TimeFormat = 'HHMMSS' | 'MMSS' | 'SECONDS' | 'DECIMAL' | 'WORDS';

	let currentTimeFormat: TimeFormat = 'HHMMSS';
	let useWordCounts = false;

	TranscriptStore.subscribe((transcript) => {
		const hasTimeData =
			transcript.wordArray.length > 0 &&
			transcript.wordArray.some((word) => word.useWordCountsAsFallback === false);
			useWordCounts = !hasTimeData && transcript.wordArray.length > 0;
			if (useWordCounts) {
				currentTimeFormat = 'WORDS';
			} else if (hasTimeData) {
				currentTimeFormat = 'TIME';
			}
	});

	function cycleTimeFormat() {
		let formats: TimeFormat[];

		if (useWordCounts) {
			formats = ['WORDS'];
		} else {
			formats = ['HHMMSS', 'MMSS', 'SECONDS', 'DECIMAL', 'WORDS'];
		}

		const currentIndex = formats.indexOf(currentTimeFormat);
		const nextIndex = (currentIndex + 1) % formats.length;
		currentTimeFormat = formats[nextIndex];
	}

	function formatTimeDisplay(seconds: number): string {
		switch (currentTimeFormat) {
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
				return useWordCounts ? `${Math.round(seconds)} words` : TimeUtils.formatTimeAuto(seconds);
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
			if (!isAnimating) p5Instance.resetAnimation();
			else p5Instance.fillAllData();
			p5Instance.videoController.timelinePlayPause();
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
			value3: number;
		};
	}

	const handleChange = (event: SliderChangeEvent): void => {
		const { value1, value2, value3 } = event.detail;
		if (value1 === timelineLeft && value2 === timelineCurr && value3 === timelineRight) {
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
			timeline.setCurrTime(value2);
			timeline.setRightMarker(value3);
			updateXPositions();
			return timeline;
		});
	};

	const speedUp = () => {
		ConfigStore.update((currentConfig) => {
			const newRate = Math.min(currentConfig.animationRate + 0.05, 1);
			return { ...currentConfig, animationRate: newRate };
		});
	};

	const slowDown = () => {
		ConfigStore.update((currentConfig) => {
			const newRate = Math.max(currentConfig.animationRate - 0.05, 0.01);
			return { ...currentConfig, animationRate: newRate };
		});
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
	<div class="flex flex-col w-11/12 h-full py-5">
		<div class="slider-container" bind:this={sliderContainer}>
			<tc-range-slider
				min={startTime}
				max={endTime}
				value1={timelineLeft}
				value2={timelineCurr}
				value3={timelineRight}
				round="0"
				slider-width="100%"
				generate-labels="true"
				range-dragging="true"
				pointer1-width="6px"
				pointer1-height="30px"
				pointer1-radius="0"
				pointer2-width="20px"
				pointer2-height="20px"
				pointer2-radius="50%"
				pointer3-width="6px"
				pointer3-height="30px"
				pointer3-radius="0"
				on:change={handleChange}
			/>
		</div>

		<div class="flex w-full mt-2 items-center space-x-4">
			<button on:click={slowDown} class="speed-btn" aria-label="Slow Down">
				<MdFastRewind class="w-6 h-6" />
			</button>

			<button on:click={toggleAnimation} class="play-pause-btn" aria-label={isAnimating ? 'Pause' : 'Play'}>
				{#if isAnimating}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
						<path
							fill-rule="evenodd"
							d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
							clip-rule="evenodd"
						/>
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
						<path
							fill-rule="evenodd"
							d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
							clip-rule="evenodd"
						/>
					</svg>
				{/if}
			</button>

			<button on:click={speedUp} class="speed-btn" aria-label="Speed Up">
				<MdFastForward class="w-6 h-6" />
			</button>

			<div class="flex flex-col items-start">
				<button
					class="time-display hover:bg-gray-100 rounded px-2 transition-colors h-6 flex items-center"
					on:click={cycleTimeFormat}
					title="Click to change time format"
				>
					<span class="font-mono text-sm">{formattedCurr} / {formattedRight}</span>
				</button>
				<span class="text-sm text-gray-600 px-2">Speed: {config.animationRate.toFixed(2)}x</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.time-display {
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.time-display:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}

	:host {
		width: 100% !important;
	}

	.play-pause-btn,
	.speed-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 50%;
		background-color: #ffffff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.play-pause-btn:hover,
	.speed-btn:hover {
		background-color: #f0f0f0;
	}

	.play-pause-btn svg,
	.speed-btn svg {
		width: 24px;
		height: 24px;
		color: #000000;
	}

	.flex.space-x-4 > * {
		margin-right: 1rem;
	}

	.flex-col p {
		margin: 0;
	}
</style>
