<script lang="ts">
	import { Sun, Moon, Monitor } from '@lucide/svelte';
	import { themeChoice, selectTheme, resolveSystemTheme } from '$lib/ui/theme';

	interface Props {
		/**
		 * 'group' renders the full Light / Dark / System segmented control
		 * (used in SettingsPanel). 'compact' renders a single icon button
		 * that toggles between light and dark based on the currently
		 * resolved appearance (used in AppNavbar).
		 */
		variant?: 'group' | 'compact';
	}

	let { variant = 'group' }: Props = $props();
</script>

{#if variant === 'compact'}
	{@const resolved = $themeChoice === 'system' ? resolveSystemTheme() : $themeChoice}
	<button
		type="button"
		class="te-btn te-btn--icon te-btn--ghost te-btn--sm"
		aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		title={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		onclick={() => selectTheme(resolved === 'dark' ? 'light' : 'dark')}
	>
		{#if resolved === 'dark'}
			<Sun size={16} />
		{:else}
			<Moon size={16} />
		{/if}
	</button>
{:else}
	<div class="te-btn-group" role="group" aria-label="Theme: Light, Dark, or follow system setting">
		<button type="button" class="te-btn te-btn--sm" aria-pressed={$themeChoice === 'light'} onclick={() => selectTheme('light')} title="Light theme">
			<Sun size={14} />
			Light
		</button>
		<button type="button" class="te-btn te-btn--sm" aria-pressed={$themeChoice === 'dark'} onclick={() => selectTheme('dark')} title="Dark theme">
			<Moon size={14} />
			Dark
		</button>
		<button
			type="button"
			class="te-btn te-btn--sm"
			aria-pressed={$themeChoice === 'system'}
			onclick={() => selectTheme('system')}
			title="Follow system setting"
		>
			<Monitor size={14} />
			System
		</button>
	</div>
{/if}
