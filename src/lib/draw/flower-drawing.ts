/**
 * Flower Drawing Utilities
 *
 * Handles all the organic flower visualization rendering including:
 * - Curved stalks with bezier curves
 * - Realistic leaves with veins
 * - Gradient petals with natural variation
 * - Textured flower centers
 *
 * Used by distribution-diagram.ts when flower mode is enabled.
 */

import type p5 from 'p5';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

// Colors (RGBA)
const STALK_LEAF_COLORS = {
	outer: [65, 105, 45, 200] as const,
	inner: [85, 130, 55, 150] as const,
	vein: [50, 80, 35, 180] as const
};
const STALK_BASE_COLOR = [55, 85, 35] as const;

// Stalk geometry
const STALK_BEND_SCALE = 12; // How much the stalk bends based on flower size
const STALK_BEND_HEIGHT_FACTOR = 0.03; // Additional bend based on stalk height
const STALK_THICKNESS_SCALE = 3.5; // Base thickness multiplier
const STALK_MIN_THICKNESS = 2;
const STALK_LAYERS = 3; // Number of overlapping strokes for gradient effect

// Stalk curve control points (as fraction of height from bottom)
const STALK_CURVE = {
	controlPoint1Height: 0.25,
	controlPoint2Height: 0.6,
	controlPoint1BendFactor: 0.8
};

// Leaf placement (as fraction of stalk height from bottom)
const LEAF_POSITIONS = {
	lower: { height: 0.3, scale: 1.2, rotation: 0.4, flip: false },
	middle: { height: 0.55, scale: 0.9, rotation: -0.3, flip: true, minStalkHeight: 80 },
	upper: { height: 0.78, scale: 0.6, rotation: 0.5, flip: false, minStalkHeight: 120 }
};
const MIN_SCALE_FOR_LEAVES = 0.25;

// Leaf shape
const LEAF_OUTER_LENGTH = 25;
const LEAF_INNER_LENGTH = 20;
const LEAF_OUTER_CURVE = 3;
const LEAF_INNER_CURVE = 1.5;
const LEAF_VEIN_COUNT = 4;

// Petal configuration
const NUM_PETALS = 11;
const GRADIENT_STEPS = 6;
const PETAL_LENGTH_SCALE = 52;
const PETAL_WIDTH_SCALE = 18;
const CENTER_RADIUS_SCALE = 11;

// Petal variation (creates organic look)
const PETAL_ANGLE_VARIATION = 0.08;
const PETAL_SIZE_VARIATION = 0.18;
const PETAL_WIDTH_VARIATION = 0.15;
const PETAL_BASE_SIZE = 0.82;
const PETAL_BASE_WIDTH = 0.9;

// Petal shape control points
const PETAL_CURVE = {
	innerHeight: 0.18,
	outerHeight: 0.65,
	baseWidth: 0.65,
	outerWidth: 0.75,
	asymmetryScale: 0.15,
	tipOffsetScale: 0.1
};

// Flower center
const CENTER_OUTER_DARKEN = 50;
const CENTER_RING_START = 0.85;
const CENTER_RING_END = 0.3;
const CENTER_RING_STEP = 0.15;
const MIN_SCALE_FOR_CENTER_DOTS = 0.35;
const CENTER_DOT_BASE_COUNT = 8;
const MIN_SCALE_FOR_PETAL_VEINS = 0.4;

export interface FlowerParams {
	xPos: number;
	yPos: number;
	bottomY: number;
	scaledWordArea: number;
	color: p5.Color;
}

/**
 * Draws a complete flower visualization including stalk, leaves, and petals.
 */
export function drawFlower(sk: p5, params: FlowerParams): void {
	const { xPos, yPos, bottomY, scaledWordArea, color } = params;
	const scaleFactor = scaledWordArea / 100;

	drawStalk(sk, scaleFactor, xPos, yPos, bottomY);

	sk.push();
	sk.translate(xPos, yPos);
	drawPetals(sk, scaleFactor, color);
	sk.pop();
}

/**
 * Draws the flower stalk with S-curve and leaves.
 */
