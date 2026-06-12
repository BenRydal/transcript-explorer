<script lang="ts">
	import { get } from 'svelte/store';
	import VizStore, { type VizStoreType } from '../../stores/vizStore';
	import AppSettingsStore, { type AppSettingsStoreType } from '../../stores/appSettingsStore';
	import TimelineStore from '../../stores/timelineStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import { applyTimingModeToWordArray, updateTimelineFromData } from '$lib/core/timing-utils';
	import { toSeconds, formatTimeAuto } from '$lib/core/time-utils';
	import P5Store from '../../stores/p5Store';
	import { themeChoice, selectTheme, type ThemeChoice } from '$lib/ui/theme';
	import { SPEAKER_PALETTES, type SpeakerPaletteChoice } from '$lib/ui/palette';
	import { speakerPalette, selectSpeakerPalette } from '$lib/ui/speaker-palette';

	const SPEAKER_PALETTE_ENTRIES = Object.entries(SPEAKER_PALETTES) as [SpeakerPaletteChoice, (typeof SPEAKER_PALETTES)[SpeakerPaletteChoice]][];

	function setVizField<K extends keyof VizStoreType>(key: K, value: VizStoreType[K]) {
		VizStore.update((store) => ({ ...store, [key]: value }));
	}

	function setAppSettingsField<K extends keyof AppSettingsStoreType>(key: K, value: AppSettingsStoreType[K]) {
		AppSettingsStore.update((store) => ({ ...store, [key]: value }));
	}

	function recalculateStartOnlyEndTimes() {
		if ($TranscriptStore.timingMode !== 'startOnly' || $TranscriptStore.wordArray.length === 0) return;
		TranscriptStore.update((transcript) => ({
			...transcript,
			wordArray: applyTimingModeToWordArray(transcript.wordArray, 'startOnly')
		}));
		updateTimelineFromData(get(TranscriptStore).wordArray, false);
		const p5Instance = get(P5Store);
		p5Instance?.fillAllData?.();
	}

	function setTimelineDuration(value: number) {
		TimelineStore.update((timeline) => {
			timeline.currTime = 0;
			timeline.startTime = 0;
			timeline.endTime = value;
			timeline.leftMarker = 0;
			timeline.rightMarker = value;
			return timeline;
		});
	}
</script>

