const DIM_ALPHA = 0.2;

/**
 * Runs a draw callback with optional alpha dimming, guaranteeing reset via try/finally.
 */
export function withDimming(ctx: CanvasRenderingContext2D, dim: boolean, fn: () => void): void {
	if (dim) ctx.globalAlpha = DIM_ALPHA;
	try {
		fn();
	} finally {
		if (dim) ctx.globalAlpha = 1.0;
	}
}
