import type { KeyBox, ShownKey } from "../../src/lib/demo/screenshot-scan";

export type Platform = "phone" | "desktop";

export type Highlight = { image: string; sha256: string; pixelHash: string };

export type ViewKey = ShownKey & { highlight?: Highlight };

export type View = {
	image: string;
	sha256: string;
	pixelHash: string;
	platform: Platform;
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
};

export const RAW_DIR = ".raw";

const VIEW_ID = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const MESSAGE_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;

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
	return { views: {}, failed: [], unmarked: {}, boxes: {} };
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
	};
}
