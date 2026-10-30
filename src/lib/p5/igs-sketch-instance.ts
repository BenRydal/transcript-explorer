import type p5 from 'p5';
import type { Draw } from '../draw/draw';
import type { DynamicData } from '../core/dynamic-data';
import type { ContextMenuPayload } from '../../stores/uiStateStore';

/** The p5 instance as extended by igsSketch(). */
export interface IgsSketch extends p5 {
	dynamicData: DynamicData;
	renderer: Draw;
	toolTipTextSize: number;
	animationCounter: number;
	_styles?: unknown[];
	__cleanupInstalled?: boolean;

	getContainerSize(): { width: number; height: number };
	arrayIsLoaded(data: unknown): boolean;
	overRect(x: number, y: number, boxWidth: number, boxHeight: number): boolean;
	overCircle(x: number, y: number, diameter: number): boolean;
	shouldDraw(item: { turnNumber: number; speaker: string }): boolean;
	fillAllData(): void;
	fillSelectedData(): void;

	drawGuarded(body: () => void): void;
	drawErrorBanner(): void;
	updateCursor(): void;
	updateAnimation(): void;
	syncAnimationCounter(): void;
	getAnimationTargetIndex(): number;
	setAnimationCounter(targetIndex: number): void;
	handleTimelineAnimationState(): void;
	continueTimelineAnimation(): void;
	endTimelineAnimation(): void;
	openCanvasContextMenu(clientX?: number, clientY?: number): void;
	buildContextMenuPayload(): ContextMenuPayload | null;
	handleSpeakerFilterClick(): void;
	handleVideoClick(): void;
}