<div class="settings-panel">
	<!-- Timeline Duration -->
	<section class="settings-panel__section">
		<p class="settings-panel__section-label">
			{$TranscriptStore.timingMode === 'untimed' ? 'Total Words' : 'Timeline Duration'}
		</p>
		{#if $TranscriptStore.timingMode === 'untimed'}
			<p class="settings-panel__hint">Total word count for the timeline range</p>
			<input
				type="text"
				class="settings-panel__input"
				value={Math.round($TimelineStore.endTime)}
				placeholder="e.g. 500"
				onchange={(e) => {
					const input = e.target as HTMLInputElement;
					const val = parseInt(input.value);
					if (!isNaN(val) && val > 0) setTimelineDuration(val);
					input.value = String(Math.round($TimelineStore.endTime));
				}}
			/>
		{:else}
			<p class="settings-panel__hint">Enter as seconds, MM:SS, or HH:MM:SS</p>
			<input
				type="text"
				class="settings-panel__input"
				value={formatTimeAuto($TimelineStore.endTime)}
				placeholder="e.g. 90, 1:30, or 0:01:30"
				onchange={(e) => {
					const input = e.target as HTMLInputElement;
					const seconds = toSeconds(input.value);
					if (seconds !== null && seconds > 0) setTimelineDuration(seconds);
					input.value = formatTimeAuto($TimelineStore.endTime);
				}}
			/>
		{/if}
	</section>

	<!-- Start-Only Mode Settings -->
	{#if $TranscriptStore.timingMode === 'startOnly'}
		<section class="settings-panel__section">
			<p class="settings-panel__section-label">Turn End Time Calculation</p>
			<p class="settings-panel__hint">For transcripts with only start times</p>
			<label class="settings-panel__radio-row">
				<input
					type="radio"
					name="endTimeCalculation"
					checked={!$AppSettingsStore.preserveGapsBetweenTurns}
					onchange={() => {
						setAppSettingsField('preserveGapsBetweenTurns', false);
						recalculateStartOnlyEndTimes();
					}}
				/>
				<span>Fill to next turn <span class="settings-panel__sub">(no gaps)</span></span>
			</label>
			<label class="settings-panel__radio-row">
				<input
					type="radio"
					name="endTimeCalculation"
					checked={$AppSettingsStore.preserveGapsBetweenTurns}
					onchange={() => {
						setAppSettingsField('preserveGapsBetweenTurns', true);
						recalculateStartOnlyEndTimes();
					}}
				/>
				<span>Estimate from speech rate <span class="settings-panel__sub">(preserves silence)</span></span>
			</label>
			<label class="settings-panel__slider-label">
				<span>Speech rate: {$AppSettingsStore.speechRateWordsPerSecond} words/sec</span>
				<input
					type="range"
					min="1"
					max="6"
					step="0.5"
					value={$AppSettingsStore.speechRateWordsPerSecond}
					class="settings-panel__slider"
					oninput={(e) => {
						setAppSettingsField('speechRateWordsPerSecond', parseFloat((e.target as HTMLInputElement).value));
						recalculateStartOnlyEndTimes();
					}}
				/>
			</label>
		</section>
	{/if}

	<!-- Word Filtering -->
	<section class="settings-panel__section">
		<p class="settings-panel__section-label">Word Filtering</p>
		<label class="settings-panel__check-row">
			<input
				type="checkbox"
				role="switch"
				aria-checked={$VizStore.stopWordsToggle}
				checked={$VizStore.stopWordsToggle}
				onchange={() => setVizField('stopWordsToggle', !$VizStore.stopWordsToggle)}
			/>
			<span>Hide stop words</span>
		</label>
		<p class="settings-panel__hint">Removes common words (the, is, and, etc.) from all visualizations.</p>
	</section>

	<!-- Video Playback -->
	<section class="settings-panel__section">
		<p class="settings-panel__section-label">Video Playback</p>
		<label class="settings-panel__slider-label">
			<span>Turn preview: {$AppSettingsStore.snippetDurationSeconds}s</span>
			<p class="settings-panel__hint">When clicking a speaker in the distribution diagram, plays this duration from each turn.</p>
			<input
				type="range"
				min="1"
				max="5"
				step="1"
				value={$AppSettingsStore.snippetDurationSeconds}
				class="settings-panel__slider"
				oninput={(e) => setAppSettingsField('snippetDurationSeconds', parseInt((e.target as HTMLInputElement).value))}
			/>
		</label>
	</section>

	<!-- Appearance -->
	<section class="settings-panel__section">
		<p class="settings-panel__section-label">Appearance</p>
		<select class="settings-panel__input" aria-label="Theme" value={$themeChoice} onchange={(e) => selectTheme(e.currentTarget.value as ThemeChoice)}>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
			<option value="system">System</option>
		</select>
		<p class="settings-panel__hint">System follows your OS preference; Light and Dark persist across reloads.</p>

		<p class="settings-panel__sub-label">Speaker colors</p>
		<select
			class="settings-panel__input"
			aria-label="Speaker color palette"
			value={$speakerPalette}
			onchange={(e) => selectSpeakerPalette(e.currentTarget.value as SpeakerPaletteChoice)}
		>
			{#each SPEAKER_PALETTE_ENTRIES as [key, palette] (key)}
				<option value={key}>{palette.label}</option>
			{/each}
		</select>
		<div class="settings-panel__swatch-preview" aria-hidden="true">
			{#each SPEAKER_PALETTES[$speakerPalette].colors as color (color)}
				<span class="settings-panel__preview-swatch" style:background={color}></span>
			{/each}
		</div>
		<p class="settings-panel__hint">Sets default colors for new speakers and re-colors existing ones.</p>
	</section>
</div>

<style>
	.settings-panel {
		display: flex;
		flex-direction: column;
		padding: var(--te-sp-3);
		gap: 14px;
		font: var(--te-font-body) / var(--te-leading) var(--te-font-stack);
		color: var(--te-fg);
	}

	.settings-panel__section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.settings-panel__section-label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
		margin: 0;
	}

	.settings-panel__hint {
		margin: 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.settings-panel__sub {
		color: var(--te-fg-muted);
		font-size: var(--te-font-small);
	}

	.settings-panel__sub-label {
		margin: 4px 0 0;
		font-size: var(--te-font-small);
		font-weight: 600;
		color: var(--te-fg);
	}

	.settings-panel__swatch-preview {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		width: 100%;
		margin-top: 2px;
	}

	.settings-panel__preview-swatch {
		width: 16px;
		height: 16px;
		border-radius: var(--te-radius);
		border: 1px solid var(--te-border);
	}

	.settings-panel__input {
		width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		background: var(--te-bg);
		font: inherit;
		color: var(--te-fg);
	}

	.settings-panel__input:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
		border-color: var(--te-accent);
	}

	.settings-panel__check-row,
	.settings-panel__radio-row {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		cursor: pointer;
		padding: 3px 2px;
	}

	.settings-panel__check-row input,
	.settings-panel__radio-row input {
		width: 15px;
		height: 15px;
		cursor: pointer;
	}

	.settings-panel__slider-label {
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-1);
		padding: 3px 0;
	}

	.settings-panel__slider {
		width: 100%;
	}
</style>
