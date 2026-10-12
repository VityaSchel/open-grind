import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { readdir, rm, rmdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";

import { installTauriShim } from "../../e2e/support/app";
import type { ScannedKey } from "../../src/lib/demo/screenshot-scan";
import { freezeClockOnEveryLoad } from "../store-screenshots/clock";
import { displays, type PlatformContext } from "./browser";
import { decodeCapture, encodeView, type Pixels } from "./encode";
import { drawHighlight } from "./highlight";
import {
	type Captured,
	emptyCapture,
	highlightPath,
	imagePath,
	isScreenOf,
	numberedViewId,
	screenPath,
	type ViewKey,
} from "./manifest";
import {
	captureFrame,
	type Frame,
	MARKER_LOCALE,
	SOURCE_LOCALE,
	switchLocale,
	viewState,
	waitForLocale,
} from "./scan";
import type { Scene, SceneView } from "./scenes";
import { settle } from "./settle";
import {
	installNativeStubs,
	installNeutralGeolocation,
	seedScene,
} from "./stubs";

const MAX_SCREENS = 6;
const SCREEN_STEP = 0.85;
const PARKED_POINTER = { x: -1, y: -1 };
const HIGHLIGHT_CONCURRENCY = availableParallelism();

type Session = { page: Page; uncaught: string[]; viewId: string };

type HighlightedKey = { key: ViewKey; webp: Buffer };

type ViewRun = {
	platformContext: PlatformContext;
	scene: Scene;
	outDir: string;
	captured: Captured;
};

export function elapsedSince(startedAt: number): number {
	return Math.round(performance.now() - startedAt);
}

async function openSession({
	context,
	scene,
	viewId,
}: {
	context: BrowserContext;
	scene: Scene;
	viewId: string;
}): Promise<Session> {
	const page = await context.newPage();
	const session: Session = { page, uncaught: [], viewId };
	page.on("pageerror", (error) => session.uncaught.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") {
			console.warn(`${session.viewId}: console error: ${message.text()}`);
		}
	});
	await installTauriShim(page, {
		platform: displays[scene.platform].shimPlatform,
	});
	await installNativeStubs(page);
	await installNeutralGeolocation(page);
	if (scene.demo) await seedScene({ page, scene: scene.demo });
	await freezeClockOnEveryLoad(page);
	return session;
}

async function parkPointer(page: Page): Promise<void> {
	await page.mouse.move(PARKED_POINTER.x, PARKED_POINTER.y);
}

async function requireHooks(page: Page): Promise<void> {
	const hooked = await page.evaluate(
		() => window.__openGrindScreenshots !== undefined,
	);
	if (!hooked) throw new Error("The build installed no screenshot hooks");
}

async function loadInLocale({
	page,
	origin,
	locale,
}: {
	page: Page;
	origin: string;
	locale: string;
}): Promise<() => Promise<void>> {
	const unlocalized = (url: URL) =>
		url.origin === origin && !url.searchParams.has("locale");
	const redirect = async (route: Route) => {
		if (!route.request().isNavigationRequest()) {
			await route.fallback();
			return;
		}
		const url = new URL(route.request().url());
		url.searchParams.set("locale", locale);
		await route.fulfill({ status: 302, headers: { location: url.href } });
	};
	await page.route(unlocalized, redirect);
	return () => page.unroute(unlocalized, redirect);
}

async function replayMarked({
	run: { platformContext, scene },
	session,
	index,
}: {
	run: ViewRun;
	session: Session;
	index: number;
}): Promise<Session> {
	await session.page.close();
	const replay = await openSession({
		context: platformContext.context,
		scene,
		viewId: session.viewId,
	});
	try {
		const stopLoadingMarked = await loadInLocale({
			page: replay.page,
			origin: platformContext.origin,
			locale: MARKER_LOCALE,
		});
		for (const view of scene.views.slice(0, index + 1)) {
			await view.drive(replay.page);
		}
		await parkPointer(replay.page);
		await stopLoadingMarked();
		await waitForLocale({ page: replay.page, locale: MARKER_LOCALE });
		await settle({ page: replay.page });
		return replay;
	} catch (error) {
		await replay.page.close();
		throw error;
	}
}

