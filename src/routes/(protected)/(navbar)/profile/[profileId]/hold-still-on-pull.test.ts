// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	makeScrollable,
	touchEvent,
} from "#lib/components/feedback/refresh/pull-test-helpers.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import {
	holdsStillHere,
	holdsStillOnPull,
	NATIVE_CLICK_WAIT_MS,
} from "./hold-still-on-pull";

const LANDING = { x: 100, y: 100 };

function stamped<T extends Event>({
	event,
	timeStamp,
}: {
	event: T;
	timeStamp: number | undefined;
}): T {
	if (timeStamp !== undefined)
		Object.defineProperty(event, "timeStamp", { value: timeStamp });
	return event;
}

function harness() {
	const profile = document.createElement("div");
	const hero = document.createElement("div");
	const carousel = document.createElement("div");
	const photo = document.createElement("img");
	const about = document.createElement("p");
	carousel.append(photo);
	hero.append(carousel);
	profile.append(hero, about);
	document.body.append(profile);
	makeScrollable(profile);
	makeScrollable(carousel);
	const release = holdsStillOnPull(hero);
	const clicks: MouseEvent[] = [];
	photo.addEventListener("click", (event) => clicks.push(event));
	const lifts: Event[] = [];
	photo.addEventListener("pointerup", (event) => lifts.push(event));

	return {
		profile,
		carousel,
		clicks,
		lifts,
		land({ timeStamp }: { timeStamp?: number } = {}) {
			photo.dispatchEvent(
				stamped({
					event: touchEvent("touchstart", LANDING),
					timeStamp,
				}),
			);
		},
		joinFinger({ alreadyDown }: { alreadyDown: "photo" | "about" }) {
			const event = touchEvent("touchstart", { id: 1, ...LANDING });
			const joining = { identifier: 1, target: photo };
			Object.defineProperties(event, {
				touches: {
					value: [
						{
							identifier: 0,
							target: alreadyDown === "photo" ? photo : about,
						},
						joining,
					],
				},
				changedTouches: { value: [joining] },
			});
			photo.dispatchEvent(event);
		},
		held({
			id = 0,
			x = LANDING.x,
			y,
		}: {
			id?: number;
			x?: number;
			y: number;
		}) {
			const move = touchEvent("touchmove", { id, x, y });
			photo.dispatchEvent(move);
			return move.defaultPrevented;
		},
		lift({
			y = LANDING.y,
			timeStamp,
		}: { y?: number; timeStamp?: number } = {}) {
			const end = stamped({
				event: touchEvent("touchend", { x: LANDING.x, y }),
				timeStamp,
			});
			photo.dispatchEvent(end);
			return end;
		},
		liftPointer() {
			const up = new MouseEvent("pointerup", {
				bubbles: true,
				cancelable: true,
			});
			Object.defineProperty(up, "pointerType", { value: "touch" });
			photo.dispatchEvent(up);
		},
		clickNatively({ detail = 1 } = {}) {
			photo.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
					cancelable: true,
					detail,
				}),
			);
		},
		detach() {
			if (typeof release === "function") release();
			profile.remove();
		},
	};
}

beforeEach(() => {
	runningOn("ios");
});

afterEach(() => {
	vi.useRealTimers();
	resetPlatform();
});

describe("holdsStillHere", () => {
	it.each([
		{ platform: "android", holds: true },
		{ platform: "ios", holds: true },
		{ platform: "linux", holds: false },
		{ platform: "macos", holds: false },
		{ platform: "windows", holds: false },
	] as const)(
		"says whether $platform holds the profile still",
		({ platform, holds }) => {
			runningOn(platform);

			expect(holdsStillHere()).toBe(holds);
		},
	);
});

