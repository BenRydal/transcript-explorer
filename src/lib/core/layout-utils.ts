const P5_CONTAINER_ID = 'p5-container';

/** Get the p5 container element, or null if not mounted. */
export function getP5Container(): HTMLElement | null {
	return document.getElementById(P5_CONTAINER_ID);
}

/** Get the p5 container's bounding rect, or null if not mounted. */
export function getP5ContainerRect(): DOMRect | null {
	return getP5Container()?.getBoundingClientRect() ?? null;
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
