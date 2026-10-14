import type { ShownKey } from "../../../src/lib/demo/screenshot-scan";
import {
	baseViewId,
	type Captured,
	MAX_SCREENS,
	numberedViewId,
	type Platform,
} from "../manifest";
import type { Scene, SceneView } from ".";

export type Standalone = { reason: string; views: string[] };

export type UnkeptScreen = { id: string; screen: string };

type DefinedView = { platform: Platform; view: SceneView };

const NUMBERED_SCREEN = /#(\d+)$/;

export const STANDALONE: Standalone[] = [
	{
		reason: "No view captures the location picker on desktop",
		views: [
			"command-center",
			"command-center/filter-grid",
			"command-center/filter-grid/apply",
			"command-center/filter-grid/errors",
			"command-center/open-profile",
			"command-center/quick-go-to",
			"command-center/set-location",
			"command-center/unknown",
			"feedback/storage/plain-file",
		],
	},
	{
		reason: "No view captures a profile on desktop",
		views: ["profile/refresh-failed"],
	},
];

function standaloneViews(standalone: Standalone[]): Set<string> {
	return new Set(standalone.flatMap(({ views }) => views));
}

const STANDALONE_VIEWS = standaloneViews(STANDALONE);

export function requireScreen({
	view,
	keys,
}: {
	view: SceneView;
	keys: ShownKey[];
}): void {
	if (view.screen !== undefined || STANDALONE_VIEWS.has(view.id)) return;
	const top = keys.filter(({ top }) => top).map(({ key }) => key);
	if (top.length > 0) {
		throw new Error(
			`Shows ${top.join(", ")} in an overlay but names no screen under it and is not standalone`,
		);
	}
}

function numberedScreenProblem({
	screen,
	view,
}: {
	screen: string;
	view: SceneView;
}): string | null {
	const number = NUMBERED_SCREEN.exec(screen)?.[1];
	if (number === undefined) return null;
	const kept = Number(number);
	if (
		kept < 2 ||
		kept > MAX_SCREENS ||
		numberedViewId({ id: view.id, screen: kept }) !== screen
	) {
		return `names ${screen}, which no run numbers that way`;
	}
	return view.scroller === undefined
		? `names ${screen}, but ${view.id} has no scroller`
		: null;
}

function screenProblem({
	id,
	screen,
	platform,
	defined,
}: {
	id: string;
	screen: string;
	platform: Platform;
	defined: Map<string, DefinedView>;
}): string | null {
	const target = defined.get(baseViewId(screen));
	if (target === undefined) return `names ${screen}, which no scene defines`;
	if (target.view.id === id) return "names itself";
	if (target.platform !== platform) {
		return `names ${screen}, which is captured on ${target.platform}`;
	}
	if (target.view.screen !== undefined) {
		return `names ${screen}, which has a screen of its own`;
	}
	return numberedScreenProblem({ screen, view: target.view });
}

export function screenProblems({
	scenes,
	standalone,
}: {
	scenes: Scene[];
	standalone: Standalone[];
}): string[] {
	const defined = new Map<string, DefinedView>(
		scenes.flatMap(({ platform, views }) =>
			views.map((view): [string, DefinedView] => [
				view.id,
				{ platform, view },
			]),
		),
	);
	const named = scenes.flatMap(({ platform, views }) =>
		views.flatMap(({ id, screen }) => {
			if (screen === undefined) return [];
			const problem = screenProblem({ id, screen, platform, defined });
			return problem === null ? [] : [`${id}: ${problem}`];
		}),
	);
	const unnamed = [...standaloneViews(standalone)].flatMap((id) => {
		const view = defined.get(id)?.view;
		if (view === undefined) return [`${id}: standalone, but undefined`];
		return view.screen === undefined
			? []
			: [`${id}: standalone, but names ${view.screen}`];
	});
	return [...named, ...unnamed];
}

export function unkeptScreens(views: Captured["views"]): UnkeptScreen[] {
	const unkept = new Map<string, string>();
	for (const [viewId, { screen }] of Object.entries(views)) {
		if (screen === undefined || screen in views) continue;
		if (baseViewId(screen) in views) unkept.set(baseViewId(viewId), screen);
	}
	return [...unkept].map(([id, screen]) => ({ id, screen }));
}