async function reachMarkedView({
	run,
	session,
	index,
}: {
	run: ViewRun;
	session: Session;
	index: number;
}): Promise<Session> {
	const view = run.scene.views[index];
	if (view === undefined) throw new RangeError(`No view ${index}`);
	await view.drive(session.page);
	await parkPointer(session.page);
	await requireHooks(session.page);
	await settle({ page: session.page });
	if (view.survivesLocaleSwitch !== false) {
		const before = await viewState(session.page);
		await switchLocale({ page: session.page, locale: MARKER_LOCALE });
		if ((await viewState(session.page)) === before) return session;
		console.log(
			`${view.id}: the view changed with the language, replaying it in ${MARKER_LOCALE}`,
		);
	}
	return replayMarked({ run, session, index });
}

function requireNothingBlocked(platformContext: PlatformContext): void {
	const blocked = platformContext.guard.takeBlocked();
	if (blocked.length > 0) {
		throw new Error(`Requests left localhost: ${blocked.join(", ")}`);
	}
}

function requireCleanFrame({
	frame,
	session,
	platformContext,
}: {
	frame: Frame;
	session: Session;
	platformContext: PlatformContext;
}): void {
	requireNothingBlocked(platformContext);
	const uncaught = session.uncaught.splice(0);
	if (uncaught.length > 0) {
		throw new Error(`Uncaught errors: ${uncaught.join("; ")}`);
	}
	if (frame.scan.emoji.length > 0) {
		throw new Error(`Emoji show in ${frame.scan.emoji.join(", ")}`);
	}
}

async function highlightKey({
	id,
	pixels,
	shown: { key, box, boxes, via, top },
}: {
	id: string;
	pixels: Pixels;
	shown: ScannedKey;
}): Promise<HighlightedKey> {
	const image = highlightPath({ viewId: id, key });
	const { webp, sha256, pixelHash } = await encodeView(
		drawHighlight({ pixels, boxes, via }),
	);
	const highlight = { image, sha256, pixelHash };
	return { key: { key, box, via, top, highlight }, webp };
}

async function highlightKeys({
	id,
	pixels,
	keys,
}: {
	id: string;
	pixels: Pixels;
	keys: ScannedKey[];
}): Promise<HighlightedKey[]> {
	const highlighted: HighlightedKey[] = [];
	for (let start = 0; start < keys.length; start += HIGHLIGHT_CONCURRENCY) {
		const batch = keys.slice(start, start + HIGHLIGHT_CONCURRENCY);
		highlighted.push(
			...(await Promise.all(
				batch.map((shown) => highlightKey({ id, pixels, shown })),
			)),
		);
	}
	return highlighted;
}

async function recordScreen({
	run: { platformContext, outDir, captured },
	id,
	frame: { png, scan },
	startedAt,
}: {
	run: ViewRun;
	id: string;
	frame: Frame;
	startedAt: number;
}): Promise<void> {
	const encodeStartedAt = performance.now();
	const pixels = await decodeCapture(png);
	const view = await encodeView(pixels);
	const encodeMs = elapsedSince(encodeStartedAt);
	const highlightStartedAt = performance.now();
	const highlighted = await highlightKeys({ id, pixels, keys: scan.keys });
	const highlightMs = elapsedSince(highlightStartedAt);
	const image = imagePath(id);
	await Bun.write(join(outDir, image), view.webp);
	const ms = elapsedSince(startedAt) - highlightMs;
	captured.views[id] = {
		image,
		sha256: view.sha256,
		pixelHash: view.pixelHash,
		platform: platformContext.platform,
		keys: highlighted.map(({ key }) => key),
		ms,
	};
	captured.unmarked[id] = scan.unmarked;
	for (const { key, webp } of highlighted) {
		await Bun.write(join(outDir, key.highlight.image), webp);
	}
	const highlightBytes = highlighted.reduce(
		(total, { webp }) => total + webp.byteLength,
		0,
	);
	console.log(
		`${id}: ${scan.keys.length} keys in ${ms} ms (encoded in ${encodeMs} ms), ${pixels.width}x${pixels.height}, ${view.webp.byteLength} bytes; highlighted in ${highlightMs} ms, ${highlightBytes} bytes`,
	);
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
		const images = [
			...view.keys.map(({ highlight }) => highlight.image),
			imagePath(viewId),
		];
		for (const image of images) {
			await rm(join(outDir, image), { force: true });
		}
		await removeIfEmpty(join(outDir, screenPath(viewId)));
		delete captured.views[viewId];
		delete captured.unmarked[viewId];
	}
}

