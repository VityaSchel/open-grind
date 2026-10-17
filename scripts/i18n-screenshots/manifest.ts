import type {
	KeyBox,
	ShownKey,
	ViewScan,
} from "../../src/lib/demo/screenshot-scan";

export type Platform = "phone" | "desktop";

export type Highlight = { image: string; sha256: string; pixelHash: string };

export const DOCUMENT_TITLE = "document-title";

export type TitleKey = { key: string; via: typeof DOCUMENT_TITLE; top: false };

export type PageKey = ShownKey & { highlight?: Highlight };

export type ViewKey = PageKey | TitleKey;

export type View = {
	image: string;
	sha256: string;
	pixelHash: string;
	platform: Platform;
	screen?: string;
	keys: ViewKey[];
	ms: number;
};

export type Manifest = {
	commit: string;
	views: Record<string, View>;
	failed: string[];
};

export type Captured = Omit<Manifest, "commit"> & {
	unmarked: Record<string, string[]>;
	boxes: Record<string, Record<string, KeyBox[]>>;
	measured: string[];
	compositeButtons: Record<string, string[][]>;
};

export const RAW_DIR = ".raw";
export const MAX_SCREENS = 6;

const VIEW_ID = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const MESSAGE_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;

export function byCodeUnits(a: string, b: string): number {
	if (a === b) return 0;
	return a < b ? -1 : 1;
}

export function requireViewId(id: string): void {
	if (!VIEW_ID.test(id)) throw new Error(`Invalid view id ${id}`);
}

export function numberedViewId({
	id,
	screen,
}: {
	id: string;
	screen: number;
}): string {
	return screen === 1 ? id : `${id}#${screen}`;
}

export function baseViewId(viewId: string): string {
	return viewId.replace(/#\d+$/, "");
}

export function onPage<Key extends { via: string }>(
	shown: Key,
): shown is Exclude<Key, TitleKey> {
	return shown.via !== DOCUMENT_TITLE;
}

export function viewKeys({
	scan: { keys, titleKeys },
	viewId,
	screen,
}: {
	scan: ViewScan;
	viewId: string;
	screen: string | undefined;
}): ViewKey[] {
	const shown: ViewKey[] = keys.map(({ boxes: _boxes, ...key }) => key);
	if (screen !== undefined || baseViewId(viewId) !== viewId) return shown;
	const pageKeys = new Set(keys.map(({ key }) => key));
	const titled = titleKeys
		.filter((key) => !pageKeys.has(key))
		.map((key): TitleKey => ({ key, via: DOCUMENT_TITLE, top: false }));
	return [...shown, ...titled].sort((a, b) => byCodeUnits(a.key, b.key));
}

export function isScreenOf({
	viewId,
	id,
}: {
	viewId: string;
	id: string;
}): boolean {
	return viewId === id || viewId.startsWith(`${id}#`);
}

function fileStem(viewId: string): string {
	return viewId.replace("#", ".");
}

export function screenPath(viewId: string): string {
	return `images/${fileStem(viewId)}`;
}

export function imagePath(viewId: string): string {
	return `${screenPath(viewId)}.webp`;
}

export function rawCapturePath(viewId: string): string {
	return `${RAW_DIR}/${fileStem(viewId)}.png`;
}

export function highlightPath({
	viewId,
	key,
}: {
	viewId: string;
	key: string;
}): string {
	if (!MESSAGE_KEY.test(key)) throw new Error(`Invalid message key ${key}`);
	return `${screenPath(viewId)}/${key}.webp`;
}

export function emptyCapture(): Captured {
	return {
		views: {},
		failed: [],
		unmarked: {},
		boxes: {},
		measured: [],
		compositeButtons: {},
	};
}

export function mergeCaptures(captures: Captured[]): Captured {
	return {
		views: Object.assign({}, ...captures.map(({ views }) => views)),
		failed: captures.flatMap(({ failed }) => failed),
		unmarked: Object.assign(
			{},
			...captures.map(({ unmarked }) => unmarked),
		),
		boxes: Object.assign({}, ...captures.map(({ boxes }) => boxes)),
		measured: captures.flatMap(({ measured }) => measured),
		compositeButtons: Object.assign(
			{},
			...captures.map(({ compositeButtons }) => compositeButtons),
		),
	};
}
