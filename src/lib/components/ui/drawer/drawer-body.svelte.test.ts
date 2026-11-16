// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import DrawerBody from "./drawer-body.svelte";

const PAN_DOWN_ONLY = "touch-pan-down";
const SCROLLED_PX = 120;

afterEach(cleanup);

function renderBody(props: { onscroll?: (event: Event) => void } = {}) {
	const { container } = render(DrawerBody, { props });
	const body = container.querySelector<HTMLElement>(
		'[data-slot="drawer-body"]',
	);
	if (!body) throw new Error("drawer body not rendered");
	return body;
}

async function scrollTo(body: HTMLElement, top: number) {
	body.scrollTop = top;
	body.dispatchEvent(new Event("scroll"));
	await tick();
}

function pansDownOnly(body: HTMLElement) {
	return body.classList.contains(PAN_DOWN_ONLY);
}

describe("drawer body", () => {
	it("leaves a downward finger to the drawer only while scrolled to the top", async () => {
		const body = renderBody();
		expect(pansDownOnly(body), "at the top on open").toBe(true);

		await scrollTo(body, SCROLLED_PX);
		expect(pansDownOnly(body), "scrolled into the content").toBe(false);

		await scrollTo(body, 0);
		expect(pansDownOnly(body), "back at the top").toBe(true);
	});

	it("still calls the consumer's scroll handler", async () => {
		const onscroll = vi.fn((event: Event) => event.currentTarget);
		const body = renderBody({ onscroll });

		await scrollTo(body, SCROLLED_PX);

		expect(onscroll).toHaveBeenCalledOnce();
		expect(onscroll).toHaveReturnedWith(body);
		expect(pansDownOnly(body)).toBe(false);
	});
});
