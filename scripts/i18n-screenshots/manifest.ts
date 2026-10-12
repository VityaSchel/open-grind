import type { ShownKey } from "../../src/lib/demo/screenshot-scan";

export type Platform = "phone" | "desktop";

export type View = {
	image: string;
	sha256: string;
	pixelHash: string;
	platform: Platform;
	keys: ShownKey[];
	ms: number;
};

export type Manifest = {
	commit: string;
	views: Record<string, View>;
	failed: string[];
};

export type Captured = Omit<Manifest, "commit"> & {
	unmarked: Record<string, string[]>;
};

const VIEW_ID = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

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

export function imagePath(viewId: string): string {
	return `images/${viewId.replace("#", ".")}.webp`;
}

export function emptyCapture(): Captured {
	return { views: {}, failed: [], unmarked: {} };
}

export function mergeCaptures(captures: Captured[]): Captured {
	return {
		views: Object.assign({}, ...captures.map(({ views }) => views)),
		failed: captures.flatMap(({ failed }) => failed),
		unmarked: Object.assign(
			{},
			...captures.map(({ unmarked }) => unmarked),
		),
	};
}
