import {
	type Browser,
	type BrowserContext,
	chromium,
	devices,
	type Page,
} from "@playwright/test";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { installTauriShim } from "../../e2e/support/app";
import playwrightConfig from "../../playwright.config";
import { freezeClockOnEveryLoad } from "../store-screenshots/clock";
import { encodeView } from "./encode";
import { serveSeededImages } from "./images";
import { guardNetwork, type NetworkGuard } from "./network";
import { type Platform, type Scene, scenes } from "./scenes";
import { BUILD_DIR, serveBuild, SERVER_PORT, waitUntilServing } from "./serve";
import { settle } from "./settle";
import {
	installNativeStubs,
	installNeutralGeolocation,
	seedScene,
} from "./stubs";

const REPO_ROOT = Bun.fileURLToPath(new URL("../..", import.meta.url));
const OUT_DIR = join(REPO_ROOT, "i18n-screenshots");
const BUILD_ENV = {
	OPEN_GRIND_DEMO: "1",
	OPEN_GRIND_SCREENSHOTS: "1",
	PUBLIC_BACKDROP_BLUR: "max",
};
const TEST_ONLY_ENV = ["PUBLIC_TEST_INSETS"];
const SCENE_TIMEOUT_MS = 30_000;
const GPU_COMPOSITING_ON_SWIFTSHADER = "--use-angle=swiftshader";
const RASTER_EVERY_TILE_BEFORE_DRAW = "--run-all-compositor-stages-before-draw";
const VIEW_ID = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:#[1-9][0-9]*)?$/;

const displays = {
	phone: {
		viewport: { width: 420, height: 800 },
		deviceScaleFactor: 2,
		shimPlatform: "android",
	},
	desktop: {
		viewport: { width: 1280, height: 800 },
		deviceScaleFactor: 1.5,
		shimPlatform: "macos",
	},
} satisfies Record<Platform, unknown>;

type ViewKey = {
	key: string;
	box: { x: number; y: number; width: number; height: number };
	via: "text" | "attribute";
	top: boolean;
};

type View = {
	image: string;
	sha256: string;
	pixelHash: string;
	platform: Platform;
	keys: ViewKey[];
	ms: number;
};

type Manifest = {
	commit: string;
	views: Record<string, View>;
	failed: string[];
};

type PlatformContext = { context: BrowserContext; guard: NetworkGuard };

function elapsedSince(startedAt: number): number {
	return Math.round(performance.now() - startedAt);
}

async function buildScreenshotBundle(): Promise<void> {
	const inherited = Object.entries(Bun.env).filter(
		([name]) => !TEST_ONLY_ENV.includes(name),
	);
	const build = Bun.spawn(["bunx", "vite", "build"], {
		cwd: REPO_ROOT,
		env: { ...Object.fromEntries(inherited), ...BUILD_ENV },
		stdout: "ignore",
		stderr: "inherit",
	});
	const exitCode = await build.exited;
	if (exitCode !== 0) throw new Error(`vite build exited with ${exitCode}`);
}

async function requireScreenshotBuild(root: string): Promise<void> {
	const { env } = (await import(join(root, "_app", "env.js"))) as {
		env: Record<string, string>;
	};
	if (env.PUBLIC_BACKDROP_BLUR !== BUILD_ENV.PUBLIC_BACKDROP_BLUR) {
		throw new Error(`${root} was built without full backdrop blur`);
	}
	const testOnly = TEST_ONLY_ENV.filter((name) => name in env);
	if (testOnly.length > 0) {
		throw new Error(`${root} was built with ${testOnly.join(", ")}`);
	}
}

async function requireGpuCompositing(browser: Browser): Promise<void> {
	const session = await browser.newBrowserCDPSession();
	const { gpu } = await session.send("SystemInfo.getInfo");
	await session.detach();
	const compositing = gpu.featureStatus?.gpu_compositing;
	if (compositing !== "enabled") {
		throw new Error(
			`Chromium composites in software (gpu_compositing: ${compositing}), which leaves backdrop blurs partly or wholly unblurred above a device scale factor of 1`,
		);
	}
}

async function launchBrowser(): Promise<Browser> {
	const launchOptions = playwrightConfig.use?.launchOptions;
	const browser = await chromium.launch({
		...launchOptions,
		args: [
			...(launchOptions?.args ?? []),
			GPU_COMPOSITING_ON_SWIFTSHADER,
			RASTER_EVERY_TILE_BEFORE_DRAW,
		],
	});
	try {
		await requireGpuCompositing(browser);
	} catch (error) {
		await browser.close();
		throw error;
	}
	return browser;
}

async function openPlatformContext({
	browser,
	platform,
	origin,
}: {
	browser: Browser;
	platform: Platform;
	origin: string;
}): Promise<PlatformContext> {
	const { viewport, deviceScaleFactor } = displays[platform];
	const context = await browser.newContext({
		...devices["Desktop Chrome"],
		baseURL: origin,
		viewport,
		deviceScaleFactor,
		hasTouch: true,
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "dark",
		reducedMotion: "reduce",
		serviceWorkers: "block",
	});
	context.setDefaultTimeout(SCENE_TIMEOUT_MS);
	const guard = await guardNetwork({ context, origin });
	await serveSeededImages(context);
	return { context, guard };
}

