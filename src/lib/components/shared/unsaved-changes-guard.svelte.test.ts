// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import type { BeforeNavigate, NavigationType } from "$app/navigation";

const { beforeNavigate, goto, page } = vi.hoisted(() => ({
	beforeNavigate:
		vi.fn<(callback: (navigation: BeforeNavigate) => void) => void>(),
	goto: vi.fn(() => Promise.resolve()),
	page: {
		route: { id: "/settings/profile" },
		url: new URL("https://app.test/settings/profile"),
	},
}));

vi.mock("$app/state", () => ({ page }));
vi.mock("$app/navigation", () => ({
	afterNavigate: vi.fn(),
	beforeNavigate,
	goto,
}));

import { clearAccountCaches } from "#lib/api/account-caches.ts";
import { runBackGestureHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import { leaveDeletedPages } from "#lib/util/deleted-pages.ts";
import GuardedSubpage from "./fixtures/GuardedSubpage.svelte";

const SETTINGS_APP = "/(protected)/(navbar)/settings/(subpage)/app";

function navigate({
	to = "/settings/app",
	routeId = SETTINGS_APP,
	type = "link",
	delta,
	willUnload = false,
}: {
	to?: string;
	routeId?: string | null;
	type?: NavigationType;
	delta?: number;
	willUnload?: boolean;
} = {}): boolean {
	const cancel = vi.fn();
	const navigation = {
		type,
		delta,
		willUnload,
		from: { url: page.url, route: page.route },
		to: { url: new URL(to, page.url), route: { id: routeId } },
		complete: Promise.resolve(),
		cancel,
	} as unknown as BeforeNavigate;
	for (const [callback] of beforeNavigate.mock.calls) callback(navigation);
	return cancel.mock.calls.length > 0;
}

const discardPrompt = () =>
	screen.queryByRole("alertdialog", { name: "Discard changes?" });

async function choose(name: "Discard" | "Keep editing") {
	await fireEvent.click(await screen.findByRole("button", { name }));
}

let go: MockInstance<History["go"]>;
let back: MockInstance<History["back"]>;

beforeEach(() => {
	go = vi.spyOn(history, "go").mockImplementation(() => {});
	back = vi.spyOn(history, "back").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	clearAccountCaches();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe("a subpage with unsaved changes", () => {
	it("lets navigations through while nothing is unsaved", () => {
		render(GuardedSubpage, { props: { dirty: false } });

		expect(navigate()).toBe(false);
		expect(runBackGestureHandlers()).toBe(false);
		expect(discardPrompt()).toBeNull();
	});

	it("asks before leaving for another page and stays on Keep editing", async () => {
		render(GuardedSubpage, { props: { dirty: true } });

		expect(navigate()).toBe(true);
		await choose("Keep editing");

		await vi.waitFor(() => expect(discardPrompt()).toBeNull());
		expect(goto).not.toHaveBeenCalled();
		expect(navigate()).toBe(true);
	});

	it("follows the link it stopped once the edits are discarded", async () => {
		render(GuardedSubpage, { props: { dirty: true } });
		navigate({ to: "/chat", routeId: "/(protected)/chat" });

		await choose("Discard");

		expect(goto).toHaveBeenCalledExactlyOnceWith(
			new URL("https://app.test/chat"),
		);
		expect(navigate()).toBe(false);
	});

	it("repeats the history step it stopped once the edits are discarded", async () => {
		render(GuardedSubpage, { props: { dirty: true } });
		navigate({ to: "/settings", type: "popstate", delta: -2 });

		await choose("Discard");

		expect(go).toHaveBeenCalledExactlyOnceWith(-2);
	});

	it("asks on the back gesture and goes back once the edits are discarded", async () => {
		vi.stubGlobal("navigation", { canGoBack: true });
		render(GuardedSubpage, { props: { dirty: true } });

		expect(runBackGestureHandlers()).toBe(true);
		await choose("Discard");

		expect(back).toHaveBeenCalledOnce();
	});

	it("goes up to the parent page on a back gesture with no history", async () => {
		render(GuardedSubpage, { props: { dirty: true } });

		runBackGestureHandlers();
		await choose("Discard");

		expect(goto).toHaveBeenCalledExactlyOnceWith("/settings", {
			replace: true,
		});
	});

	it.each([
		{ exit: "a sign-out", to: "/auth/sign-in", routeId: "/auth/sign-in" },
		{ exit: "an unknown page", to: "/nowhere", routeId: null },
		{
			exit: "a page load",
			to: "/settings/app",
			routeId: SETTINGS_APP,
			willUnload: true,
		},
	])("lets $exit through without asking", (target) => {
		render(GuardedSubpage, { props: { dirty: true } });

		expect(navigate(target)).toBe(false);
		expect(discardPrompt()).toBeNull();
	});

	it("lets a deleted page go without asking", () => {
		render(GuardedSubpage, { props: { dirty: true } });

		leaveDeletedPages({
			pathnames: ["/settings/profile"],
			parent: "/settings",
		});

		expect(navigate({ to: "/settings", type: "goto" })).toBe(false);
	});
});
