<script lang="ts">
	import { trapFocus } from '$lib/a11y/focus-trap';

	interface Props {
		isOpen: boolean;
	}

	let { isOpen = $bindable(false) }: Props = $props();

	let tourStep = $state(0);
	let tourCardEl: HTMLDivElement | null = $state(null);

	/**
	 * Focus-trap + focus-restore for the tour card. Engages whenever the
	 * overlay is open; the helper focuses the first focusable button (Back
	 * / Next / Skip) and restores focus to the pre-open target on close.
	 */
	$effect(() => {
		if (!isOpen || !tourCardEl) return;
		return trapFocus(tourCardEl);
	});

	const tourSteps = [
		{
			target: '[data-tour="examples"]',
			title: 'Load a Transcript',
			content: 'Start here to load your own transcript or one of the sample datasets. Reopen the welcome screen anytime from the ? button in the left rail.'
		},
		{
			target: '[data-tour="viz-modes"]',
			title: 'Sidebar & Workspaces',
			content: 'Use this rail to switch visualizations, filters, upload data, and settings. Switch workspaces with Edit / Present / Transcribe (keys 1 / 2 / 3) in the top bar.'
		},
		{
			target: '[data-tour="visualization"]',
			title: 'Visualization Canvas',
			content: 'Your transcript visualizations appear here. Each one has its own playback style. Left-click to play video, right-click for more actions.'
		},
		{
			target: '[data-tour="speakers"]',
			title: 'Speaker Controls',
			content: 'Toggle speaker visibility with the eye icon. Click names to change colors or rename speakers.'
		},
		{
			target: '[data-tour="timeline"]',
			title: 'Timeline Controls',
			content: 'Animate through the conversation. Drag the handles to set the range. The left handle marks where Play starts, and the playhead follows it.'
		}
	];

	export function start() {
		isOpen = true;
		tourStep = 0;
	}

	function nextStep() {
		if (tourStep < tourSteps.length - 1) {
			tourStep++;
		} else {
			isOpen = false;
		}
	}

	function prevStep() {
		if (tourStep > 0) {
			tourStep--;
		}
	}

	function end() {
		isOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) return;
		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				e.preventDefault();
				nextStep();
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				e.preventDefault();
				prevStep();
				break;
			case 'Escape':
				e.preventDefault();
				end();
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	{@const step = tourSteps[tourStep]}
	{@const rect = document.querySelector(step.target)?.getBoundingClientRect()}
	{@const isLarge = rect && rect.height > window.innerHeight * 0.5}
	{@const tooltipTop = rect
		? isLarge
			? rect.top + 40
			: window.innerHeight - rect.bottom > 180
				? rect.bottom + 12
				: rect.top > 180
					? rect.top - 172
					: rect.top + 40
		: window.innerHeight / 2 - 80}
	{@const tooltipLeft = rect ? Math.max(16, Math.min(rect.left + rect.width / 2 - 160, window.innerWidth - 336)) : window.innerWidth / 2 - 160}

	<div class="fixed inset-0 z-[9999] pointer-events-none">
		<!-- Scrim: a passive visual layer. Clicking dismisses the tour;
		     keyboard users should Escape instead. Not focusable so it
		     doesn't pollute the tab order; aria-hidden so screen readers
		     ignore it. -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute inset-0 bg-black/50 pointer-events-auto cursor-default"
			aria-hidden="true"
			onclick={end}
		></div>

		{#if rect}
			<div
				class="tour-highlight"
				style="top: {rect.top - 4}px; left: {rect.left - 4}px; width: {rect.width + 8}px; height: {rect.height +
					8}px;"
			></div>
		{/if}

		<div
			bind:this={tourCardEl}
			class="tour-card"
			style="top: {tooltipTop}px; left: {tooltipLeft}px;"
			role="dialog"
			aria-modal="true"
			aria-labelledby="tour-card-title"
			aria-describedby="tour-card-body"
		>
			<div class="flex justify-between items-start mb-2">
				<h3 id="tour-card-title" class="tour-card__title">{step.title}</h3>
				<span class="tour-card__step">{tourStep + 1}/{tourSteps.length}</span>
			</div>
			<p id="tour-card-body" class="tour-card__body">{step.content}</p>
			<div class="flex justify-between items-center">
				<button class="tour-card__skip" onclick={end}>Skip</button>
				<div class="flex gap-2">
					{#if tourStep > 0}
						<button class="te-btn te-btn--sm te-btn--ghost" onclick={prevStep}>Back</button>
					{/if}
					<button class="te-btn te-btn--sm te-btn--primary" onclick={nextStep}>
						{tourStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.tour-card {
		position: absolute;
		width: 20rem;
		padding: var(--te-sp-4);
		background: var(--te-bg);
		color: var(--te-fg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
		pointer-events: auto;
	}

	.tour-card__title {
		margin: 0;
		font-weight: 700;
		color: var(--te-fg);
	}

	.tour-card__step {
		font-size: var(--te-font-label);
		color: var(--te-fg-subtle);
	}

	.tour-card__body {
		margin: 0 0 var(--te-sp-4) 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.tour-card__skip {
		background: transparent;
		border: none;
		padding: var(--te-sp-1) var(--te-sp-2);
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		cursor: pointer;
	}

	.tour-card__skip:hover {
		color: var(--te-fg);
	}

	.tour-highlight {
		position: absolute;
		border: 2px solid var(--te-accent);
		border-radius: var(--te-radius-lg);
		pointer-events: none;
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
	}
</style>
