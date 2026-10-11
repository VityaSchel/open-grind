// @vitest-environment jsdom

import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import NoPlaysLeftSlide from "./NoPlaysLeftSlide.svelte";

const teardowns: (() => void)[] = [];

afterEach(async () => {
	for (const teardown of teardowns.splice(0)) teardown();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("NoPlaysLeftSlide", () => {
	it("follows the locale when mounted outside the component tree, as the lightbox mounts it", async () => {
		const target = document.createElement("div");
		document.body.append(target);
		const slide = mount(NoPlaysLeftSlide, {
			target,
			props: { still: null },
		});
		teardowns.push(() => {
			void unmount(slide);
			target.remove();
		});
		expect(target.textContent.trim()).toBe("No plays left");

		await setLocale({ locale: "en-XA" });
		flushSync();

		expect(target.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});
});
