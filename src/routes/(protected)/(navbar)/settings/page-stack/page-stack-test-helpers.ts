import { vi } from "vitest";

import { stackMotion } from "$lib/components/navigation/stack/motion";
import {
	fakeSurface,
	navigationEvent,
	settleLast,
} from "$lib/components/navigation/stack/stack-test-helpers";
import { PageStackState } from "./page-stack-state.svelte";

export const motion = stackMotion({ platform: "android" });

export function makeStack({
	reducedMotion = false,
	canGoBack = true,
	pushedFrom = [],
}: {
	reducedMotion?: boolean;
	canGoBack?: boolean;
	pushedFrom?: { path: string }[];
} = {}) {
	vi.stubGlobal("navigation", { canGoBack });

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
	});

	return { stack, pane, applied, animations };
}

export async function push(
	{ stack, animations }: ReturnType<typeof makeStack>,
	{ from, to }: { from: string; to: string },
) {
	const start = await stack.navigate(navigationEvent({ from, to }));
	start?.();
	await settleLast(animations);
}