describe("a drag that starts on the profile photos", () => {
	it.each(["android", "ios"] as const)(
		"holds still on %s once it heads down from the first photo at the top of the profile",
		(platform) => {
			runningOn(platform);
			const h = harness();

			h.land();
			expect(h.held({ y: LANDING.y + 2 })).toBe(false);
			expect(h.held({ y: LANDING.y + 30 })).toBe(true);
			expect(h.held({ x: LANDING.x + 90, y: LANDING.y + 40 })).toBe(true);
			expect(h.held({ y: LANDING.y - 20 })).toBe(true);
			h.detach();
		},
	);

	it.each(["linux", "macos", "windows"] as const)(
		"moves as usual on %s",
		(platform) => {
			runningOn(platform);
			const h = harness();

			h.land();
			expect(h.held({ y: LANDING.y + 30 })).toBe(false);
			h.detach();
		},
	);

	it("moves to the next photo when it heads up", () => {
		const h = harness();

		h.land();
		expect(h.held({ y: LANDING.y - 30 })).toBe(false);
		expect(h.held({ y: LANDING.y + 30 })).toBe(false);
		h.detach();
	});

	it("scrolls the profile back up while the profile is scrolled", () => {
		const h = harness();
		h.profile.scrollTop = 200;

		h.land();
		expect(h.held({ y: LANDING.y + 30 })).toBe(false);
		h.detach();
	});

	it("moves to the previous photo past the first one", () => {
		const h = harness();
		h.carousel.scrollTop = 100;

		h.land();
		expect(h.held({ y: LANDING.y + 30 })).toBe(false);
		h.detach();
	});

	it("leaves a sideways swipe to the profile pager, even when it turns down", () => {
		const h = harness();

		h.land();
		expect(h.held({ x: LANDING.x + 30, y: LANDING.y + 10 })).toBe(false);
		expect(h.held({ x: LANDING.x + 40, y: LANDING.y + 200 })).toBe(false);
		h.detach();
	});

	it("decides each drag afresh once the next finger lands", () => {
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 30 });
		h.lift();

		h.land();
		expect(h.held({ y: LANDING.y + 2 })).toBe(false);
		expect(h.held({ y: LANDING.y - 30 })).toBe(false);
		h.detach();
	});

	it("holds from a first move of a few pixels, before the next move can start the native scroll", () => {
		const h = harness();

		h.land();
		expect(h.held({ y: LANDING.y + 4.7 })).toBe(true);
		h.detach();
	});

	it("keeps holding when a second finger joins on the photos", () => {
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 30 });

		h.joinFinger({ alreadyDown: "photo" });
		expect(h.held({ y: LANDING.y + 60 })).toBe(true);
		h.detach();
	});

	it("never holds a finger that lands on the photos while another rests on the profile", () => {
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 30 });
		h.lift();

		h.joinFinger({ alreadyDown: "about" });
		expect(h.held({ id: 1, y: LANDING.y - 30 })).toBe(false);
		expect(h.held({ id: 1, y: LANDING.y + 30 })).toBe(false);
		h.detach();
	});

	it("lets go of the photos once detached", () => {
		const h = harness();
		h.detach();
		document.body.append(h.profile);

		h.land();
		expect(h.held({ y: LANDING.y + 30 })).toBe(false);
		h.profile.remove();
	});
});

