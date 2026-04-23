<script lang="ts">
	import { Sun, Moon, Monitor } from '@lucide/svelte';
	import {
		themeChoice,
		selectTheme,
		cycleTheme,
		THEME_ORDER,
		type ThemeChoice
	} from '$lib/ui/theme';

	interface Props {
		/**
		 * 'group' renders the full Light / Dark / System segmented control
		 * (used in SettingsPanel). 'compact' renders a single icon button
		 * that cycles through the three states on click (used in AppNavbar).
		 */
		variant?: 'group' | 'compact';
	}

	let { variant = 'group' }: Props = $props();

	const LABELS: Record<ThemeChoice, string> = {
		light: 'Light',
		dark: 'Dark',
		system: 'System'
	};

	function nextChoice(current: ThemeChoice): ThemeChoice {
		const idx = THEME_ORDER.indexOf(current);
		return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
	}
</script>

{#if variant === 'compact'}
	{@const current = $themeChoice}
	{@const next = nextChoice(current)}
	<button
		type="button"
		class="te-btn te-btn--icon te-btn--ghost te-btn--sm"
		aria-label={`Theme: ${LABELS[current]} — click to switch to ${LABELS[next]}`}
		title={`Theme: ${LABELS[current]} (Light / Dark / System) — click to cycle`}
		onclick={() => cycleTheme()}
	>
		{#if current === 'light'}
			<Sun size={16} />
		{:else if current === 'dark'}
			<Moon size={16} />
		{:else}
			<Monitor size={16} />
		{/if}
	</button>
{:else}
	<div
		class="te-btn-group"
		role="group"
		aria-label="Theme: Light, Dark, or follow system setting"
	>
		<button
			type="button"
			class="te-btn te-btn--sm"
			aria-pressed={$themeChoice === 'light'}
			onclick={() => selectTheme('light')}
			title="Light theme"
		>
			<Sun size={14} />
			Light
		</button>
		<button
			type="button"
			class="te-btn te-btn--sm"
			aria-pressed={$themeChoice === 'dark'}
			onclick={() => selectTheme('dark')}
			title="Dark theme"
		>
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
