import { createHash } from "node:crypto";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { KeySource, ShownKey } from "../../src/lib/demo/screenshot-scan";
import {
	type Captured,
	emptyCapture,
	imagePath,
	RAW_DIR,
	rawCapturePath,
} from "./manifest";
import { keepRawCapture, writeHighlightedCopies } from "./screens";

const KEY = "settings.title";
const SIZE = 32;
const BOX = { x: 8, y: 8, width: 12, height: 6 };

function shown({
	key = KEY,
	via = "text",
	top = false,
}: {
	key?: string;
	via?: KeySource;
	top?: boolean;
}): ShownKey {
	return { key, box: BOX, via, top };
}

const SCREENS: Record<string, ShownKey[]> = {
	alpha: [shown({}), shown({ key: "common.save" })],
	"beta#2": [shown({ top: true })],
	beta: [shown({ key: "common.cancel" })],
	gamma: [shown({ via: "attribute" })],
	delta: [shown({ via: "attribute", top: true })],
	epsilon: [
		shown({}),
		shown({ key: "settings.one" }),
		shown({ key: "settings.two" }),
	],
};

let outDir: string;

function exists(path: string): Promise<boolean> {
	return access(join(outDir, path)).then(
		() => true,
		() => false,
	);
}

async function capturedScreens(): Promise<Captured> {
	const png = await sharp({
		create: {
			width: SIZE,
			height: SIZE,
			channels: 4,
			background: { r: 90, g: 120, b: 150, alpha: 1 },
		},
	})
		.png()
		.toBuffer();
	const captured = emptyCapture();
	for (const [viewId, keys] of Object.entries(SCREENS)) {
		await keepRawCapture({ outDir, viewId, png });
		const image = imagePath(viewId);
		await mkdir(dirname(join(outDir, image)), { recursive: true });
		await writeFile(join(outDir, image), "plain");
		captured.views[viewId] = {
			image,
			sha256: "plain",
			pixelHash: "plain",
			platform: "phone",
			keys: keys.map((key) => ({ ...key })),
			ms: 1,
		};
		captured.unmarked[viewId] = [];
		captured.boxes[viewId] = Object.fromEntries(
			keys.map(({ key }) => [key, [BOX]]),
		);
	}
	return captured;
}

function highlightedViews({
	captured,
	key,
}: {
	captured: Captured;
	key: string;
}): string[] {
	return Object.entries(captured.views)
		.filter(([, view]) =>
			view.keys.some((shown) => shown.key === key && shown.highlight),
		)
		.map(([viewId]) => viewId)
		.sort();
}

beforeEach(async () => {
	outDir = await mkdtemp(join(tmpdir(), "i18n-screens-"));
});

afterEach(async () => {
	vi.restoreAllMocks();
	await rm(outDir, { recursive: true, force: true });
});

describe("the manifest", () => {
	it("gives a key a highlight in its top 3 views only", async () => {
		const captured = await capturedScreens();
		const copies = await writeHighlightedCopies({ captured, outDir });
		expect(highlightedViews({ captured, key: KEY })).toEqual([
			"alpha",
			"beta#2",
			"delta",
		]);
		for (const key of [
			"common.save",
			"common.cancel",
			"settings.one",
			"settings.two",
		]) {
			expect(highlightedViews({ captured, key })).toHaveLength(1);
		}
		expect(copies.count).toBe(7);
		expect(captured.failed).toEqual([]);
	});

	it("keeps every view's plain image and every key entry", async () => {
		const captured = await capturedScreens();
		await writeHighlightedCopies({ captured, outDir });
		expect(Object.keys(captured.views).sort()).toEqual(
			Object.keys(SCREENS).sort(),
		);
		for (const [viewId, keys] of Object.entries(SCREENS)) {
			const view = captured.views[viewId];
			expect(view?.keys.map(({ key }) => key)).toEqual(
				keys.map(({ key }) => key),
			);
			expect(await exists(imagePath(viewId))).toBe(true);
		}
		expect(captured.views.gamma?.keys[0]).toEqual(
			shown({ via: "attribute" }),
		);
	});

	it("writes each highlight where it points and drops the raw captures", async () => {
		const captured = await capturedScreens();
		const copies = await writeHighlightedCopies({ captured, outDir });
		let bytes = 0;
		for (const view of Object.values(captured.views)) {
			for (const { highlight } of view.keys) {
				if (!highlight) continue;
				const webp = await readFile(join(outDir, highlight.image));
				bytes += webp.byteLength;
				expect(createHash("sha256").update(webp).digest("hex")).toBe(
					highlight.sha256,
				);
			}
		}
		expect(copies.bytes).toBe(bytes);
		expect(await exists("images/epsilon/settings.title.webp")).toBe(false);
		expect(await exists("images/gamma")).toBe(false);
		expect(await exists(RAW_DIR)).toBe(false);
	});

	it("fails a view it cannot highlight and promotes the next view", async () => {
		const failures = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const captured = await capturedScreens();
		await rm(join(outDir, rawCapturePath("beta#2")));
		await writeHighlightedCopies({ captured, outDir });
		expect(captured.failed).toEqual(["beta"]);
		expect(failures).toHaveBeenCalledWith(
			expect.stringMatching(/^beta#2: failed: /),
		);
		expect(Object.keys(captured.views).sort()).toEqual([
			"alpha",
			"delta",
			"epsilon",
			"gamma",
		]);
		expect(highlightedViews({ captured, key: KEY })).toEqual([
			"alpha",
			"delta",
			"epsilon",
		]);
		expect(await exists(imagePath("beta"))).toBe(false);
		expect(await exists("images/beta")).toBe(false);
		expect(await exists(RAW_DIR)).toBe(false);
	});
});
