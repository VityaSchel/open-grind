import { edgeGap } from "$lib/components/feedback/refresh/scroll-geometry";
import { preferredScrollBehavior } from "$lib/util/reduced-motion";
import { nearestScrollableAncestor } from "$lib/util/scroll";
import { ElementRegistry } from "./element-registry";

const JUMP_QUIET_MS = 1000;
const TAKEOVER_EVENTS = ["pointerdown", "pointercancel", "wheel"] as const;

type Jump = {
	top: number;
	timer: ReturnType<typeof setTimeout>;
	release: () => void;
};

export class SectionScroll {
	current = $state<string | null>(null);
	readonly headers = new ElementRegistry<HTMLElement>();

	#keys: () => string[];
	#strip: () => HTMLElement | null;
	#holdSheetSize: () => () => void;
	#scroller: Element | null = null;
	#jump: Jump | null = null;
	#landedTop: number | null = null;

	constructor({
		keys,
		strip,
		holdSheetSize,
	}: {
		keys: () => string[];
		strip: () => HTMLElement | null;
		holdSheetSize: () => () => void;
	}) {
		this.#keys = keys;
		this.#strip = strip;
		this.#holdSheetSize = holdSheetSize;
	}

	follow(content: HTMLElement): () => void {
		const scroller = nearestScrollableAncestor(content);
		if (!scroller) return () => {};
		this.#scroller = scroller;
		const onScroll = () => {
			if (this.#jump !== null) {
				this.#followJump(scroller);
				return;
			}
			if (
				this.#landedTop !== null &&
				arrived({ scroller, top: this.#landedTop })
			)
				return;
			this.#landedTop = null;
			this.current = this.#sectionInView(scroller);
		};
		const endJump = () => this.#endJump(scroller);
		const takeOver = (event: Event) => {
			const pressedStrip =
				event.type === "pointerdown" &&
				event.target instanceof Node &&
				this.#strip()?.contains(event.target);
			if (!pressedStrip) this.#endJump(scroller);
		};
		onScroll();
		scroller.addEventListener("scroll", onScroll, { passive: true });
		scroller.addEventListener("scrollend", endJump);
		for (const type of TAKEOVER_EVENTS)
			scroller.addEventListener(type, takeOver, { passive: true });
		return () => {
			scroller.removeEventListener("scroll", onScroll);
			scroller.removeEventListener("scrollend", endJump);
			for (const type of TAKEOVER_EVENTS)
				scroller.removeEventListener(type, takeOver);
			this.#scroller = null;
			this.#landedTop = null;
			if (this.#jump !== null) {
				clearTimeout(this.#jump.timer);
				this.#jump.release();
			}
			this.#jump = null;
		};
	}

	jumpTo(key: string) {
		const scroller = this.#scroller;
		const header = this.headers.get(key);
		const strip = this.#strip();
		if (!scroller || !header || !strip) return;
		const top = Math.min(
			Math.max(
				0,
				Math.ceil(
					scroller.scrollTop +
						header.getBoundingClientRect().top -
						scroller.getBoundingClientRect().top -
						strip.getBoundingClientRect().height,
				),
			),
			scroller.scrollHeight - scroller.clientHeight,
		);
		this.current = key;
		this.#startJump({ scroller, top });
		scroller.scrollTo({ top, behavior: preferredScrollBehavior() });
		if (arrived({ scroller, top })) this.#endJump(scroller);
	}

	#startJump({ scroller, top }: { scroller: Element; top: number }) {
		const running = this.#jump;
		if (running !== null) clearTimeout(running.timer);
		this.#landedTop = null;
		this.#jump = {
			top,
			timer: this.#quietTimer(scroller),
			release: running?.release ?? this.#holdSheetSize(),
		};
	}

	#followJump(scroller: Element) {
		const jump = this.#jump;
		if (jump === null) return;
		if (arrived({ scroller, top: jump.top })) {
			this.#endJump(scroller);
			return;
		}
		clearTimeout(jump.timer);
		jump.timer = this.#quietTimer(scroller);
	}

	#quietTimer(scroller: Element): ReturnType<typeof setTimeout> {
		return setTimeout(() => this.#endJump(scroller), JUMP_QUIET_MS);
	}

	#endJump(scroller: Element) {
		const jump = this.#jump;
		if (jump === null) return;
		clearTimeout(jump.timer);
		this.#jump = null;
		jump.release();
		if (arrived({ scroller, top: jump.top })) this.#landedTop = jump.top;
		else this.current = this.#sectionInView(scroller);
	}

	#sectionInView(scroller: Element): string | null {
		const keys = this.#keys();
		const atBottom =
			edgeGap(
				scroller.scrollHeight -
					scroller.clientHeight -
					scroller.scrollTop,
			) <= 0;
		if (atBottom) return keys.at(-1) ?? null;
		const line = (this.#strip()?.getBoundingClientRect().bottom ?? 0) + 1;
		return (
			keys.findLast(
				(key) =>
					(this.headers.get(key)?.getBoundingClientRect().top ??
						Infinity) <= line,
			) ??
			keys[0] ??
			null
		);
	}
}

function arrived({ scroller, top }: { scroller: Element; top: number }) {
	return edgeGap(scroller.scrollTop - top) === 0;
}
