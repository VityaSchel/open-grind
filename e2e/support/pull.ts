import type { Page } from "@playwright/test";

const CONVERSATIONS_SCROLLER = '[data-slot="conversations-scroller"]';

export type PullSnapshot = {
	phase: string | undefined;
	bandHeight: number;
	opacity: number;
	hint: string | null;
	hintBottom: number | null;
	hasButton: boolean;
	disc: boolean;
	spinning: boolean;
	discClippedPx: number | null;
	discOpacity: number | null;
	bandWrites: number;
};

const DISC_VISIBILITY_IN_PAGE = `(overlay) => {
	const disc = overlay.querySelector("[data-refresh-disc]");
	if (!disc) return { discClippedPx: null, discOpacity: null };
	const box = disc.getBoundingClientRect();
	let top = box.top;
	let bottom = box.bottom;
	let discOpacity = 1;
	for (let el = disc; overlay.contains(el); el = el.parentElement) {
		const style = getComputedStyle(el);
		discOpacity *= parseFloat(style.opacity);
		if (el === disc || style.overflowY === "visible") continue;
		const clip = el.getBoundingClientRect();
		top = Math.max(top, clip.top);
		bottom = Math.min(bottom, clip.bottom);
	}
	const shownPx = Math.max(0, bottom - top);
	return { discClippedPx: Math.round(box.height - shownPx), discOpacity };
}`;

export async function installFakeOverscroll(page: Page): Promise<void> {
	await page.addInitScript({
		content: `(() => {
			const nativeScrollTop = Object.getOwnPropertyDescriptor(
				Element.prototype,
				"scrollTop",
			);
			Object.defineProperty(Element.prototype, "scrollTop", {
				configurable: true,
				get() {
					const inContentPosition =
						this.__fakeTop ?? nativeScrollTop.get.call(this);
					return inContentPosition - (this.__band ?? 0);
				},
				set(value) {
					if (this.__band) this.__bandWrites = (this.__bandWrites ?? 0) + 1;
					nativeScrollTop.set.call(this, value);
				},
			});
		})()`,
	});
}

export async function driveInOneGesture<K extends string>(
	page: Page,
	keys: readonly K[],
	body: string,
): Promise<Record<K, PullSnapshot>> {
	const snapshots: Partial<Record<K, PullSnapshot>> =
		await page.evaluate(`(async () => {
		const scroller = document.querySelector('${CONVERSATIONS_SCROLLER}');
		if (!scroller) throw new Error("conversations scroller not found");
		const overlay = document.querySelector("[data-refresh-phase]");
		if (!overlay) throw new Error("refresh control not found");
		const band = overlay.querySelector('[data-slot="refresh-band"]');
		if (!band) throw new Error("refresh band not found");
		const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		const gesture = (px) => {
			scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -8 }));
			scroller.__band = px;
			scroller.dispatchEvent(new Event("scroll"));
		};
		const spring = (px) => {
			scroller.__band = px;
			scroller.dispatchEvent(new Event("scroll"));
		};
		const lift = () => scroller.dispatchEvent(new Event("scrollend"));
		const discVisibility = ${DISC_VISIBILITY_IN_PAGE};
		const snap = () => {
			const button = band.querySelector("button");
			const hint = button ? null : band.querySelector("span");
			return {
				phase: overlay.dataset.refreshPhase,
				bandHeight: Math.round(band.getBoundingClientRect().height),
				opacity: parseFloat(getComputedStyle(band).opacity),
				hint: hint ? hint.textContent.trim() : null,
				hintBottom: hint
					? Math.round(
							hint.getBoundingClientRect().bottom -
								overlay.getBoundingClientRect().top,
						)
					: null,
				hasButton: !!button,
				disc: !!overlay.querySelector("[data-refresh-disc]"),
				spinning: !!overlay.querySelector("[data-refresh-disc][data-spinning]"),
				...discVisibility(overlay),
				bandWrites: scroller.__bandWrites ?? 0,
			};
		};
		${body}
	})()`);

	const missing = keys.filter((key) => snapshots[key] === undefined);
	if (missing.length > 0)
		throw new Error(
			`the page returned no snapshot for ${missing.join(", ")}`,
		);
	return snapshots as Record<K, PullSnapshot>;
}
