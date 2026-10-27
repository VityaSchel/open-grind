import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { openExternalLink, currentPlatform } = vi.hoisted(() => ({
	openExternalLink: vi.fn(),
	currentPlatform: vi.fn<typeof import("$lib/platform/os").currentPlatform>(
		() => "android",
	),
}));
vi.mock("$lib/platform/link-opener", () => ({ openExternalLink }));
vi.mock("$lib/platform/os", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/os")>()),
	currentPlatform,
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import Message from "./Message.svelte";

const GEO_URL = "geo:51.507456,-0.127812?q=51.507456,-0.127812";
const WEB_URL =
	"https://www.openstreetmap.org/?mlat=51.507456&mlon=-0.127812#map=16/51.507456/-0.127812";
const LOCATION_NAME = "Location 51.50746, -0.12781 Open map";

function renderLocation(
	isOut = false,
	actions: {
		onReply?: () => void;
		onReact?: (reactionId: number) => void;
	} = {},
) {
	return render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				type: "Location",
				messageId: "location-1",
				conversationId: "1:2",
				senderId: isOut ? 1 : 2,
				timestamp: 1_700_000_000_000,
				body: { lat: 51.507456, lon: -0.127812 },
			}),
			isOut,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
			...actions,
		},
	});
}

async function pointerClick(
	target: HTMLElement,
	pointerType: "mouse" | "touch",
) {
	await fireEvent(
		target,
		Object.assign(new Event("pointerdown", { bubbles: true }), {
			pointerType,
		}),
	);
	await fireEvent(
		target,
		Object.assign(new Event("pointerup", { bubbles: true }), {
			pointerType,
		}),
	);
	await fireEvent.click(target, { detail: 1 });
}

beforeEach(() => {
	currentPlatform.mockReturnValue("android");
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
	cleanup();
	vi.useRealTimers();
	vi.clearAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("location messages", () => {
	it.each([false, true])(
		"renders a location with isOut=%s and opens its exact coordinates",
		async (isOut) => {
			renderLocation(isOut);

			expect(screen.getByText("Location")).toBeTruthy();
			expect(screen.getByText("51.50746, -0.12781")).toBeTruthy();
			const link = screen.getByRole("link", { name: LOCATION_NAME });
			expect(link.getAttribute("href")).toBe(GEO_URL);
			expect(link.contains(screen.getByText("Location"))).toBe(true);
			expect(link.contains(screen.getByText("51.50746, -0.12781"))).toBe(
				true,
			);
			await pointerClick(screen.getByText("Location"), "mouse");
			expect(openExternalLink).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(300);
			expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(GEO_URL);
		},
	);

	it.each([
		"ios",
		"macos",
		"windows",
		"linux",
		"freebsd",
		"dragonfly",
		"netbsd",
		"openbsd",
		"solaris",
		"web",
	] as const)(
		"opens OpenStreetMap at the exact coordinates on %s",
		async (platform) => {
			currentPlatform.mockReturnValue(platform);
			renderLocation();
			const link = screen.getByRole("link", { name: LOCATION_NAME });
			expect(link.getAttribute("href")).toBe(WEB_URL);

			await pointerClick(link, "mouse");
			await vi.advanceTimersByTimeAsync(300);

			expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(WEB_URL);
		},
	);

	it("opens the map once after a single touch tap", async () => {
		renderLocation();

		await pointerClick(screen.getByText("Location"), "touch");
		await vi.advanceTimersByTimeAsync(300);

		expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(GEO_URL);
	});

	it.each([false, true])(
		"replies on double click with isOut=%s without opening a map",
		async (isOut) => {
			const onReply = vi.fn();
			const onReact = vi.fn();
			renderLocation(isOut, { onReply, onReact });
			const link = screen.getByRole("link", { name: LOCATION_NAME });

			await pointerClick(link, "mouse");
			await vi.advanceTimersByTimeAsync(100);
			await pointerClick(link, "mouse");
			await fireEvent.doubleClick(link, { detail: 2 });
			await vi.advanceTimersByTimeAsync(1_000);

			expect(onReply).toHaveBeenCalledExactlyOnceWith();
			expect(onReact).not.toHaveBeenCalled();
			expect(openExternalLink).not.toHaveBeenCalled();
		},
	);

	it.each([false, true])(
		"preserves double tap reaction behavior with isOut=%s without opening a map",
		async (isOut) => {
			const onReply = vi.fn();
			const onReact = vi.fn();
			renderLocation(isOut, { onReply, onReact });
			const link = screen.getByRole("link", { name: LOCATION_NAME });

			await pointerClick(link, "touch");
			await vi.advanceTimersByTimeAsync(100);
			await pointerClick(link, "touch");
			await fireEvent.doubleClick(link, { detail: 2 });
			await vi.advanceTimersByTimeAsync(1_000);

			if (isOut) expect(onReact).not.toHaveBeenCalled();
			else expect(onReact).toHaveBeenCalledExactlyOnceWith(1);
			expect(onReply).not.toHaveBeenCalled();
			expect(openExternalLink).not.toHaveBeenCalled();
		},
	);

	it.each(["mouse", "touch"] as const)(
		"cancels pending navigation on a second %s press",
		async (pointerType) => {
			renderLocation();
			const link = screen.getByRole("link", { name: LOCATION_NAME });
			await pointerClick(link, pointerType);
			await vi.advanceTimersByTimeAsync(100);

			await fireEvent(
				link,
				Object.assign(new Event("pointerdown", { bubbles: true }), {
					pointerType,
				}),
			);
			await vi.advanceTimersByTimeAsync(300);

			expect(openExternalLink).not.toHaveBeenCalled();
		},
	);

	it("opens immediately for keyboard or assistive activation", async () => {
		renderLocation();

		await fireEvent.click(
			screen.getByRole("link", { name: LOCATION_NAME }),
			{ detail: 0 },
		);

		expect(openExternalLink).toHaveBeenCalledExactlyOnceWith(GEO_URL);
	});

	it("cancels pending map navigation when the message unmounts", async () => {
		const view = renderLocation();
		await pointerClick(screen.getByText("Location"), "mouse");

		view.unmount();
		await vi.advanceTimersByTimeAsync(1_000);

		expect(openExternalLink).not.toHaveBeenCalled();
	});
});

describe("location message text", () => {
	it("words its title and map link in the active locale", async () => {
		renderLocation();
		const title = screen.getByText("Location");
		const openMap = screen.getByText("Open map");

		await setLocale({ locale: "en-XA" });

		expect(title.textContent).toMatch(PSEUDO_MESSAGE);
		expect(openMap.textContent).toMatch(PSEUDO_MESSAGE);
		expect(screen.getByText("51.50746, -0.12781")).toBeTruthy();
	});
});
