import type { Browser } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { launchBrowser, openPlatformContext } from "./browser";
import { writeCoverage } from "./coverage";
import {
	type Captured,
	isScreenOf,
	type Manifest,
	mergeCaptures,
	requireViewId,
} from "./manifest";
import { type Scene, scenes } from "./scenes";
import { BUILD_DIR, serveBuild, SERVER_PORT, waitUntilServing } from "./serve";
import { captureScene, dropScreens, elapsedSince } from "./views";

const REPO_ROOT = Bun.fileURLToPath(new URL("../..", import.meta.url));
const OUT_DIR = join(REPO_ROOT, "i18n-screenshots");
const BUILD_ENV = {
	OPEN_GRIND_DEMO: "1",
	OPEN_GRIND_SCREENSHOTS: "1",
	PUBLIC_BACKDROP_BLUR: "max",
};
const TEST_ONLY_ENV = ["PUBLIC_TEST_INSETS"];
const OUTPUTS = ["images", "manifest.json", "coverage.json"];
const STEADY_VIEW = "settings/app";

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

async function captureScenes({
	browser,
	selected,
	origin,
	outDir,
}: {
	browser: Browser;
	selected: Scene[];
	origin: string;
	outDir: string;
}): Promise<Captured> {
	const captures: Captured[] = [];
	for (const scene of selected) {
		const platformContext = await openPlatformContext({
			browser,
			platform: scene.platform,
			origin,
		});
		try {
			captures.push(
				await captureScene({ platformContext, scene, outDir }),
			);
		} finally {
			await platformContext.context.close();
		}
	}
	return mergeCaptures(captures);
}

function screenHashes({
	captured,
	id,
}: {
	captured: Captured;
	id: string;
}): Map<string, string> {
	return new Map(
		Object.entries(captured.views)
			.filter(([viewId]) => isScreenOf({ viewId, id }))
			.map(([viewId, { pixelHash }]) => [viewId, pixelHash]),
	);
}

async function requireSteadyPixels({
	browser,
	origin,
	outDir,
	captured,
}: {
	browser: Browser;
	origin: string;
	outDir: string;
	captured: Captured;
}): Promise<void> {
	const scene = scenes.find(({ views }) =>
		views.some(({ id }) => id === STEADY_VIEW),
	);
	if (scene === undefined || !(STEADY_VIEW in captured.views)) return;
	console.log(`${STEADY_VIEW}: capturing it again to check its pixels`);
	const recaptureDir = await mkdtemp(join(tmpdir(), "i18n-screenshots-"));
	try {
		const first = screenHashes({ captured, id: STEADY_VIEW });
		const again = screenHashes({
			captured: await captureScenes({
				browser,
				selected: [scene],
				origin,
				outDir: recaptureDir,
			}),
			id: STEADY_VIEW,
		});
		const differing = [
			...new Set([...first.keys(), ...again.keys()]),
		].filter((viewId) => first.get(viewId) !== again.get(viewId));
		if (differing.length === 0) return;
		console.error(
			`${STEADY_VIEW}: failed: a second capture differs in ${differing.join(", ")}, so unchanged views can get new pixel hashes`,
		);
		await dropScreens({ captured, outDir, id: STEADY_VIEW });
		captured.failed.push(STEADY_VIEW);
	} finally {
		await rm(recaptureDir, { recursive: true, force: true });
	}
}

function selectScenes(ids: string[] | undefined): Scene[] {
	const seen = new Set<string>();
	for (const { id } of scenes.flatMap(({ views }) => views)) {
		requireViewId(id);
		if (seen.has(id)) throw new Error(`Duplicate view id ${id}`);
		seen.add(id);
	}
	if (!ids) return scenes;
	const unknown = ids.filter((id) => !seen.has(id));
	if (unknown.length > 0) {
		throw new Error(`Unknown views: ${unknown.join(", ")}`);
	}
	return scenes.filter(({ views }) =>
		views.some(({ id }) => ids.includes(id)),
	);
}

async function captureWithBrowser({
	selected,
	origin,
	outDir,
}: {
	selected: Scene[];
	origin: string;
	outDir: string;
}): Promise<Captured> {
	const launchStartedAt = performance.now();
	const browser = await launchBrowser();
	console.log(
		`Chromium launched with GPU compositing in ${elapsedSince(launchStartedAt)} ms`,
	);
	try {
		const captured = await captureScenes({
			browser,
			selected,
			origin,
			outDir,
		});
		await requireSteadyPixels({ browser, origin, outDir, captured });
		return captured;
	} finally {
		await browser.close();
	}
}

const { values } = parseArgs({
	options: {
		"skip-build": { type: "boolean", default: false },
		out: { type: "string", default: OUT_DIR },
		port: { type: "string", default: String(SERVER_PORT) },
		view: { type: "string", multiple: true },
	},
});
const selected = selectScenes(values.view);
const outDir = resolve(values.out);

if (!values["skip-build"]) {
	const buildStartedAt = performance.now();
	await buildScreenshotBundle();
	console.log(`Built in ${elapsedSince(buildStartedAt)} ms`);
}
await requireScreenshotBuild(BUILD_DIR);

for (const output of OUTPUTS) {
	await rm(join(outDir, output), { recursive: true, force: true });
}

const serverStartedAt = performance.now();
const server = serveBuild({ port: Number(values.port) });
await waitUntilServing(server.origin);
console.log(
	`Serving ${BUILD_DIR} on ${server.origin} after ${elapsedSince(serverStartedAt)} ms`,
);

const captureStartedAt = performance.now();
const captured = await captureWithBrowser({
	selected,
	origin: server.origin,
	outDir,
}).finally(server.stop);
const commit = (await Bun.$`git rev-parse HEAD`.cwd(REPO_ROOT).text()).trim();
const manifest: Manifest = {
	commit,
	views: captured.views,
	failed: captured.failed,
};
await Bun.write(
	join(outDir, "manifest.json"),
	`${JSON.stringify(manifest, null, "\t")}\n`,
);
console.log(
	`${Object.keys(manifest.views).length} views in ${elapsedSince(captureStartedAt)} ms, ${manifest.failed.length} failed, written to ${outDir}`,
);
try {
	const { shown, keys } = await writeCoverage({ outDir, commit, captured });
	console.log(`${shown} of ${keys} keys shown`);
} catch (error) {
	console.error(`Wrote no coverage.json: ${String(error)}`);
}
if (Object.keys(manifest.views).length === 0) process.exit(1);
