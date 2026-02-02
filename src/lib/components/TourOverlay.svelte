<script lang="ts">
	interface Props {
		isOpen: boolean;
	}

	let { isOpen = $bindable(false) }: Props = $props();

	let tourStep = $state(0);

	const tourSteps = [
		{
			target: '[data-tour="examples"]',
			title: 'Example Datasets',
			content: 'Load example transcripts to explore the tool. Choose from classroom discussions, museum visits, or debates.'
		},
		{
			target: '[data-tour="viz-modes"]',
			title: 'Visualizations & Options',
			content: 'Switch between visualizations and configure their options. Options appear below the active visualization.'
		},
		{
			target: '[data-tour="visualization"]',
			title: 'Visualization Canvas',
			content: 'Your transcript visualizations appear here. Click to play video — each visualization offers a unique playback style.'
		},
		{
			target: '[data-tour="speakers"]',
			title: 'Speaker Controls',
			content: 'Toggle speaker visibility with the eye icon. Click names to change colors or rename speakers.'
		},
		{
			target: '[data-tour="timeline"]',
			title: 'Timeline Controls',
			content: 'Animate through the conversation. Drag markers to set the playback range.'
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
		<button class="absolute inset-0 bg-black/50 pointer-events-auto cursor-default" onclick={end} aria-label="Close tour"></button>

		{#if rect}
			<div
				class="absolute border-2 border-blue-500 rounded-lg pointer-events-none"
				style="top: {rect.top - 4}px; left: {rect.left - 4}px; width: {rect.width + 8}px; height: {rect.height +
					8}px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5);"
			></div>
		{/if}

		<div class="absolute bg-white rounded-lg shadow-xl p-4 pointer-events-auto w-80" style="top: {tooltipTop}px; left: {tooltipLeft}px;">
			<div class="flex justify-between items-start mb-2">
				<h3 class="font-bold text-gray-800">{step.title}</h3>
				<span class="text-xs text-gray-400">{tourStep + 1}/{tourSteps.length}</span>
			</div>
			<p class="text-sm text-gray-600 mb-4">{step.content}</p>
			<div class="flex justify-between items-center">
				<button class="text-sm text-gray-500 hover:text-gray-700" onclick={end}>Skip</button>
				<div class="flex gap-2">
					{#if tourStep > 0}
						<button class="btn btn-sm btn-ghost" onclick={prevStep}>Back</button>
					{/if}
					<button class="btn btn-sm btn-primary" onclick={nextStep}>
						{tourStep === tourSteps.length - 1 ? 'Finish' : 'Next'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
