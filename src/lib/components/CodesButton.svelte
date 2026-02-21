<script lang="ts">
	import { onMount } from 'svelte';
	import { computePosition, flip, shift, offset } from '@floating-ui/dom';
	import CodeStore from '../../stores/codeStore';
	import ConfigStore from '../../stores/configStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import P5Store from '../../stores/p5Store';
	import { clearAllCodes } from '../core/code-utils';

	let buttonElement = $state<HTMLButtonElement | null>(null);
	let dropdownElement = $state<HTMLDivElement | null>(null);
	let isOpen = $state(false);

	const p5Instance = $derived($P5Store);

	const sortedCodes = $derived(
		[...$CodeStore].sort((a, b) => a.code.localeCompare(b.code))
	);

	const allEnabled = $derived($CodeStore.every((c) => c.enabled));

	function close() {
		isOpen = false;
	}

	// Position dropdown using floating-ui
	$effect(() => {
		if (isOpen && dropdownElement && buttonElement) {
			computePosition(buttonElement, dropdownElement, {
				placement: 'top',
				middleware: [offset(8), flip(), shift({ padding: 8 })]
			}).then(({ x, y }) => {
				if (dropdownElement) {
					dropdownElement.style.left = `${x}px`;
					dropdownElement.style.top = `${y}px`;
				}
			});
		}
	});

	// Close dropdown when clicking outside
	onMount(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (!isOpen) return;
			const target = event.target as HTMLElement;
			if (buttonElement?.contains(target)) return;
			if (dropdownElement?.contains(target)) return;
			close();
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	function handleToggleAll() {
		const newEnabled = !allEnabled;
		CodeStore.update((codes) => codes.map((c) => ({ ...c, enabled: newEnabled })));
		p5Instance?.loop();
	}

	function handleCodeEnabledChange(code: string, enabled: boolean) {
		CodeStore.update((codes) => codes.map((c) => (c.code === code ? { ...c, enabled } : c)));
		p5Instance?.loop();
	}

	function handleColorChange(code: string, color: string) {
		CodeStore.update((codes) => codes.map((c) => (c.code === code ? { ...c, color } : c)));
		p5Instance?.loop();
	}

	function handleToggleColorMode() {
		ConfigStore.update((config) => ({ ...config, codeColorMode: !config.codeColorMode }));
		p5Instance?.loop();
	}

	function handleToggleShowUncoded() {
		ConfigStore.update((config) => ({ ...config, showUncoded: !config.showUncoded }));
		p5Instance?.loop();
	}

	function handleClearCodes() {
		const transcript = $TranscriptStore;
		if (transcript?.wordArray) {
			clearAllCodes(transcript.wordArray);
			ConfigStore.update((c) => ({ ...c, codeColorMode: false, showUncoded: true }));
			p5Instance?.fillAllData?.();
		}
		close();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && isOpen && close()} />

<button
	bind:this={buttonElement}
	class="codes-button"
	onclick={() => (isOpen = !isOpen)}
	aria-haspopup="true"
	aria-expanded={isOpen}
>
	Codes
	<svg class="chevron" viewBox="0 0 24 24" fill="currentColor">
		<path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
	</svg>
</button>

{#if isOpen}
	<div
		bind:this={dropdownElement}
		class="codes-dropdown"
		onwheel={(e) => e.stopPropagation()}
		role="menu"
	>
		<ul class="codes-list">
			<li class="dropdown-item">
				<label class="checkbox-label">
					<input type="checkbox" class="checkbox" checked={allEnabled} onchange={handleToggleAll} />
					Enable All
				</label>
			</li>

			<li class="dropdown-item">
				<label class="checkbox-label">
					<input
						type="checkbox"
						class="checkbox"
						checked={$ConfigStore.codeColorMode}
						onchange={handleToggleColorMode}
					/>
					Color by Codes
				</label>
			</li>

			<li class="dropdown-item">
				<label class="checkbox-label">
					<input
						type="checkbox"
						class="checkbox"
						checked={$ConfigStore.showUncoded}
						onchange={handleToggleShowUncoded}
					/>
					Show Uncoded
				</label>
			</li>

			<li class="dropdown-item">
				<button class="clear-codes-button" onclick={handleClearCodes}>
					Clear All Codes
				</button>
			</li>

			<li class="divider"></li>

			{#each sortedCodes as code, index (code.code)}
				<li class="code-header">{code.code.toUpperCase()}</li>
				<li class="dropdown-item">
					<label class="checkbox-label">
						<input
							type="checkbox"
							class="checkbox"
							checked={code.enabled}
							onchange={(e) => handleCodeEnabledChange(code.code, e.currentTarget.checked)}
						/>
						Enabled
					</label>
				</li>
				<li class="dropdown-item">
					<div class="color-row">
						<input
							type="color"
							class="color-picker"
							value={code.color}
							onchange={(e) => handleColorChange(code.code, e.currentTarget.value)}
						/>
						<span>Color</span>
					</div>
				</li>
				{#if index !== sortedCodes.length - 1}
					<li class="divider"></li>
				{/if}
			{/each}
		</ul>
	</div>
{/if}

<style>
	.codes-button {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.375rem 0.625rem;
		border-radius: 9999px;
		background-color: #e5e5e5;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: #1f2937;
		transition: background-color 0.15s;
		flex-shrink: 0;
	}

	.codes-button:hover {
		background-color: #d4d4d4;
	}

	.codes-button:active {
		background-color: #c4c4c4;
	}

	.chevron {
		width: 1rem;
		height: 1rem;
		margin-left: -0.125rem;
	}

	.codes-dropdown {
		position: fixed;
		background: white;
		border-radius: 0.5rem;
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
		padding: 0.5rem;
		min-width: 200px;
		z-index: 9999;
	}

	.codes-list {
		max-height: calc(100vh - 150px);
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.dropdown-item {
		padding: 0.375rem 0.5rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.checkbox {
		width: 1rem;
		height: 1rem;
	}

	.code-header {
		padding: 0.5rem;
		font-weight: 600;
		font-size: 0.75rem;
		color: #6b7280;
		letter-spacing: 0.025em;
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.color-picker {
		width: 24px;
		height: 28px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		padding: 0;
	}

	.clear-codes-button {
		width: 100%;
		padding: 0.375rem 0.5rem;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.875rem;
		color: #dc2626;
		text-align: left;
		border-radius: 0.25rem;
	}

	.clear-codes-button:hover {
		background-color: #fef2f2;
	}

	.divider {
		height: 1px;
		background: #e5e7eb;
		margin: 0.25rem 0;
	}
</style>
