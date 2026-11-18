import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavigationType } from "$app/navigation";

const hooks = vi.hoisted(() => ({
	onNavigate: [] as (() => void)[],
	afterNavigate: [] as ((navigation: { type: NavigationType }) => void)[],
	onSignOut: [] as (() => Promise<void>)[],
}));

vi.mock("$app/navigation", () => ({
	onNavigate: (callback: () => void) => hooks.onNavigate.push(callback),
	afterNavigate: (callback: (navigation: { type: NavigationType }) => void) =>
		hooks.afterNavigate.push(callback),
}));
vi.mock("#lib/api/sign-out.ts", () => ({
	onSignOut: (release: () => Promise<void>) => hooks.onSignOut.push(release),
}));

import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { HISTORY_METADATA_KEY } from "#lib/util/history-index.ts";
import {
	ScreenSnapshots,
	screenSnapshots,
	type SnapshotKind,
	trackScreenSnapshots,
} from "./screen-snapshots.svelte";
import type { Snapshot } from "./snapshot";
import { fakeHistory } from "./stack-test-helpers";

function picture(path: string): Snapshot {
	return { node: document.createElement("div"), path, restore: () => {} };
}

function trackedHistory({ at = "/" }: { at?: string } = {}) {
	const history = fakeHistory({ paths: [at] });
	const snapshots = new ScreenSnapshots({ historyIndex: history.index });
	snapshots.navigated({ type: "enter" });

	const taken = new Map<string, Snapshot>();
	const capture = ({ kind, path }: { kind: SnapshotKind; path: string }) => {
		const snapshot = picture(path);
		taken.set(path, snapshot);
		return snapshots.remember({ snapshot, kind });
	};

	return {
		history,
		snapshots,
		taken,
		push: ({
			to,
			kind,
			capturedFirst = true,
		}: {
			to: string;
			kind?: SnapshotKind;
			capturedFirst?: boolean;
		}) => {
			const from = history.path()!;
			history.push(to);
			if (kind && capturedFirst) capture({ kind, path: from });
			snapshots.navigating();
			if (kind && !capturedFirst) capture({ kind, path: from });
			snapshots.navigated({ type: "link" });
		},
		replace: ({ to, kind }: { to: string; kind?: SnapshotKind }) => {
			const from = history.path()!;
			history.replace(to);
			const stored = kind ? capture({ kind, path: from }) : false;
			snapshots.navigating();
			snapshots.navigated({ type: "goto" });
			return stored;
		},
		go: (delta: number) => {
			history.go(delta);
			snapshots.navigating();
			snapshots.navigated({ type: "popstate" });
		},
	};
}

