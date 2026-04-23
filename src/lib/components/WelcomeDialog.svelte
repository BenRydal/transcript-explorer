<script lang="ts">
	import { trapFocus } from '$lib/a11y/focus-trap';

	interface Props {
		open?: boolean;
		onStartTour?: () => void;
		onDismiss?: (dontShowAgain: boolean) => void;
	}

	/**
	 * First-load welcome dialog. Explains TE at a glance and offers two
	 * paths forward: start the guided tour, or skip and explore. A
	 * default-checked "Don't show this again" lets users suppress the
	 * dialog permanently; unchecking it keeps the onboarding state at
	 * `unseen` so the dialog returns on the next reload.
	 *
	 * Dialog contract mirrors ConfirmModal.svelte:
	 *   role="dialog" + aria-modal="true" + aria-labelledby + aria-describedby
	 *   focus trap via trapFocus() + focus restore
	 *   Escape dismisses (treated as a skip)
	 *   backdrop click dismisses (treated as a skip)
	 */
	let {
		open = $bindable(false),
		onStartTour,
		onDismiss
	}: Props = $props();

	let dialogEl: HTMLDivElement | null = $state(null);
	let dontShowAgain = $state(true);

	const titleId = `welcome-title-${Math.random().toString(36).slice(2, 8)}`;
	const descId = `welcome-desc-${Math.random().toString(36).slice(2, 8)}`;
	const checkboxId = `welcome-hide-${Math.random().toString(36).slice(2, 8)}`;

	$effect(() => {
		if (!open || !dialogEl) return;
		return trapFocus(dialogEl);
	});

	function startTour() {
		// Starting the tour implicitly marks onboarding as seen; the
		// "don't show again" checkbox only matters on skip.
		onStartTour?.();
		open = false;
	}

	function dismiss() {
		onDismiss?.(dontShowAgain);
		open = false;
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			dismiss();
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal modal-open" onkeydown={handleKey}>
		<div
			bind:this={dialogEl}
			class="modal-box welcome-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={descId}
		>
			<h2 id={titleId} class="welcome-dialog__title">
				Welcome to Transcript Explorer
			</h2>
			<p id={descId} class="welcome-dialog__pitch">
				Transcript Explorer turns conversation transcripts into interactive
				visualizations — across speakers, time, and qualitative codes — all
				in your browser, no upload required.
			</p>

			<p class="welcome-dialog__section-label">A few ways to start</p>
			<ul class="welcome-dialog__bullets">
				<li>Upload a transcript or paste text from the Data panel.</li>
				<li>Try an example dataset to explore the tool quickly.</li>
				<li>Switch visualizations and filters from the left rail.</li>
			</ul>

			<div class="welcome-dialog__actions">
				<button
					type="button"
					class="te-btn te-btn--primary"
					onclick={startTour}
				>
					Take a quick tour
				</button>
				<button
					type="button"
					class="te-btn te-btn--ghost"
					onclick={dismiss}
				>
					Skip &mdash; I&rsquo;ll explore on my own
				</button>
			</div>

			<label class="welcome-dialog__checkbox" for={checkboxId}>
				<input
					id={checkboxId}
					type="checkbox"
					bind:checked={dontShowAgain}
				/>
				<span>Don&rsquo;t show this again</span>
			</label>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-backdrop" aria-hidden="true" onclick={dismiss}></div>
	</div>
{/if}

<style>
	.welcome-dialog {
		max-width: 30rem;
		background: var(--te-bg);
		color: var(--te-fg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
		padding: var(--te-sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-3);
	}

	.welcome-dialog__title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--te-fg);
	}

	.welcome-dialog__pitch {
		margin: 0;
		font-size: var(--te-font-body);
		line-height: var(--te-leading);
		color: var(--te-fg-muted);
	}

	.welcome-dialog__section-label {
		margin: var(--te-sp-1) 0 0 0;
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
	}

	.welcome-dialog__bullets {
		margin: 0;
		padding-left: var(--te-sp-4);
		font-size: var(--te-font-small);
		line-height: var(--te-leading);
		color: var(--te-fg-muted);
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-1);
	}

	.welcome-dialog__bullets li {
		margin: 0;
	}

	.welcome-dialog__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--te-sp-2);
		margin-top: var(--te-sp-2);
	}

	.welcome-dialog__checkbox {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		margin-top: var(--te-sp-1);
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		cursor: pointer;
	}

	.welcome-dialog__checkbox input {
		width: 14px;
		height: 14px;
		cursor: pointer;
		accent-color: var(--te-accent);
	}

	.welcome-dialog__checkbox:focus-within {
		color: var(--te-fg);
	}
</style>
