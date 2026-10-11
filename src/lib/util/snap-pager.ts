import { prefersReducedMotion } from "svelte/motion";
import type { Attachment } from "svelte/attachments";

import { isMacosPlatform } from "$lib/platform/os";
import {
	scrollGesture,
	type ScrollGestureState,
} from "$lib/platform/scroll-gesture";

const ALIGNED_PX = 1;
const CLIENT_WIDTH_ROUNDING_PX = 1;
const VISIBLE_EDGE_PX = 1;
const LAYOUT_UNIT_PX = 1 / 64;
const TOUCH_LIFTS = ["touchend", "touchcancel"] as const;
const STILL_FRAMES_BEFORE_GLIDE = 3;

export type VisiblePositions = { first: number; last: number };

export class SnapPager {
	readonly #count: () => number;
	readonly #onVisible: (positions: VisiblePositions) => void;
	readonly #onRest: (position: number) => void;
	readonly #onHeading: (position: number) => void;
	readonly #fingerPhase: ScrollGestureState | null;
	readonly #reducedMotion: () => boolean;

	#node: HTMLElement | null = null;
	#fingers = 0;
	#stillFrames = 0;
	#releaseWatch: number | null = null;
	#width = 0;
	#nearest: number | null = null;
	#heading: number | null = null;
	#lastLeft = 0;
	#travel = 0;
	#visible: VisiblePositions | null = null;
	#touchLifts: AbortController | null = null;
	#stepTarget: number | null = null;
	#pendingPlace: number | null = null;

	constructor({
		count,
		onVisible,
		onRest,
		onHeading = () => {},
		fingerPhase = isMacosPlatform() ? scrollGesture : null,
		reducedMotion = () => prefersReducedMotion.current,
	}: {
		count: () => number;
		onVisible: (positions: VisiblePositions) => void;
		onRest: (position: number) => void;
		onHeading?: (position: number) => void;
		fingerPhase?: ScrollGestureState | null;
		reducedMotion?: () => boolean;
	}) {
		this.#count = count;
		this.#onVisible = onVisible;
		this.#onRest = onRest;
		this.#onHeading = onHeading;
		this.#fingerPhase = fingerPhase;
		this.#reducedMotion = reducedMotion;
	}

