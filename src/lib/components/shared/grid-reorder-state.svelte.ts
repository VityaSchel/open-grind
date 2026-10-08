import { SvelteMap } from "svelte/reactivity";
import type { Attachment } from "svelte/attachments";

import { playHaptic } from "$lib/haptics";
import { nearestSlot, previewSlot } from "$lib/util/reorder";

const TOUCH_LIFT_DELAY_MS = 300;
const LIFT_TOLERANCE_PX = 10;

type Point = { x: number; y: number };

function centerOf(node: HTMLElement): Point {
	const { left, top, width, height } = node.getBoundingClientRect();
	return { x: left + width / 2, y: top + height / 2 };
}

function snapToDevicePixels(length: number): number {
	return Math.round(length * devicePixelRatio) / devicePixelRatio;
}

export class GridReorderState {
	#onReorder: (move: { from: number; to: number }) => void;
	#nodes = new SvelteMap<number, HTMLElement>();
	#grid: HTMLElement | null = null;
	#centers: Point[] = [];
	#gridAtLift: Point = { x: 0, y: 0 };
	#grab: Point = { x: 0, y: 0 };
	#pointer: Point = { x: 0, y: 0 };
	#scrollWatch: AbortController | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#pressed: {
		index: number;
		pointerId: number;
		node: HTMLElement;
		origin: Point;
	} | null = null;

	from = $state(-1);
	to = $state(-1);
	#offset = $state<Point>({ x: 0, y: 0 });

	constructor({
		onReorder,
	}: {
		onReorder: (move: { from: number; to: number }) => void;
	}) {
		this.#onReorder = onReorder;
	}

	get dragging(): boolean {
		return this.from >= 0;
	}

	grid: Attachment<HTMLElement> = (node) => {
		this.#grid = node;
		return () => {
			if (this.#grid === node) this.#grid = null;
		};
	};

	cell(index: number): Attachment<HTMLElement> {
		return (node) => {
			this.#nodes.set(index, node);
			const blockScroll = (event: TouchEvent) => {
				if (this.dragging && event.cancelable) event.preventDefault();
			};
			node.addEventListener("touchmove", blockScroll, { passive: false });
			return () => {
				node.removeEventListener("touchmove", blockScroll);
				if (this.#nodes.get(index) === node) this.#nodes.delete(index);
			};
		};
	}

	press({ event, index }: { event: PointerEvent; index: number }): void {
		if (event.button > 0) return;
		this.#clearTimer();
		const origin = { x: event.clientX, y: event.clientY };
		this.#pressed = {
			index,
			pointerId: event.pointerId,
			node: event.currentTarget as HTMLElement,
			origin,
		};
		if (event.pointerType === "mouse") return;
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#lift(origin);
			if (this.dragging) playHaptic("dragStart");
		}, TOUCH_LIFT_DELAY_MS);
	}

	move(event: PointerEvent): void {
		const pressed = this.#pressed;
		if (pressed === null || pressed.pointerId !== event.pointerId) return;
		const at = { x: event.clientX, y: event.clientY };
		if (this.dragging) {
			this.#track(at);
			return;
		}
		const travelled = Math.hypot(
			at.x - pressed.origin.x,
			at.y - pressed.origin.y,
		);
		if (travelled <= LIFT_TOLERANCE_PX) return;
		if (event.pointerType === "mouse") this.#lift(at);
		else this.#clearTimer();
	}

	release(): void {
		const { from, to } = this;
		this.cancel();
		if (from >= 0 && to >= 0 && from !== to) this.#onReorder({ from, to });
	}

	cancel(): void {
		this.#clearTimer();
		this.#scrollWatch?.abort();
		this.#scrollWatch = null;
		this.#pressed = null;
		this.from = -1;
		this.to = -1;
	}

	transformFor(index: number): string | undefined {
		if (!this.dragging) return undefined;
		if (index === this.from) {
			return `translate(${this.#offset.x}px, ${this.#offset.y}px)`;
		}
		const here = this.#centers[index];
		const there =
			this.#centers[previewSlot({ index, from: this.from, to: this.to })];
		if (here === undefined || there === undefined) return undefined;
		const x = snapToDevicePixels(there.x - here.x);
		const y = snapToDevicePixels(there.y - here.y);
		return `translate(${x}px, ${y}px)`;
	}

	#lift(at: Point): void {
		const pressed = this.#pressed;
		if (pressed === null) return;
		this.#centers = [...this.#nodes]
			.sort(([a], [b]) => a - b)
			.map(([, element]) => centerOf(element));
		const center = this.#centers[pressed.index];
		if (center === undefined) return;
		this.#gridAtLift = this.#gridCorner();
		this.#grab = { x: at.x - center.x, y: at.y - center.y };
		this.#pointer = at;
		this.#offset = { x: 0, y: 0 };
		this.from = pressed.index;
		this.to = pressed.index;
		pressed.node.setPointerCapture(pressed.pointerId);
		this.#watchScroll();
	}

	#track(at: Point): void {
		this.#pointer = at;
		const origin = this.#centers[this.from];
		if (origin === undefined) return;
		const corner = this.#gridCorner();
		const held = {
			x: at.x - this.#grab.x - (corner.x - this.#gridAtLift.x),
			y: at.y - this.#grab.y - (corner.y - this.#gridAtLift.y),
		};
		this.#offset = { x: held.x - origin.x, y: held.y - origin.y };
		this.to = nearestSlot({ centers: this.#centers, ...held });
	}

	#gridCorner(): Point {
		if (this.#grid === null) return { x: 0, y: 0 };
		const { left, top } = this.#grid.getBoundingClientRect();
		return { x: left, y: top };
	}

	#watchScroll(): void {
		this.#scrollWatch?.abort();
		this.#scrollWatch = new AbortController();
		document.addEventListener("scroll", () => this.#track(this.#pointer), {
			capture: true,
			passive: true,
			signal: this.#scrollWatch.signal,
		});
	}

	#clearTimer(): void {
		if (this.#timer === null) return;
		clearTimeout(this.#timer);
		this.#timer = null;
	}
}
