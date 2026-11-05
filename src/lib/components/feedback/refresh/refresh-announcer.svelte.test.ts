// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	RefreshAnnouncer,
	REFRESHED_HELD_MS,
} from "./refresh-announcer.svelte";

let listRatio = 1;
let ratios = new Map<Element, number>();
let liveReports = new Set<() => void>();
let firstReports: (() => void)[] = [];

class ListIntersectionObserver {
	readonly #callback: IntersectionObserverCallback;
	readonly #reports = new Set<() => void>();

	constructor(callback: IntersectionObserverCallback) {
		this.#callback = callback;
	}

	observe(target: Element) {
		const report = () =>
			this.#callback(
				[
					{
						target,
						intersectionRatio: ratios.get(target) ?? listRatio,
					} as IntersectionObserverEntry,
				],
				this as unknown as IntersectionObserver,
			);
		this.#reports.add(report);
		liveReports.add(report);
		firstReports.push(report);
	}

	disconnect() {
		for (const report of this.#reports) liveReports.delete(report);
		this.#reports.clear();
	}
}

function nextFrame() {
	const due = firstReports.filter((report) => liveReports.has(report));
	firstReports = [];
	for (const report of due) report();
}

function showList({ ratio, list }: { ratio: number; list?: Element }) {
	if (list) ratios.set(list, ratio);
	else listRatio = ratio;
	for (const report of liveReports) report();
}

function trackList({
	announcer,
	list = document.body.appendChild(document.createElement("div")),
}: {
	announcer: RefreshAnnouncer;
	list?: HTMLElement;
}) {
	const tracked = announcer.track(list);
	tracked.follow({ busy: false, updating: false, failed: false });
	return {
		list,
		follow: tracked.follow,
		stop: tracked.stop,
		start: ({ ran = true } = {}) =>
			tracked.follow({ busy: true, updating: ran, failed: false }),
		finish: ({ failed = false } = {}) =>
			tracked.follow({ busy: false, updating: false, failed }),
	};
}

function announcerFor(list?: HTMLElement) {
	const announcer = new RefreshAnnouncer();
	const tracked = trackList({ announcer, list });
	nextFrame();
	return { announcer, ...tracked };
}

function modal({ around }: { around?: HTMLElement } = {}) {
	const dialog = document.createElement("div");
	dialog.setAttribute("role", "dialog");
	dialog.setAttribute("aria-modal", "true");
	if (around) dialog.append(around);
	document.body.append(dialog);
	return dialog;
}

