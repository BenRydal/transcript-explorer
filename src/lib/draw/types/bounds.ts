/**
 * Represents a rectangular area with position and dimensions.
 * Used for visualization layout and positioning.
 */
export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Dashboard layout with three panels.
 */
export interface DashboardBounds {
	top: Bounds;
	bottomLeft: Bounds;
	bottomRight: Bounds;
}
