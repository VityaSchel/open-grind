import {
	mkdir,
	readdir,
	readFile,
	rm,
	rmdir,
	stat,
	writeFile,
} from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";

import { decodeCapture, encodeView } from "./encode";
import { drawHighlight } from "./highlight";
import {
	baseViewId,
	type Captured,
	highlightPath,
	imagePath,
	isScreenOf,
	RAW_DIR,
	rawCapturePath,
	screenPath,
	type ViewKey,
} from "./manifest";
import { chooseHighlights } from "./ranking";

const HIGHLIGHT_CONCURRENCY = availableParallelism();

type HighlightedCopies = { count: number; bytes: number };

type PendingScreen = { viewId: string; pending: ViewKey[] };

async function writeInside({
	outDir,
	path,
	data,
}: {
	outDir: string;
	path: string;
	data: Buffer;
}): Promise<void> {
	const file = join(outDir, path);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, data);
}

export function keepRawCapture({
	outDir,
	viewId,
	png,
}: {
	outDir: string;
	viewId: string;
	png: Buffer;
}): Promise<void> {
	return writeInside({ outDir, path: rawCapturePath(viewId), data: png });
}

async function removeIfEmpty(directory: string): Promise<void> {
	const entries = await readdir(directory).catch(() => null);
	if (entries?.length === 0) await rmdir(directory);
}

export async function dropScreens({
	captured,
	outDir,
	id,
}: {
	captured: Captured;
	outDir: string;
	id: string;
}): Promise<void> {
	for (const [viewId, view] of Object.entries(captured.views)) {
		if (!isScreenOf({ viewId, id })) continue;
		const files = [
			...view.keys.flatMap(({ highlight }) =>
				highlight ? [highlight.image] : [],
			),
			imagePath(viewId),
			rawCapturePath(viewId),
		];
		for (const file of files) {
			await rm(join(outDir, file), { force: true });
		}
		await removeIfEmpty(join(outDir, screenPath(viewId)));
		delete captured.views[viewId];
		delete captured.unmarked[viewId];
		delete captured.boxes[viewId];
	}
}

async function highlightScreen({
	captured,
	outDir,
	screen: { viewId, pending },
}: {
	captured: Captured;
	outDir: string;
	screen: PendingScreen;
}): Promise<void> {
	const pixels = await decodeCapture(
		await readFile(join(outDir, rawCapturePath(viewId))),
	);
	for (const shown of pending) {
		const boxes = captured.boxes[viewId]?.[shown.key];
		if (boxes === undefined) throw new Error(`No boxes for ${shown.key}`);
		const image = highlightPath({ viewId, key: shown.key });
		const { webp, sha256, pixelHash } = await encodeView(
			drawHighlight({ pixels, boxes, via: shown.via }),
		);
		await writeInside({ outDir, path: image, data: webp });
		shown.highlight = { image, sha256, pixelHash };
	}
}

function pendingScreens(captured: Captured): PendingScreen[] {
	return [...chooseHighlights(captured.views)].flatMap(([viewId, chosen]) => {
		const pending = (captured.views[viewId]?.keys ?? []).filter(
			({ key, highlight }) => chosen.has(key) && !highlight,
		);
		return pending.length > 0 ? [{ viewId, pending }] : [];
	});
}

async function dropOutrankedHighlights({
	captured,
	outDir,
}: {
	captured: Captured;
	outDir: string;
}): Promise<void> {
	const chosen = chooseHighlights(captured.views);
	for (const [viewId, view] of Object.entries(captured.views)) {
		let dropped = false;
		for (const shown of view.keys) {
			if (!shown.highlight || chosen.get(viewId)?.has(shown.key))
				continue;
			await rm(join(outDir, shown.highlight.image), { force: true });
			delete shown.highlight;
			dropped = true;
		}
		if (dropped) await removeIfEmpty(join(outDir, screenPath(viewId)));
	}
}

async function highlightInParallel({
	captured,
	outDir,
	screens,
}: {
	captured: Captured;
	outDir: string;
	screens: PendingScreen[];
}): Promise<Set<string>> {
	const failed = new Set<string>();
	const queue = [...screens];
	const work = async () => {
		for (let screen = queue.shift(); screen; screen = queue.shift()) {
			try {
				await highlightScreen({ captured, outDir, screen });
			} catch (error) {
				console.error(`${screen.viewId}: failed: ${String(error)}`);
				failed.add(baseViewId(screen.viewId));
			}
		}
	};
	await Promise.all(Array.from({ length: HIGHLIGHT_CONCURRENCY }, work));
	return failed;
}

async function countCopies({
	captured,
	outDir,
}: {
	captured: Captured;
	outDir: string;
}): Promise<HighlightedCopies> {
	const images = Object.values(captured.views).flatMap(({ keys }) =>
		keys.flatMap(({ highlight }) => (highlight ? [highlight.image] : [])),
	);
	const sizes = await Promise.all(
		images.map(async (image) => (await stat(join(outDir, image))).size),
	);
	return {
		count: images.length,
		bytes: sizes.reduce((total, size) => total + size, 0),
	};
}

export async function removeRawCaptures(outDir: string): Promise<void> {
	await rm(join(outDir, RAW_DIR), { recursive: true, force: true });
}

export async function writeHighlightedCopies({
	captured,
	outDir,
}: {
	captured: Captured;
	outDir: string;
}): Promise<HighlightedCopies> {
	try {
		for (
			let screens = pendingScreens(captured);
			screens.length > 0;
			screens = pendingScreens(captured)
		) {
			const failed = await highlightInParallel({
				captured,
				outDir,
				screens,
			});
			for (const id of failed) {
				await dropScreens({ captured, outDir, id });
				captured.failed.push(id);
			}
			await dropOutrankedHighlights({ captured, outDir });
		}
	} finally {
		await removeRawCaptures(outDir);
	}
	return countCopies({ captured, outDir });
}