async function openScene({
	page,
	scene,
}: {
	page: Page;
	scene: Scene;
}): Promise<void> {
	await installTauriShim(page, {
		platform: displays[scene.platform].shimPlatform,
	});
	await installNativeStubs(page);
	await installNeutralGeolocation(page);
	if (scene.demo) await seedScene({ page, scene: scene.demo });
	await freezeClockOnEveryLoad(page);
	await scene.open(page);
	const hooked = await page.evaluate(
		() => window.__openGrindScreenshots !== undefined,
	);
	if (!hooked) throw new Error("The build installed no screenshot hooks");
	await settle({ page });
}

async function captureScene({
	platformContext: { context, guard },
	scene,
	outDir,
}: {
	platformContext: PlatformContext;
	scene: Scene;
	outDir: string;
}): Promise<View> {
	const startedAt = performance.now();
	guard.takeBlocked();
	const page = await context.newPage();
	const uncaught: string[] = [];
	page.on("pageerror", (error) => uncaught.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") {
			console.warn(`${scene.id}: console error: ${message.text()}`);
		}
	});
	try {
		await openScene({ page, scene });
		const openedMs = elapsedSince(startedAt);
		const png = await page.screenshot({ animations: "disabled" });
		const blocked = guard.takeBlocked();
		if (blocked.length > 0) {
			throw new Error(`Requests left localhost: ${blocked.join(", ")}`);
		}
		if (uncaught.length > 0) {
			throw new Error(`Uncaught errors: ${uncaught.join("; ")}`);
		}
		const encodeStartedAt = performance.now();
		const { webp, sha256, pixelHash, width, height } =
			await encodeView(png);
		const image = `images/${scene.id}.webp`;
		await Bun.write(join(outDir, image), webp);
		const ms = elapsedSince(startedAt);
		console.log(
			`${scene.id}: ${ms} ms (opened and settled at ${openedMs} ms, encoded in ${elapsedSince(encodeStartedAt)} ms), ${width}x${height}, ${webp.byteLength} bytes`,
		);
		return {
			image,
			sha256,
			pixelHash,
			platform: scene.platform,
			keys: [],
			ms,
		};
	} finally {
		await page.close();
	}
}

async function captureScenes({
	selected,
	origin,
	outDir,
}: {
	selected: Scene[];
	origin: string;
	outDir: string;
}): Promise<Omit<Manifest, "commit">> {
	const launchStartedAt = performance.now();
	const browser = await launchBrowser();
	console.log(
		`Chromium launched with GPU compositing in ${elapsedSince(launchStartedAt)} ms`,
	);
	const platformContexts = new Map<Platform, PlatformContext>();
	const views: Record<string, View> = {};
	const failed: string[] = [];
	try {
		for (const scene of selected) {
			const platformContext =
				platformContexts.get(scene.platform) ??
				(await openPlatformContext({
					browser,
					platform: scene.platform,
					origin,
				}));
			platformContexts.set(scene.platform, platformContext);
			try {
				views[scene.id] = await captureScene({
					platformContext,
					scene,
					outDir,
				});
			} catch (error) {
				failed.push(scene.id);
				console.error(`${scene.id}: failed: ${String(error)}`);
			}
		}
	} finally {
		await browser.close();
	}
	return { views, failed };
}

function selectScenes(ids: string[] | undefined): Scene[] {
	const seen = new Set<string>();
	for (const { id } of scenes) {
		if (!VIEW_ID.test(id)) throw new Error(`Invalid view id ${id}`);
		if (seen.has(id)) throw new Error(`Duplicate view id ${id}`);
		seen.add(id);
	}
	if (!ids) return scenes;
	const unknown = ids.filter((id) => !seen.has(id));
	if (unknown.length > 0) {
		throw new Error(`Unknown scenes: ${unknown.join(", ")}`);
	}
	return scenes.filter(({ id }) => ids.includes(id));
}

const { values } = parseArgs({
	options: {
		"skip-build": { type: "boolean", default: false },
		out: { type: "string", default: OUT_DIR },
		port: { type: "string", default: String(SERVER_PORT) },
		scene: { type: "string", multiple: true },
	},
});
const selected = selectScenes(values.scene);
const outDir = resolve(values.out);

if (!values["skip-build"]) {
	const buildStartedAt = performance.now();
	await buildScreenshotBundle();
	console.log(`Built in ${elapsedSince(buildStartedAt)} ms`);
}
await requireScreenshotBuild(BUILD_DIR);

await rm(join(outDir, "images"), { recursive: true, force: true });
await rm(join(outDir, "manifest.json"), { force: true });

const serverStartedAt = performance.now();
const server = serveBuild({ port: Number(values.port) });
await waitUntilServing(server.origin);
console.log(
	`Serving ${BUILD_DIR} on ${server.origin} after ${elapsedSince(serverStartedAt)} ms`,
);

const captured = await captureScenes({
	selected,
	origin: server.origin,
	outDir,
}).finally(server.stop);
const commit = (await Bun.$`git rev-parse HEAD`.cwd(REPO_ROOT).text()).trim();
const manifest: Manifest = { commit, ...captured };
await Bun.write(
	join(outDir, "manifest.json"),
	`${JSON.stringify(manifest, null, "\t")}\n`,
);
console.log(
	`${Object.keys(manifest.views).length} views captured, ${manifest.failed.length} failed, written to ${outDir}`,
);
if (Object.keys(manifest.views).length === 0) process.exit(1);