	readonly attach: Attachment<HTMLElement> = (node) => {
		this.#node = node;
		const listening = new AbortController();
		const options = { passive: true, signal: listening.signal };
		const dropStepTarget = () => {
			this.#stepTarget = null;
			this.#reportHeading();
		};
		const onWindow = { ...options, capture: true };
		node.addEventListener("scroll", () => this.#onScroll(), options);
		node.addEventListener("scrollend", () => this.#snapStranded(), options);
		window.addEventListener(
			"touchstart",
			(event) => this.#onTouchStart(event),
			onWindow,
		);
		for (const type of TOUCH_LIFTS)
			window.addEventListener(type, this.#onTouchLift, onWindow);
		node.addEventListener("pointerdown", dropStepTarget, options);
		node.addEventListener("focusin", dropStepTarget, options);
		node.addEventListener(
			"wheel",
			(event) => {
				if (
					Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
					event.shiftKey
				)
					dropStepTarget();
			},
			options,
		);
		const resize = new ResizeObserver((entries) => this.#onResize(entries));
		resize.observe(node);
		const stopPhase = this.#fingerPhase?.onPhaseChange((phase) => {
			this.settleNow();
			if (phase === "idle") this.#watchRelease();
		});

		return () => {
			listening.abort();
			resize.disconnect();
			stopPhase?.();
			this.#touchLifts?.abort();
			this.#touchLifts = null;
			this.#fingers = 0;
			if (this.#releaseWatch !== null)
				cancelAnimationFrame(this.#releaseWatch);
			this.#releaseWatch = null;
		};
	};

	place(
		position: number,
		{ animated = false }: { animated?: boolean } = {},
	): void {
		this.#stepTarget = null;
		if (this.#width <= 0) {
			this.#pendingPlace = position;
			return;
		}
		this.#pendingPlace = null;
		if (this.#aligned(position)) {
			this.#report(position);
			return;
		}
		if (animated) {
			this.#stepTarget = position;
			this.#reportHeading();
		} else this.#report(position);
		this.#scrollToPosition(position, { animated });
	}

	step(offset: number): void {
		if (this.#width <= 0 || this.#held()) return;
		const nearest = this.#nearestPosition();
		if (this.#coasting() && !this.#aligned(nearest)) return;
		const target = this.#clamp((this.#stepTarget ?? nearest) + offset);
		this.#stepTarget = target;
		this.#reportHeading();
		this.#scrollToPosition(target, { animated: true });
	}

	settleNow(): void {
		if (!this.#canSnap()) return;
		const position = this.#nearestPosition();
		if (!this.#aligned(position)) return;
		if (this.#stepTarget !== null && position !== this.#stepTarget) return;
		this.#stepTarget = null;
		this.#onRest(position);
	}

	get #left(): number {
		return this.#node?.scrollLeft ?? 0;
	}

	#clamp(position: number): number {
		return Math.max(0, Math.min(position, this.#count() - 1));
	}

	#nearestPosition(): number {
		return this.#width > 0
			? this.#clamp(Math.round(this.#left / this.#width))
			: 0;
	}

	#aligned(position: number): boolean {
		return Math.abs(this.#left - position * this.#width) < ALIGNED_PX;
	}

	#overlapping(): VisiblePositions {
		return {
			first: this.#clamp(
				Math.floor((this.#left + VISIBLE_EDGE_PX) / this.#width),
			),
			last: this.#clamp(
				Math.ceil((this.#left - VISIBLE_EDGE_PX) / this.#width),
			),
		};
	}

	#widthMatchesLayout(): boolean {
		const layoutWidth = this.#node?.clientWidth ?? 0;
		return Math.abs(layoutWidth - this.#width) < CLIENT_WIDTH_ROUNDING_PX;
	}

	#held(): boolean {
		return this.#fingers > 0 || this.#fingerPhase?.fingersDown === true;
	}

	#coasting(): boolean {
		return this.#fingerPhase?.phase === "momentum";
	}

	#canSnap(): boolean {
		return this.#width > 0 && !this.#held() && this.#widthMatchesLayout();
	}

	#canGlideToNearest(): boolean {
		return (
			this.#canSnap() && this.#stepTarget === null && !this.#coasting()
		);
	}

	#report(position: number): void {
		this.#nearest = position;
		this.#lastLeft = this.#left;
		this.#setHeading(position);
		this.#reportVisible({ first: position, last: position });
	}

	#reportHeading(): void {
		this.#setHeading(this.#stepTarget ?? this.#travelTarget());
	}

	#travelTarget(): number | null {
		if (this.#held() || this.#travel === 0 || this.#width <= 0)
			return this.#nearest;
		const { first, last } = this.#overlapping();
		return this.#travel < 0 ? first : last;
	}

	#setHeading(heading: number | null): void {
		if (heading === null || heading === this.#heading) return;
		this.#heading = heading;
		this.#onHeading(heading);
	}

	#reportVisible({ first, last }: VisiblePositions): void {
		if (first === this.#visible?.first && last === this.#visible.last)
			return;
		this.#visible = { first, last };
		this.#onVisible({ first, last });
	}

	#onScroll(): void {
		this.#stillFrames = 0;
		if (!this.#widthMatchesLayout()) return;
		const left = this.#left;
		this.#travel = Math.sign(left - this.#lastLeft) || this.#travel;
		this.#lastLeft = left;
		this.#nearest = this.#nearestPosition();
		this.#reportHeading();
		this.#reportVisible(this.#overlapping());
		this.settleNow();
	}

	#onTouchStart(event: TouchEvent): void {
		this.#fingers = event.touches.length;
		this.#touchLifts ??= new AbortController();
		for (const type of TOUCH_LIFTS)
			event.target?.addEventListener(
				type,
				this.#onTouchLift as EventListener,
				{
					passive: true,
					capture: true,
					signal: this.#touchLifts.signal,
				},
			);
	}

	readonly #onTouchLift = (event: TouchEvent): void => {
		if (this.#fingers === 0) return;
		this.#fingers = event.touches.length;
		if (this.#fingers > 0) return;
		this.#touchLifts?.abort();
		this.#touchLifts = null;
		this.settleNow();
		this.#watchRelease();
	};

	#watchRelease(): void {
		this.#stillFrames = 0;
		if (this.#width <= 0 || this.#aligned(this.#nearestPosition())) return;
		this.#releaseWatch ??= requestAnimationFrame(this.#checkRelease);
	}

	readonly #checkRelease = (): void => {
		this.#releaseWatch = null;
		if (!this.#canGlideToNearest()) return;
		const position = this.#nearestPosition();
		if (this.#aligned(position)) return;
		this.#stillFrames += 1;
		if (this.#stillFrames < STILL_FRAMES_BEFORE_GLIDE) {
			this.#releaseWatch = requestAnimationFrame(this.#checkRelease);
			return;
		}
		this.#scrollToPosition(position, { animated: true });
	};

	#snapStranded(): void {
		if (!this.#canGlideToNearest()) return;
		const position = this.#nearestPosition();
		if (!this.#aligned(position))
			this.#scrollToPosition(position, { animated: true });
	}

	#onResize(entries: ResizeObserverEntry[]): void {
		const entry = entries.at(-1);
		const width = entry ? exactInlineSize(entry) : 0;
		const previous = this.#width;
		if (width === previous) return;
		this.#width = width;
		if (width <= 0) return;
		if (this.#pendingPlace !== null) this.place(this.#pendingPlace);
		else if (previous <= 0) this.#report(this.#nearestPosition());
		else if (!this.#held()) {
			const position = this.#stepTarget ?? this.#nearest ?? 0;
			if (!this.#aligned(position))
				this.#scrollToPosition(position, { animated: false });
		}
		this.settleNow();
	}

	#scrollToPosition(
		position: number,
		{ animated }: { animated: boolean },
	): void {
		this.#node?.scrollTo({
			left: position * this.#width,
			behavior: animated && !this.#reducedMotion() ? "smooth" : "instant",
		});
	}
}

// Blink floors contentBoxSize to a layout unit while panes sit at exact device
// pixels, so every page would add the dropped fraction to position * width.
function exactInlineSize({
	contentBoxSize,
	devicePixelContentBoxSize,
}: ResizeObserverEntry): number {
	const layoutSize = contentBoxSize[0]?.inlineSize ?? 0;
	const devicePixels = devicePixelContentBoxSize?.[0]?.inlineSize;
	if (devicePixels === undefined) return layoutSize;
	const exactSize = devicePixels / window.devicePixelRatio;
	return Math.abs(exactSize - layoutSize) < LAYOUT_UNIT_PX
		? exactSize
		: layoutSize;
}
