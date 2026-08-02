import type { Page } from "@playwright/test";

export type PullSnapshot = {
	phase: string | undefined;
	overlayHeight: number;
	opacity: number;
	hint: string | null;
	hasButton: boolean;
	disc: boolean;
	spinning: boolean;
	bandWrites: number;
};

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