function drawStalk(sk: p5, scaleFactor: number, xPos: number, yPos: number, bottomY: number): void {
	const topY = yPos;
	const stalkHeight = bottomY - topY;
	const bendAmount = scaleFactor * STALK_BEND_SCALE + stalkHeight * STALK_BEND_HEIGHT_FACTOR;

	sk.noFill();

	// Draw multiple strokes for thickness gradient effect
	for (let i = 0; i < STALK_LAYERS; i++) {
		const thickness = Math.max(STALK_MIN_THICKNESS, scaleFactor * STALK_THICKNESS_SCALE) - i * 0.5;
		const [r, g, b] = STALK_BASE_COLOR;
		sk.stroke(r + i * 15, g + i * 10, b + i * 5, 255 - i * 30);
		sk.strokeWeight(thickness);

		sk.bezier(
			xPos,
			bottomY,
			xPos + bendAmount * STALK_CURVE.controlPoint1BendFactor,
			bottomY - stalkHeight * STALK_CURVE.controlPoint1Height,
			xPos - bendAmount,
			bottomY - stalkHeight * STALK_CURVE.controlPoint2Height,
			xPos,
			topY
		);
	}

	// Draw leaves at configured positions
	if (scaleFactor > MIN_SCALE_FOR_LEAVES) {
		const { lower, middle, upper } = LEAF_POSITIONS;

		// Lower leaf
		const leaf1Y = bottomY - stalkHeight * lower.height;
		const leaf1X = getStalkX(xPos, bendAmount, lower.height);
		drawRealisticLeaf(sk, leaf1X, leaf1Y, scaleFactor * lower.scale, lower.rotation, lower.flip);

		// Middle leaf
		if (stalkHeight > middle.minStalkHeight!) {
			const leaf2Y = bottomY - stalkHeight * middle.height;
			const leaf2X = getStalkX(xPos, bendAmount, middle.height);
			drawRealisticLeaf(sk, leaf2X, leaf2Y, scaleFactor * middle.scale, middle.rotation, middle.flip);
		}

		// Upper leaf
		if (stalkHeight > upper.minStalkHeight!) {
			const leaf3Y = bottomY - stalkHeight * upper.height;
			const leaf3X = getStalkX(xPos, bendAmount, upper.height);
			drawRealisticLeaf(sk, leaf3X, leaf3Y, scaleFactor * upper.scale, upper.rotation, upper.flip);
		}
	}
}

/**
 * Approximates the bezier curve x position at parameter t.
 */
