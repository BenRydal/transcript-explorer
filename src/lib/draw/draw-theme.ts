/**
 * Canvas theme resolver
 *
 * The DOM chrome is driven by CSS custom properties on
 * `document.documentElement` (see `src/app.css`) that flip under
 * `:root[data-theme="dark"]`. The p5 canvas can't read those tokens
 * directly per-frame without paying a `getComputedStyle` cost, so we
 * snapshot them into a plain object on first read and on every
 * `data-theme` change (handled by a MutationObserver in `igsSketch.ts`).
 *
 * Draw classes receive the snapshot via `DrawContext.theme`  -  they pass
 * its string values straight to `p5.fill/stroke/background/color` like
 * any other CSS color literal.
 */
export interface DrawTheme {
	/** Canvas background. */
	bg: string;
	/** Primary text / axis ink. */
	fg: string;
	/** Secondary labels, tick labels, muted text. */
	fgMuted: string;
	/** Very faint labels / tertiary text. */
	fgSubtle: string;
	/** Standard 1px divider / grid weight. */
	border: string;
	/** Hairline / subtle divider. */
	borderMuted: string;
	/** Search highlight / hover accent. */
	accent: string;
	/** Overlap strip, destructive action color. */
	danger: string;
	/**
	 * Background-matching overlay color used for semi-transparent
	 * dim-the-scene fills during hover (previously hardcoded white).
	 * Resolves to bg so alpha still reads as "fade to canvas" in either
	 * theme.
	 */
	overlay: string;
}

// Light defaults mirror the :root block in app.css. These are what we
// fall back to on the server or before the first browser read.
const LIGHT_DEFAULTS: DrawTheme = {
	bg: '#ffffff',
	fg: '#111827',
	fgMuted: '#6b7280',
	fgSubtle: '#6b7280',
	border: '#d1d5db',
	borderMuted: '#e5e7eb',
	accent: '#2563eb',
	danger: '#dc2626',
	overlay: '#ffffff'
};

let cached: DrawTheme = LIGHT_DEFAULTS;
let hasBeenRead = false;

function readVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
	const raw = style.getPropertyValue(name).trim();
	return raw || fallback;
}

/**
 * Snapshot the current `--te-*` tokens off `<html>`. Safe to call on the
 * server (returns the light defaults); otherwise reads `getComputedStyle`.
 */
export function readThemeFromDOM(): DrawTheme {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return LIGHT_DEFAULTS;
	}
	const style = window.getComputedStyle(document.documentElement);
	const theme: DrawTheme = {
		bg: readVar(style, '--te-bg', LIGHT_DEFAULTS.bg),
		fg: readVar(style, '--te-fg', LIGHT_DEFAULTS.fg),
		fgMuted: readVar(style, '--te-fg-muted', LIGHT_DEFAULTS.fgMuted),
		fgSubtle: readVar(style, '--te-fg-subtle', LIGHT_DEFAULTS.fgSubtle),
		border: readVar(style, '--te-border', LIGHT_DEFAULTS.border),
		borderMuted: readVar(style, '--te-border-muted', LIGHT_DEFAULTS.borderMuted),
		accent: readVar(style, '--te-accent', LIGHT_DEFAULTS.accent),
		danger: readVar(style, '--te-danger', LIGHT_DEFAULTS.danger),
		// Overlay matches bg so alpha-compositing "dims to canvas" works
		// regardless of theme.
		overlay: readVar(style, '--te-bg', LIGHT_DEFAULTS.bg)
	};
	return theme;
}

/**
 * Return the cached snapshot, reading it on first call so the first
 * frame after sketch setup already has live tokens (don't need to wait
 * for the MutationObserver to fire).
 */
export function getDrawTheme(): DrawTheme {
	if (!hasBeenRead) {
		cached = readThemeFromDOM();
		hasBeenRead = true;
	}
	return cached;
}

/**
 * Force-refresh the cached snapshot. The MutationObserver in
 * `igsSketch.ts` calls this whenever `data-theme` on `<html>` changes,
 * so the next `DrawContext` constructed by the draw loop picks up the
 * new palette.
 */
export function refreshDrawTheme(): DrawTheme {
	cached = readThemeFromDOM();
	hasBeenRead = true;
	return cached;
}

/**
 * Parse a CSS color string (hex `#rrggbb`, shorthand `#rgb`, or any
 * `rgb(...)` form) into 0–255 channels. Returns `null` for unsupported
 * formats (e.g. `hsl(...)`, `currentColor`)  -  callers should treat that
 * as "use the theme default" rather than crash.
 */
function parseColorChannels(color: string): { r: number; g: number; b: number } | null {
	if (!color) return null;
	const trimmed = color.trim();

	// Hex forms: #rgb, #rgba, #rrggbb, #rrggbbaa
	if (trimmed.startsWith('#')) {
		const hex = trimmed.slice(1);
		if (hex.length === 3 || hex.length === 4) {
			const r = parseInt(hex[0] + hex[0], 16);
			const g = parseInt(hex[1] + hex[1], 16);
			const b = parseInt(hex[2] + hex[2], 16);
			if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
			return { r, g, b };
		}
		if (hex.length === 6 || hex.length === 8) {
			const r = parseInt(hex.slice(0, 2), 16);
			const g = parseInt(hex.slice(2, 4), 16);
			const b = parseInt(hex.slice(4, 6), 16);
			if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
			return { r, g, b };
		}
		return null;
	}

	// rgb(r g b) or rgb(r, g, b) or rgba(...)  -  extract the first 3 numeric
	// channels. sRGB space is what we care about for luminance.
	const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
	if (rgbMatch) {
		const parts = rgbMatch[1]
			.split(/[\s,/]+/)
			.filter(Boolean)
			.slice(0, 3)
			.map((p) => {
				if (p.endsWith('%')) return Math.round((parseFloat(p) / 100) * 255);
				return parseFloat(p);
			});
		if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
		return { r: parts[0], g: parts[1], b: parts[2] };
	}

	return null;
}

/**
 * Relative luminance per WCAG 2.1 (sRGB). Returns a value in [0, 1].
 * Used to decide whether dark or light text reads better on top of a
 * given background color.
 */
function relativeLuminance(r: number, g: number, b: number): number {
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Pick a readable text color for a label drawn over a speaker-colored shape.
 * (For labels over the canvas background, use `theme.fg` directly.)
 * Bright bg (WCAG luminance > 0.5) → theme.fg; dim bg → white.
 */
export function pickTextColor(bg: string, theme: DrawTheme): string {
	const channels = parseColorChannels(bg);
	if (!channels) return theme.fg;
	const lum = relativeLuminance(channels.r, channels.g, channels.b);
	// white (not theme.bg) for the dim case: theme.bg is near-black in dark mode
	return lum > 0.5 ? theme.fg : '#ffffff';
}