afterEach(async () => {
	vi.unstubAllGlobals();
	screenSnapshots.clear();
	globalThis.history.replaceState(null, "", "/");
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("ScreenSnapshots", () => {
	it("files a snapshot under the entry that was showing, though history has already moved on when it is taken", () => {
		const tracked = trackedHistory({ at: "/" });
		tracked.push({ to: "/profile/1", kind: "screen" });

		expect(tracked.snapshots.behind("screen")).toBe(tracked.taken.get("/"));
	});

	it("keeps a snapshot whether it was taken before or after the push was seen", () => {
		const tracked = trackedHistory({ at: "/" });
		tracked.push({
			to: "/profile/1",
			kind: "screen",
			capturedFirst: false,
		});

		expect(tracked.snapshots.behind("screen")).toBe(tracked.taken.get("/"));
	});

	it("offers only the snapshot of the entry right behind the one showing", () => {
		const tracked = trackedHistory({ at: "/settings" });
		tracked.push({ to: "/settings/app", kind: "pane" });
		tracked.push({ to: "/settings/app/credits" });

		expect(tracked.snapshots.behind("pane")).toBeUndefined();

		tracked.go(-1);
		expect(tracked.snapshots.behind("pane")).toBe(
			tracked.taken.get("/settings"),
		);
	});

	it("offers a snapshot only to the stack that asks for its kind", () => {
		const tracked = trackedHistory({ at: "/settings" });
		tracked.push({ to: "/settings/app", kind: "pane" });

		expect(tracked.snapshots.behind("screen")).toBeUndefined();
		expect(tracked.snapshots.behind("pane")).toBeDefined();
	});

	it("offers nothing when history says Back lands on another page than the one pictured", () => {
		const tracked = trackedHistory({ at: "/settings" });
		tracked.push({ to: "/settings/app", kind: "pane" });

		tracked.history.go(-1);
		tracked.history.replace("/chat");
		tracked.history.go(1);

		expect(tracked.snapshots.behind("pane")).toBeUndefined();
	});

	it("drops the snapshot of an entry a replace navigation writes over, keeping the one beneath", () => {
		const tracked = trackedHistory({ at: "/" });
		tracked.push({ to: "/profile/1", kind: "screen" });
		tracked.push({ to: "/profile/2", kind: "screen" });
		tracked.history.go(-1);
		tracked.snapshots.navigated({ type: "popstate" });

		const stored = tracked.replace({ to: "/profile/1", kind: "screen" });

		expect(stored, "a replace is no push to file under").toBe(false);
		expect(tracked.snapshots.behind("screen")).toBe(tracked.taken.get("/"));
		tracked.go(1);
		expect(tracked.snapshots.behind("screen")).toBeUndefined();
	});

	it("accepts a snapshot only while a push leaves the entry showing", () => {
		const { history, snapshots } = trackedHistory({ at: "/" });

		history.push("/profile/1");
		const onPush = snapshots.accepts();
		snapshots.navigating();
		snapshots.navigated({ type: "link" });

		history.replace("/profile/2");
		const onReplace = snapshots.accepts();
		snapshots.navigating();
		snapshots.navigated({ type: "goto" });

		history.go(-1);
		const onTraversal = snapshots.accepts();

		expect({ onPush, onReplace, onTraversal }).toEqual({
			onPush: true,
			onReplace: false,
			onTraversal: false,
		});
	});

	it("drops the snapshots of the entry a traversal lands on and every entry above it", () => {
		const tracked = trackedHistory({ at: "/" });
		tracked.push({ to: "/profile/1", kind: "screen" });
		tracked.push({ to: "/chat/1", kind: "screen" });
		tracked.push({ to: "/profile/2", kind: "screen" });

		tracked.go(-2);
		expect(tracked.snapshots.behind("screen")).toBe(tracked.taken.get("/"));
		tracked.go(1);

		expect(tracked.snapshots.behind("screen")).toBeUndefined();
	});

	it("writes over a stale snapshot and drops those above when a push leaves the entry", () => {
		const tracked = trackedHistory({ at: "/" });
		tracked.push({ to: "/profile/1", kind: "screen" });
		tracked.push({ to: "/profile/2", kind: "screen" });
		tracked.push({ to: "/profile/3", kind: "screen" });
		tracked.history.go(-2);
		tracked.snapshots.navigated({ type: "popstate" });
		const stale = tracked.taken.get("/profile/1");

		tracked.push({ to: "/settings/profile", kind: "screen" });
		expect(tracked.snapshots.behind("screen")).not.toBe(stale);
		expect(tracked.snapshots.behind("screen")).toBe(
			tracked.taken.get("/profile/1"),
		);

		tracked.push({ to: "/profile/4" });
		expect(tracked.snapshots.behind("screen")).toBeUndefined();
	});

	it("keeps the four newest snapshots, letting go of the oldest entry first", () => {
		const tracked = trackedHistory({ at: "/0" });
		for (const step of [1, 2, 3, 4, 5])
			tracked.push({ to: `/${step}`, kind: "screen" });

		const offered = [5, 4, 3, 2, 1].map(() => {
			const behind = tracked.snapshots.behind("screen")?.path;
			tracked.history.go(-1);
			tracked.snapshots.navigated({ type: "popstate" });
			return behind;
		});

		expect(offered).toEqual(["/4", "/3", "/2", "/1", undefined]);
	});

	it("ignores snapshots taken in another language until a push takes a new one", async () => {
		const tracked = trackedHistory({ at: "/" });
		tracked.push({ to: "/profile/1", kind: "screen" });

		await setLocale({ locale: "en-XA" });
		expect(tracked.snapshots.behind("screen")).toBeUndefined();

		tracked.push({ to: "/settings/profile", kind: "screen" });
		expect(tracked.snapshots.behind("screen")).toBe(
			tracked.taken.get("/profile/1"),
		);
	});

	it("tells its readers when the snapshot behind changes", () => {
		const tracked = trackedHistory({ at: "/" });
		const seen: (string | undefined)[] = [];
		const stop = $effect.root(() => {
			const behind = $derived(tracked.snapshots.behind("screen")?.path);
			$effect(() => {
				seen.push(behind);
			});
		});
		flushSync();

		tracked.push({ to: "/profile/1", kind: "screen" });
		flushSync();
		tracked.go(-1);
		flushSync();

		expect(seen).toEqual([undefined, "/", undefined]);
		stop();
	});

	it("starts empty on a page load", () => {
		const tracked = trackedHistory({ at: "/" });
		tracked.push({ to: "/profile/1", kind: "screen" });

		tracked.snapshots.navigated({ type: "enter" });

		expect(tracked.snapshots.behind("screen")).toBeUndefined();
	});
});

describe("trackScreenSnapshots", () => {
	function enter({ path, index }: { path: string; index: number }) {
		globalThis.history.pushState(
			{ [HISTORY_METADATA_KEY]: { historyIndex: index } },
			"",
			path,
		);
	}

	function tracking() {
		hooks.onNavigate.length = 0;
		hooks.afterNavigate.length = 0;
		hooks.onSignOut.length = 0;
		const stop = $effect.root(() => trackScreenSnapshots());
		flushSync();
		const navigate = ({ path, index }: { path: string; index: number }) => {
			enter({ path, index });
			for (const callback of hooks.onNavigate) callback();
		};
		const land = () => {
			for (const callback of hooks.afterNavigate)
				callback({ type: "link" });
		};
		vi.stubGlobal("navigation", {
			get currentEntry() {
				return { index: 1 };
			},
			entries: () =>
				["/", "/profile/1"].map((path) => ({
					url: `${location.origin}${path}`,
				})),
		});
		enter({ path: "/", index: 0 });
		land();
		navigate({ path: "/profile/1", index: 1 });
		screenSnapshots.remember({ snapshot: picture("/"), kind: "screen" });
		land();
		return stop;
	}

	it("follows the app's history into the shared cache", () => {
		const stop = tracking();

		expect(screenSnapshots.behind("screen")?.path).toBe("/");
		stop();
	});

	it("lets go of every snapshot on sign-out", async () => {
		const stop = tracking();

		await Promise.all(hooks.onSignOut.map((release) => release()));

		expect(screenSnapshots.behind("screen")).toBeUndefined();
		stop();
	});

	it("lets go of every snapshot when the viewport changes width, not height", () => {
		const stop = tracking();

		vi.stubGlobal("innerHeight", innerHeight - 300);
		window.dispatchEvent(new Event("resize"));
		expect(screenSnapshots.behind("screen")).toBeDefined();

		vi.stubGlobal("innerWidth", innerWidth + 200);
		window.dispatchEvent(new Event("resize"));
		expect(screenSnapshots.behind("screen")).toBeUndefined();
		stop();
	});
});
