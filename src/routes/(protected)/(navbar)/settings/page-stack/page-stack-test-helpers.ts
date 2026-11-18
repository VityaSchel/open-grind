import { expect } from "vitest";

import {
	type StackMotion,
	stackMotion,
} from "#lib/components/navigation/stack/motion.ts";
import { ScreenSnapshots } from "#lib/components/navigation/stack/screen-snapshots.svelte.ts";
import {
	fakeHistory,
	type FakeHistory,
	fakeSurface,
	navigationEvent,
	settleLast,
} from "#lib/components/navigation/stack/stack-test-helpers.ts";
import { PageStackState } from "./page-stack-state.svelte";

export const androidMotion = stackMotion({ platform: "android" });

export type StackHarness = ReturnType<typeof makeStack>;

export function makeStack({
	reducedMotion = false,
	at = "/settings",
	before = [],
	later = [],
	pushedFrom = [],
	motion = androidMotion,
	navigationPending = () => false,
	remounting,
}: {
	reducedMotion?: boolean;
	at?: string;
	before?: string[];
	later?: string[];
	pushedFrom?: { path: string }[];
	motion?: StackMotion;
	navigationPending?: () => boolean;
	remounting?: { history: FakeHistory; snapshots: ScreenSnapshots };
} = {}) {
	const history =
		remounting?.history ??
		fakeHistory({ paths: [...before, at, ...later], index: before.length });
	const snapshots =
		remounting?.snapshots ??
		new ScreenSnapshots({ historyIndex: history.index });
	if (!remounting) snapshots.navigated({ type: "link" });

	const pane = document.createElement("div");
	pane.innerHTML = "<p>live</p>";
	document.body.append(pane);

	const { surface, applied, animations } = fakeSurface();

	const stack = new PageStackState({
		surface,
		motion,
		livePane: () => pane,
		reducedMotion: () => reducedMotion,
		scope: "/settings",
		pushedFrom,
		snapshots,
		navigationPending,
	});

	return { stack, pane, applied, animations, history, snapshots };
}

export async function go(
	{
		stack,
		history,
		snapshots,
	}: Pick<StackHarness, "stack" | "history" | "snapshots">,
	{
		from,
		to,
		delta,
		replace = false,
	}: { from: string; to: string; delta?: number; replace?: boolean },
) {
	expect(history.path(), "history shows the page navigated from").toBe(from);
	if (delta !== undefined) history.go(delta);
	else if (replace) history.replace(to);
	else history.push(to);
	expect(history.path(), "history lands on the page navigated to").toBe(to);

	snapshots.navigating();
	const start = await stack.navigate(navigationEvent({ from, to, delta }));
	snapshots.navigated({ type: delta === undefined ? "link" : "popstate" });
	return start;
}

export async function push(
	harness: StackHarness,
	{ from, to }: { from: string; to: string },
) {
	const start = await go(harness, { from, to });
	start?.();
	await settleLast(harness.animations);
}
