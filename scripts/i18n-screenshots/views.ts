import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { installTauriShim } from "../../e2e/support/app";
import { freezeClockOnEveryLoad } from "../store-screenshots/clock";
import { displays, type PlatformContext } from "./browser";
import { encodeView } from "./encode";
import {
	type Captured,
	emptyCapture,
	imagePath,
	numberedViewId,
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

type Session = { page: Page; uncaught: string[]; viewId: string };

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
	const { webp, sha256, pixelHash, width, height } = await encodeView(png);
	const image = imagePath(id);
	await Bun.write(join(outDir, image), webp);
	const ms = elapsedSince(startedAt);
	captured.views[id] = {
		image,
		sha256,
		pixelHash,
		platform: platformContext.platform,
		keys: scan.keys,
		ms,
	};
	captured.unmarked[id] = scan.unmarked;
	console.log(
		`${id}: ${scan.keys.length} keys in ${ms} ms (encoded in ${elapsedSince(encodeStartedAt)} ms), ${width}x${height}, ${webp.byteLength} bytes`,
	);
}

async function dropScreens({
	run: { captured, outDir },
	id,
}: {
	run: ViewRun;
	id: string;
}): Promise<void> {
	for (const viewId of Object.keys(captured.views)) {
		if (viewId !== id && !viewId.startsWith(`${id}#`)) continue;
		await rm(join(outDir, imagePath(viewId)), { force: true });
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
				await dropScreens({ run, id: view.id });
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