beforeEach(() => {
	vi.useFakeTimers();
	listRatio = 1;
	ratios = new Map();
	liveReports = new Set();
	firstReports = [];
	vi.stubGlobal("IntersectionObserver", ListIntersectionObserver);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe("RefreshAnnouncer", () => {
	it("says Refreshing, then Refreshed, and takes Refreshed back 3 s later", () => {
		const { announcer, start, finish } = announcerFor();

		start();
		expect(announcer.text).toBe("Refreshing");
		finish();
		expect(announcer.text).toBe("Refreshed");

		vi.advanceTimersByTime(REFRESHED_HELD_MS - 1);
		expect(announcer.text).toBe("Refreshed");
		vi.advanceTimersByTime(1);
		expect(announcer.text).toBe("");
	});

	it("keeps Refreshing for a refresh that starts before Refreshed is taken back", () => {
		const { announcer, start, finish } = announcerFor();
		start();
		finish();

		vi.advanceTimersByTime(REFRESHED_HELD_MS - 1);
		start();
		vi.advanceTimersByTime(REFRESHED_HELD_MS);

		expect(announcer.text).toBe("Refreshing");
	});

	it("says nothing once a refresh fails", () => {
		const { announcer, start, finish } = announcerFor();

		start();
		finish({ failed: true });

		expect(announcer.text).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("never says Refreshed for a refresh its list never ran", () => {
		const { announcer, start, finish } = announcerFor();

		start({ ran: false });
		expect(announcer.text).toBe("Refreshing");
		finish();

		expect(announcer.text).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("says Refreshed for a refresh its list began running after the spinner did", () => {
		const { announcer, start, follow, finish } = announcerFor();

		start({ ran: false });
		follow({ busy: true, updating: true, failed: false });
		follow({ busy: true, updating: false, failed: false });
		finish();

		expect(announcer.text).toBe("Refreshed");
	});

	it("stays quiet about a refresh already running when it starts following, and speaks about the next one", () => {
		const announcer = new RefreshAnnouncer();
		const list = document.body.appendChild(document.createElement("div"));
		const tracked = announcer.track(list);
		nextFrame();

		tracked.follow({ busy: true, updating: true, failed: false });
		expect(announcer.text).toBe("");
		tracked.follow({ busy: false, updating: false, failed: false });
		expect(announcer.text).toBe("");

		tracked.follow({ busy: true, updating: true, failed: false });
		expect(announcer.text).toBe("Refreshing");
	});

	it("stays quiet through a refresh that starts before its list is first seen, and speaks about the next one", () => {
		const announcer = new RefreshAnnouncer();
		const { start, finish } = trackList({ announcer });

		start();
		expect(announcer.text).toBe("");
		nextFrame();
		finish();
		expect(announcer.text).toBe("");

		start();
		expect(announcer.text).toBe("Refreshing");
		finish();
		expect(announcer.text).toBe("Refreshed");
	});

	it("stays silent for a list less than half on screen, and speaks once it is back", () => {
		const { announcer, start, finish } = announcerFor();
		showList({ ratio: 0.4 });

		start();
		expect(announcer.text).toBe("");
		finish();
		expect(announcer.text).toBe("");

		showList({ ratio: 1 });
		start();
		expect(announcer.text).toBe("Refreshing");
	});

	it("takes Refreshing back for a refresh that ends after its list left the screen", () => {
		const { announcer, start, finish } = announcerFor();
		start();

		showList({ ratio: 0 });
		finish();

		expect(announcer.text).toBe("");
	});

	it.each([
		{ cover: "inert", value: "" },
		{ cover: "aria-hidden", value: "true" },
	])("stays silent for a list under an $cover cover", ({ cover, value }) => {
		const covering = document.createElement("div");
		covering.setAttribute(cover, value);
		const list = document.createElement("div");
		covering.append(list);
		document.body.append(covering);
		const { announcer, start, finish } = announcerFor(list);

		start();
		expect(announcer.text).toBe("");
		finish();
		expect(announcer.text).toBe("");
	});

	it("stays silent for a list under an open modal dialog or drawer", () => {
		const { announcer, start, finish } = announcerFor();
		modal();

		start();
		expect(announcer.text).toBe("");
		finish();
		expect(announcer.text).toBe("");
	});

	it("stays silent for a list under an open photo viewer", () => {
		const { announcer, start, finish } = announcerFor();
		document.body.append(
			Object.assign(document.createElement("div"), { className: "pswp" }),
		);

		start();
		expect(announcer.text).toBe("");
		finish();
		expect(announcer.text).toBe("");
	});

	it("takes Refreshing back for a refresh that ends under a modal opened meanwhile", () => {
		const { announcer, start, finish } = announcerFor();
		start();

		modal();
		finish();

		expect(announcer.text).toBe("");
	});

	it("still speaks for a list inside the open modal", () => {
		const list = document.createElement("div");
		modal({ around: list });
		const { announcer, start, finish } = announcerFor(list);

		start();
		expect(announcer.text).toBe("Refreshing");
		finish();
		expect(announcer.text).toBe("Refreshed");
	});

	it("goes quiet and drops the pending clear once it stops tracking its last list", () => {
		const { announcer, start, finish, stop } = announcerFor();
		start();
		finish();

		stop();

		expect(announcer.text).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("RefreshAnnouncer over lists refreshing together", () => {
	function twoLists() {
		const announcer = new RefreshAnnouncer();
		const inbox = trackList({ announcer });
		const chat = trackList({ announcer });
		nextFrame();
		return { announcer, inbox, chat };
	}

	it("says Refreshing once and Refreshed once when both land", () => {
		const { announcer, inbox, chat } = twoLists();

		inbox.start();
		chat.start();
		expect(announcer.text).toBe("Refreshing");
		inbox.finish();
		expect(announcer.text).toBe("Refreshing");
		chat.finish();
		expect(announcer.text).toBe("Refreshed");
	});

	it("says nothing once either of them fails", () => {
		const { announcer, inbox, chat } = twoLists();

		inbox.start();
		chat.start();
		inbox.finish({ failed: true });
		expect(announcer.text).toBe("Refreshing");
		chat.finish();

		expect(announcer.text).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("leaves a list that went away out of the outcome", () => {
		const { announcer, inbox, chat } = twoLists();

		inbox.start();
		chat.start();
		chat.stop();
		expect(announcer.text).toBe("Refreshing");
		inbox.finish();

		expect(announcer.text).toBe("Refreshed");
	});

	it("takes Refreshing back once the only list speaking goes away", () => {
		const { announcer, inbox } = twoLists();

		inbox.start();
		inbox.stop();

		expect(announcer.text).toBe("");
	});

	it("leaves a list off screen out of a refresh another list speaks about", () => {
		const { announcer, inbox, chat } = twoLists();
		showList({ ratio: 0, list: inbox.list });

		chat.start();
		inbox.start();
		chat.finish();
		expect(announcer.text).toBe("Refreshed");
		inbox.finish({ failed: true });

		expect(announcer.text).toBe("Refreshed");
	});
});
