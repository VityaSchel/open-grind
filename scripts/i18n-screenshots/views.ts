import type { BrowserContext, Locator, Page } from "@playwright/test";
import { join } from "node:path";

import { installEventInjection, installTauriShim } from "../../e2e/support/app";
import { freezeClockOnEveryLoad } from "../store-screenshots/clock";
import { displays, type PlatformContext } from "./browser";
import { decodeCapture, encodeView } from "./encode";
import {
	type Captured,
	emptyCapture,
	imagePath,
	MAX_SCREENS,
	numberedViewId,
} from "./manifest";
import {
	captureFrame,
	type Frame,
	MARKER_LOCALE,
	matchSourceLayout,
	recordSourceLayout,
	SOURCE_LOCALE,
	switchLocale,
	viewState,
	waitForLocale,
} from "./scan";
import type { Scene, SceneView } from "./scenes";
import { requireScreen } from "./scenes/overlays";
import { dropScreens, keepRawCapture } from "./screens";
import { settle } from "./settle";
import {
	installNativeStubs,
	installNeutralGeolocation,
	pinNavigatorPlatform,
	seedScene,
} from "./stubs";

const SCREEN_STEP = 0.85;
const PARKED_POINTER = { x: -1, y: -1 };

type Session = { page: Page; uncaught: string[]; viewId: string };

type ViewRun = {
	platformContext: PlatformContext;
	scene: Scene;
	outDir: string;
	captured: Captured;
	strayRejections: string[];
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
	const platform = scene.shim ?? displays[scene.platform].shimPlatform;
	await installTauriShim(page, { platform });
	await pinNavigatorPlatform({ page, platform });
	await installEventInjection(page);
	await installNativeStubs({ page, overrides: scene.native });
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
	platformContext: { origin, guard },
	locale,
}: {
	page: Page;
	platformContext: PlatformContext;
	locale: string;
}): Promise<() => void> {
	let redirecting = true;
	await page.route(
		(url) => url.origin === origin && !url.searchParams.has("locale"),
		guard.catching(async (route) => {
			const request = route.request();
			if (!redirecting || !request.isNavigationRequest()) {
				await route.fallback();
				return;
			}
			const url = new URL(request.url());
			url.searchParams.set("locale", locale);
			await route.fulfill({
				status: 302,
				headers: { location: url.href },
			});
		}),
	);
	return () => {
		redirecting = false;
	};
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
			platformContext,
			locale: MARKER_LOCALE,
		});
		for (const view of scene.views.slice(0, index + 1)) {
			await view.drive(replay.page);
		}
		await parkPointer(replay.page);
		stopLoadingMarked();
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
		await recordSourceLayout(session.page);
		const before = await viewState(session.page);
		await switchLocale({ page: session.page, locale: MARKER_LOCALE });
		if ((await viewState(session.page)) === before) {
			if (!(await matchSourceLayout(session.page))) {
				console.log(
					`${view.id}: the language moved its text, so it gets no wraps or clipped`,
				);
			}
			return session;
		}
		console.log(
			`${view.id}: the view changed with the language, replaying it in ${MARKER_LOCALE}`,
		);
	}
	return replayMarked({ run, session, index });
}

async function requireNothingBlocked({
	platformContext,
	strayRejections,
}: ViewRun): Promise<void> {
	const blocked = await platformContext.guard.takeBlocked();
	if (blocked.length > 0) {
		throw new Error(`Requests left localhost: ${blocked.join(", ")}`);
	}
	const unanswered = platformContext.guard.takeRouteErrors();
	if (unanswered.length > 0) {
		throw new Error(`Requests went unanswered: ${unanswered.join("; ")}`);
	}
	const stray = strayRejections.splice(0);
	if (stray.length > 0) {
		throw new Error(`Unhandled rejections: ${stray.join("; ")}`);
	}
	const unlicensed = await platformContext.guard.takeUnlicensed();
	if (unlicensed.length > 0) {
		throw new Error(`Served unlicensed assets: ${unlicensed.join(", ")}`);
	}
}

async function requireCleanFrame({
	frame,
	session,
	run,
}: {
	frame: Frame;
	session: Session;
	run: ViewRun;
}): Promise<void> {
	await requireNothingBlocked(run);
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
	screen,
	frame: { png, scan },
	startedAt,
}: {
	run: ViewRun;
	id: string;
	screen: string | undefined;
	frame: Frame;
	startedAt: number;
}): Promise<void> {
	const encodeStartedAt = performance.now();
	const pixels = await decodeCapture(png);
	const view = await encodeView(pixels);
	const encodeMs = elapsedSince(encodeStartedAt);
	const image = imagePath(id);
	await Bun.write(join(outDir, image), view.webp);
	await keepRawCapture({ outDir, viewId: id, png });
	const ms = elapsedSince(startedAt);
	captured.views[id] = {
		image,
		sha256: view.sha256,
		pixelHash: view.pixelHash,
		platform: platformContext.platform,
		screen,
		keys: scan.keys.map(({ boxes: _boxes, ...shown }) => shown),
		ms,
	};
	captured.unmarked[id] = scan.unmarked;
	if (scan.measured) captured.measured.push(id);
	captured.compositeButtons[id] = scan.compositeButtons;
	captured.boxes[id] = Object.fromEntries(
		scan.keys.map(({ key, boxes }) => [key, boxes]),
	);
	console.log(
		`${id}: ${scan.keys.length} keys in ${ms} ms (encoded in ${encodeMs} ms), ${pixels.width}x${pixels.height}, ${view.webp.byteLength} bytes`,
	);
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
		await requireCleanFrame({ frame, session, run });
		requireScreen({ view, keys: frame.scan.keys });
		const keys = frame.scan.keys.map(({ key }) => key);
		if (kept === 0 || keys.some((key) => !seen.has(key))) {
			kept += 1;
			const id = numberedViewId({ id: view.id, screen: kept });
			await recordScreen({
				run,
				id,
				screen: view.screen,
				frame,
				startedAt: screenStartedAt,
			});
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
	await requireNothingBlocked(run);
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
	const strayRejections: string[] = [];
	const recordStray = (reason: unknown) => {
		strayRejections.push(String(reason));
	};
	const run: ViewRun = {
		platformContext,
		scene,
		outDir,
		captured,
		strayRejections,
	};
	let session = await openSession({
		context: platformContext.context,
		scene,
		viewId: scene.views[0].id,
	});
	process.on("unhandledRejection", recordStray);
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
		process.off("unhandledRejection", recordStray);
	}
	return captured;
}
