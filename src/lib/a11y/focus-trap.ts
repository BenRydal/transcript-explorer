/**
 * Modal focus-trap + focus-restore helper. {@link trapFocus} focuses the first
 * focusable descendant, cycles Tab/Shift+Tab within the container, and returns a
 * disposer that removes listeners and restores prior focus.
 * Usage: `$effect(() => isOpen && dialogEl ? trapFocus(dialogEl) : undefined)`
 */

const FOCUSABLE = [
	'a[href]',
	'area[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'iframe',
	'object',
	'embed',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable="true"]'
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
	const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
	// Skip elements with an ancestor marked inert / aria-hidden, and ones
	// that are not actually visible. The container itself is always valid.
	return nodes.filter((el) => {
		if (el.hasAttribute('disabled')) return false;
		if (el.getAttribute('aria-hidden') === 'true') return false;
		const rects = el.getClientRects();
		if (rects.length === 0) return false;
		return true;
	});
}

export function trapFocus(container: HTMLElement): () => void {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	// Ensure the container itself is focusable so we can land focus there
	// when there are no focusable descendants. This avoids a dead spot.
	const hadTabIndex = container.hasAttribute('tabindex');
	if (!hadTabIndex) container.setAttribute('tabindex', '-1');

	// Focus in on next microtask so transitions / children have mounted.
	queueMicrotask(() => {
		const focusable = getFocusable(container);
		if (focusable.length > 0) {
			focusable[0].focus({ preventScroll: true });
		} else {
			container.focus({ preventScroll: true });
		}
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const focusable = getFocusable(container);
		if (focusable.length === 0) {
			event.preventDefault();
			container.focus({ preventScroll: true });
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement as HTMLElement | null;

		if (event.shiftKey) {
			if (active === first || !container.contains(active)) {
				event.preventDefault();
				last.focus({ preventScroll: true });
			}
		} else {
			if (active === last || !container.contains(active)) {
				event.preventDefault();
				first.focus({ preventScroll: true });
			}
		}
	}

	container.addEventListener('keydown', handleKeydown);

	return () => {
		container.removeEventListener('keydown', handleKeydown);
		if (!hadTabIndex) container.removeAttribute('tabindex');
		if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
			try {
				previouslyFocused.focus({ preventScroll: true });
			} catch {
				/* element may have been removed */
			}
		}
	};
}
