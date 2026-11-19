import {
	companionRepo,
	companionStem,
	companionSuffix,
	publishedCompanionAbis,
} from "../e2e/updater/lib/config";
import { startServer, type Payload } from "../e2e/updater/lib/server";

import {
	assetSuffix,
	isUpdaterArtifact,
	UPDATER_ARTIFACTS,
} from "./lib/asset-suffix";

const root = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(
	/\/$/,
	"",
);

const port = Number(Bun.env.PORT ?? 8787);
const rate = Number(Bun.env.RATE ?? 1024 * 1024 * 10);
const tag = Bun.env.TAG ?? "v99.0.0";
const bundle = Bun.env.APP_BUNDLE;
const file = Bun.env.PAYLOAD;

function source(): Payload {
	if (file) return { file };
	if (bundle) return { bundle };
	return { invent: Number(Bun.env.SIZE ?? 12 * 1024 * 1024) };
}

if (file && !(await Bun.file(file).exists())) {
	throw new Error(`${file} does not exist`);
}
if (bundle && !(await Bun.file(`${bundle}/Contents/Info.plist`).exists())) {
	throw new Error(`${bundle} is not an app bundle`);
}

function servedSuffix(): string {
	const literal = Bun.env.SUFFIX;
	if (literal) return literal;
	const artifact = Bun.env.ARTIFACT;
	if (!artifact) {
		throw new Error(
			`name the artifact to serve: ARTIFACT=${UPDATER_ARTIFACTS.join("|")}, or SUFFIX=<literal>`,
		);
	}
	if (!isUpdaterArtifact(artifact)) {
		throw new Error(
			`ARTIFACT must be one of ${UPDATER_ARTIFACTS.join(", ")}`,
		);
	}
	return assetSuffix(artifact);
}

const companion = Bun.env.COMPANION_PAYLOAD;
if (companion && !(await Bun.file(companion).exists())) {
	throw new Error(`${companion} does not exist`);
}
const companionAbi = Bun.env.COMPANION_ABI ?? "arm64-v8a";
if (!publishedCompanionAbis.includes(companionAbi)) {
	throw new Error(
		`COMPANION_ABI must be one of ${publishedCompanionAbis.join(", ")}`,
	);
}
const servesApp =
	!companion ||
	[file, bundle, Bun.env.ARTIFACT, Bun.env.SUFFIX].some(
		(setting) => setting !== undefined,
	);

const harness = await startServer({
	releases: [
		...(servesApp
			? [
					{
						payload: source(),
						tag,
						suffix: servedSuffix(),
						uuid: "dev-payload-uuid",
						prerelease: true,
						notes: "Local development release.",
					},
				]
			: []),
		...(companion
			? [
					{
						repo: companionRepo,
						stem: companionStem,
						payload: { file: companion },
						tag: Bun.env.COMPANION_TAG ?? "v99.0.0",
						suffix: companionSuffix(companionAbi),
						uuid: "dev-companion-uuid",
						notes: "Local Google OAuth app release.",
					},
				]
			: []),
	],
	home: `${root}/.updater-dev`,
	port,
	rate,
});

console.log(`serving ${harness.assets.join(", ")} on ${harness.origin}
throttled to ${rate ? `${Math.round(rate / 1024)} KiB/s, set RATE=0 to lift` : "line speed"}

export the following, then start the app in dev mode:
  export OPEN_GRIND_UPDATE_ORIGIN=${harness.origin}
  export OPEN_GRIND_UPDATE_KEY=${harness.publicKey}

on a device: adb reverse tcp:${port} tcp:${port}`);