function getStalkX(baseX: number, bendAmount: number, t: number): number {
	const p0 = baseX;
	const p1 = baseX + bendAmount * STALK_CURVE.controlPoint1BendFactor;
	const p2 = baseX - bendAmount;
	const p3 = baseX;

	// Cubic bezier formula
	const mt = 1 - t;
	return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/**
 * Draws a realistic leaf with outer shape, inner highlight, and veins.
 */
function drawRealisticLeaf(sk: p5, x: number, y: number, scale: number, rotation: number, flipX: boolean): void {
	sk.push();
	sk.translate(x, y);
	sk.rotate(rotation);
	if (flipX) sk.scale(-1, 1);

	// Outer leaf shape
	sk.fill(...STALK_LEAF_COLORS.outer);
	sk.noStroke();
	drawLeafShape(sk, scale, 0, LEAF_OUTER_LENGTH, LEAF_OUTER_CURVE);

	// Inner leaf highlight
	sk.fill(...STALK_LEAF_COLORS.inner);
	drawLeafShape(sk, scale, 2, LEAF_INNER_LENGTH, LEAF_INNER_CURVE);

	// Central vein
	sk.stroke(...STALK_LEAF_COLORS.vein);
	sk.strokeWeight(scale * 0.4);
	sk.noFill();
	sk.line(scale, 0, scale * 22, 0);

	// Side veins
	sk.strokeWeight(scale * 0.2);
	for (let i = 1; i <= LEAF_VEIN_COUNT; i++) {
		const vx = scale * (4 + i * 4);
		sk.line(vx, 0, vx + scale * 3, -scale * 1.5);
		sk.line(vx, 0, vx + scale * 3, scale * 1.5);
	}

	sk.pop();
}

/**
 * Draws a leaf shape using bezier curves.
 */
function drawLeafShape(sk: p5, scale: number, startX: number, endX: number, curveHeight: number): void {
	const midX = (startX + endX) / 2 + 3;
	sk.beginShape();
	sk.vertex(scale * startX, 0);
	sk.bezierVertex(scale * midX, -scale * curveHeight, scale * (endX - 7), -scale * (curveHeight * 0.67), scale * endX, 0);
	sk.bezierVertex(scale * (endX - 7), scale * (curveHeight * 0.67), scale * midX, scale * curveHeight, scale * startX, 0);
	sk.endShape(sk.CLOSE);
}

/**
 * Draws all petals around the flower center.
 */
function drawPetals(sk: p5, scaleFactor: number, color: p5.Color): void {
	const baseR = sk.red(color);
	const baseG = sk.green(color);
	const baseB = sk.blue(color);

	const petalLength = scaleFactor * PETAL_LENGTH_SCALE;
	const petalWidth = scaleFactor * PETAL_WIDTH_SCALE;
	const centerRadius = scaleFactor * CENTER_RADIUS_SCALE;

	for (let i = 0; i < NUM_PETALS; i++) {
		const angleVariation = Math.sin(i * 2.3) * PETAL_ANGLE_VARIATION;
		const angle = (sk.TWO_PI / NUM_PETALS) * i + angleVariation;

		const sizeVariation = PETAL_BASE_SIZE + Math.sin(i * 1.7 + 0.5) * PETAL_SIZE_VARIATION;
		const widthVariation = PETAL_BASE_WIDTH + Math.cos(i * 2.1) * PETAL_WIDTH_VARIATION;

		sk.push();
		sk.rotate(angle);

		// Draw gradient layers from outside in
		for (let g = 0; g < GRADIENT_STEPS; g++) {
			const t = g / (GRADIENT_STEPS - 1);
			const layerScale = 1 - t * 0.55;

			const r = Math.min(255, baseR + (1 - t) * 55 + Math.sin(i) * 10);
			const gColor = Math.min(255, baseG + (1 - t) * 50);
			const b = Math.min(255, baseB + (1 - t) * 45);

			sk.fill(r, gColor, b, 90 + t * 110);
			sk.noStroke();
			drawOrganicPetal(sk, centerRadius * 0.9, petalLength * layerScale * sizeVariation, petalWidth * layerScale * widthVariation, i);
		}

		// Subtle vein line on larger flowers
		if (scaleFactor > MIN_SCALE_FOR_PETAL_VEINS) {
			sk.stroke(baseR - 30, baseG - 30, baseB - 30, 40);
			sk.strokeWeight(0.5);
			sk.line(0, centerRadius, 0, centerRadius + petalLength * sizeVariation * 0.7);
		}

		sk.pop();
	}

	drawFlowerCenter(sk, centerRadius, baseR, baseG, baseB, scaleFactor);
}

/**
 * Draws a single organic petal with asymmetric bezier curves.
 */
function drawOrganicPetal(sk: p5, startDist: number, length: number, width: number, index: number): void {
	const asymmetry = Math.sin(index * 1.3) * PETAL_CURVE.asymmetryScale;
	const tipOffset = Math.cos(index * 0.9) * width * PETAL_CURVE.tipOffsetScale;

	sk.beginShape();
	sk.vertex(0, startDist);

	// Left curve - slightly asymmetric
	sk.bezierVertex(
		-width * (PETAL_CURVE.baseWidth + asymmetry),
		startDist + length * PETAL_CURVE.innerHeight,
		-width * (PETAL_CURVE.outerWidth + asymmetry * 0.5),
		startDist + length * PETAL_CURVE.outerHeight,
		tipOffset,
		startDist + length
	);

	// Right curve - mirror with slight variation
	sk.bezierVertex(
		width * (PETAL_CURVE.outerWidth - asymmetry * 0.5),
		startDist + length * PETAL_CURVE.outerHeight,
		width * (PETAL_CURVE.baseWidth - asymmetry),
		startDist + length * PETAL_CURVE.innerHeight,
		0,
		startDist
	);

	sk.endShape(sk.CLOSE);
}

/**
 * Draws the flower center with gradient rings and texture dots.
 */
function drawFlowerCenter(sk: p5, radius: number, baseR: number, baseG: number, baseB: number, scaleFactor: number): void {
	// Outer ring (darker)
	sk.fill(baseR - CENTER_OUTER_DARKEN, baseG - CENTER_OUTER_DARKEN, baseB - CENTER_OUTER_DARKEN, 255);
	sk.noStroke();
	sk.circle(0, 0, radius * 2);

	// Middle gradient rings
	for (let r = radius * CENTER_RING_START; r > radius * CENTER_RING_END; r -= radius * CENTER_RING_STEP) {
		const t = 1 - r / radius;
		sk.fill(baseR - 40 + t * 50, baseG - 40 + t * 50, baseB - 40 + t * 50, 220);
		sk.circle(0, 0, r * 2);
	}

	// Tiny dots/texture in center for realism
	if (scaleFactor > MIN_SCALE_FOR_CENTER_DOTS) {
		const numDots = Math.floor(CENTER_DOT_BASE_COUNT + scaleFactor * 5);
		for (let i = 0; i < numDots; i++) {
			const dotAngle = (sk.TWO_PI / numDots) * i + 0.3;
			const dotDist = radius * (0.3 + Math.sin(i * 1.5) * 0.15);
			const dx = Math.cos(dotAngle) * dotDist;
			const dy = Math.sin(dotAngle) * dotDist;

			sk.fill(baseR - 60, baseG - 60, baseB - 60, 150);
			sk.circle(dx, dy, scaleFactor * 1.5);
		}
	}

	// Highlight spot
	sk.fill(255, 255, 255, 35);
	sk.circle(-radius * 0.25, -radius * 0.25, radius * 0.5);
}