describe("a tap on the profile photos while they hold still", () => {
	it.each([
		{ platform: "android", slop: 8 },
		{ platform: "ios", slop: 10 },
	] as const)(
		"still taps the photo on $platform once a finger that rolled down within $slop px lifts",
		({ platform, slop }) => {
			runningOn(platform);
			const h = harness();

			h.land();
			expect(h.held({ y: LANDING.y + 4 })).toBe(true);
			expect(h.held({ y: LANDING.y + slop })).toBe(true);
			const end = h.lift({ y: LANDING.y + slop });

			expect(end.defaultPrevented).toBe(true);
			expect(h.clicks).toHaveLength(1);
			const [click] = h.clicks;
			expect(click!.detail).toBe(1);
			expect([click!.clientX, click!.clientY]).toEqual([
				LANDING.x,
				LANDING.y + slop,
			]);
			h.detach();
		},
	);

	it.each([
		{ platform: "android", slop: 8 },
		{ platform: "ios", slop: 10 },
	] as const)(
		"leaves a drag past $slop px on $platform without a tap",
		({ platform, slop }) => {
			runningOn(platform);
			const h = harness();

			h.land();
			h.held({ y: LANDING.y + slop + 1 });
			h.held({ y: LANDING.y + 2 });
			h.lift({ y: LANDING.y + 2 });

			expect(h.clicks).toHaveLength(0);
			h.detach();
		},
	);

	it.each([
		{ platform: "android", slop: 8 },
		{ platform: "ios", slop: 10 },
	] as const)(
		"keeps the lift of a drag past $slop px on $platform from the photos, as the pan it held back would have cancelled it",
		({ platform, slop }) => {
			runningOn(platform);
			const h = harness();
			const seenByWindow: Event[] = [];
			const watching = new AbortController();
			window.addEventListener(
				"pointerup",
				(event) => seenByWindow.push(event),
				{ capture: true, signal: watching.signal },
			);

			h.land();
			h.held({ y: LANDING.y + slop + 1 });
			h.liftPointer();
			watching.abort();

			expect(h.lifts).toHaveLength(0);
			expect(seenByWindow).toHaveLength(1);
			h.detach();
		},
	);

	it("lets the lift of a tap that rolled within the slop reach the photos", () => {
		const h = harness();

		h.land();
		h.held({ y: LANDING.y + 4 });
		h.liftPointer();

		expect(h.lifts).toHaveLength(1);
		h.detach();
	});

	it("lets the lift of a drag it never held reach the photos", () => {
		const h = harness();

		h.land();
		h.held({ y: LANDING.y - 30 });
		h.liftPointer();

		expect(h.lifts).toHaveLength(1);
		h.detach();
	});

	it("leaves a press held as long as a long press without a tap", () => {
		const h = harness();

		h.land({ timeStamp: 1000 });
		h.held({ y: LANDING.y + 4 });
		h.lift({ y: LANDING.y + 4, timeStamp: 1500 });

		expect(h.clicks).toHaveLength(0);
		h.detach();
	});

	it("leaves a tap that never held the photos still to the browser", () => {
		const h = harness();

		h.land();
		expect(h.held({ y: LANDING.y + 2 })).toBe(false);
		const end = h.lift({ y: LANDING.y + 2 });

		expect(end.defaultPrevented).toBe(false);
		expect(h.clicks).toHaveLength(0);
		h.detach();
	});

	it("drops the browser's own click after a tapped photo, so the photo opens once", () => {
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 4 });
		h.lift({ y: LANDING.y + 4 });

		h.clickNatively();
		expect(h.clicks).toHaveLength(1);

		h.clickNatively();
		expect(h.clicks).toHaveLength(2);
		h.detach();
	});

	it("lets a click from the keyboard through right after a tapped photo", () => {
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 4 });
		h.lift({ y: LANDING.y + 4 });

		h.clickNatively({ detail: 0 });

		expect(h.clicks).toHaveLength(2);
		h.detach();
	});

	it("lets the next press click as usual once the browser's click never came", () => {
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 4 });
		h.lift({ y: LANDING.y + 4 });

		window.dispatchEvent(new Event("pointerdown"));
		h.clickNatively();

		expect(h.clicks).toHaveLength(2);
		h.detach();
	});

	it("stops waiting for the browser's click after a while", () => {
		vi.useFakeTimers();
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 4 });
		h.lift({ y: LANDING.y + 4 });

		vi.advanceTimersByTime(NATIVE_CLICK_WAIT_MS);
		h.clickNatively();

		expect(h.clicks).toHaveLength(2);
		h.detach();
	});

	it("stops waiting for the browser's click once detached", () => {
		const h = harness();
		h.land();
		h.held({ y: LANDING.y + 4 });
		h.lift({ y: LANDING.y + 4 });

		h.detach();
		document.body.append(h.profile);
		h.clickNatively();

		expect(h.clicks).toHaveLength(2);
		h.profile.remove();
	});
});