function scrollTopOf(scroller: Locator): Promise<number> {
	return scroller.evaluate((element) => element.scrollTop);
}

function scrollTo({
	scroller,
	top,
}: {
	scroller: Locator;
	top: number;
}): Promise<number> {
	return scroller.evaluate((element, target) => {
		element.scrollTo({ top: target, behavior: "instant" });
		return element.scrollTop;
	}, top);
}

async function nextScreen(scroller: Locator): Promise<boolean> {
	const { scrollTop, clientHeight } = await scroller.evaluate(
		({ scrollTop, clientHeight }) => ({ scrollTop, clientHeight }),
	);
	const top = scrollTop + clientHeight * SCREEN_STEP;
	return (await scrollTo({ scroller, top })) > scrollTop;
}

async function captureScreens({
	run,
	session,
	view,
	startedAt,
}: {
	run: ViewRun;
	session: Session;
	view: SceneView;
	startedAt: number;
}): Promise<void> {
	const { page } = session;
	const scroller = view.scroller ? page.locator(view.scroller).first() : null;
	const top = scroller ? await scrollTopOf(scroller) : 0;
	const seen = new Set<string>();
	let screenStartedAt = startedAt;
	let kept = 0;
	for (let screen = 1; screen <= MAX_SCREENS; screen += 1) {
		const frame = await captureFrame(page);
		requireCleanFrame({
			frame,
			session,
			platformContext: run.platformContext,
		});
		const keys = frame.scan.keys.map(({ key }) => key);
		if (kept === 0 || keys.some((key) => !seen.has(key))) {
			kept += 1;
			const id = numberedViewId({ id: view.id, screen: kept });
			await recordScreen({ run, id, frame, startedAt: screenStartedAt });
		}
		for (const key of keys) seen.add(key);
		screenStartedAt = performance.now();
		if (scroller === null || screen === MAX_SCREENS) break;
		if (!(await nextScreen(scroller))) break;
		await settle({ page });
	}
	if (scroller) {
		await scrollTo({ scroller, top });
		await settle({ page });
	}
	requireNothingBlocked(run.platformContext);
}

export async function captureScene({
	platformContext,
	scene,
	outDir,
}: {
	platformContext: PlatformContext;
	scene: Scene;
	outDir: string;
}): Promise<Captured> {
	const captured = emptyCapture();
	const run: ViewRun = { platformContext, scene, outDir, captured };
	let session = await openSession({
		context: platformContext.context,
		scene,
		viewId: scene.views[0].id,
	});
	try {
		for (const [index, view] of scene.views.entries()) {
			const startedAt = performance.now();
			session.viewId = view.id;
			try {
				if (index > 0) {
					await switchLocale({
						page: session.page,
						locale: SOURCE_LOCALE,
					});
				}
				session = await reachMarkedView({ run, session, index });
				await captureScreens({ run, session, view, startedAt });
			} catch (error) {
				await dropScreens({ captured, outDir, id: view.id });
				const ids = scene.views.slice(index).map(({ id }) => id);
				captured.failed.push(...ids);
				console.error(`${view.id}: failed: ${String(error)}`);
				if (ids.length > 1) {
					console.error(
						`${ids.slice(1).join(", ")}: not captured after ${view.id} failed`,
					);
				}
				break;
			}
		}
	} finally {
		await session.page.close();
	}
	return captured;
}
