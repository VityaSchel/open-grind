import {
	ANDROID_SPLITS,
	androidSplitSuffix,
	isAndroidTarget,
} from "../../../scripts/lib/asset-suffix";

const here = Bun.fileURLToPath(new URL(".", import.meta.url)).replace(
	/\/$/,
	"",
);
const home = Bun.env.HOME ?? "";

export const repo = Bun.env.OG_REPO ?? `${here}/../../..`;
export const state = Bun.env.OG_E2E_STATE ?? `${here}/../.state`;

export const identifier = "org.opengrind.updaterdemo";
export const oldVersion = Bun.env.OLD_VERSION ?? "0.1.0";
export const newVersion = Bun.env.NEW_VERSION ?? "0.2.0";
export const port = Number(Bun.env.PORT ?? 8788);
export const failMode = Bun.env.FAIL ?? "";
export const rate = Number(Bun.env.RATE ?? 1024 * 1024 * 10);

export const cache = `${state}/cache`;
export const serverHome = `${state}/server`;
export const requestLog = `${state}/requests.jsonl`;
export const appLog = `${state}/app.log`;
export const bundleName = "Open Grind.app";
export const runningApp = `${state}/run/${bundleName}`;

export const appSupport = `${home}/Library/Application Support/${identifier}`;
export const appCache = `${home}/Library/Caches/${identifier}`;

export function cachedBundle(version: string): string {
	return `${cache}/${version}/${bundleName}`;
}

export const androidPackage = "org.opengrind";
const requestedAbi = Bun.env.ABI ?? "aarch64";
if (!isAndroidTarget(requestedAbi)) {
	throw new Error(
		`ABI must be one of ${Object.keys(ANDROID_SPLITS).join(", ")}`,
	);
}
export const androidAbi = requestedAbi;
export const androidFlavor = ANDROID_SPLITS[androidAbi].flavor;
export const androidSuffix = androidSplitSuffix(androidAbi);
export const oldCode = Number(Bun.env.OLD_CODE ?? 1030);
export const newCode = Number(Bun.env.NEW_CODE ?? 1031);
export const overrideFile = "/data/local/tmp/open-grind-update.env";
export const keystoreProperties =
	Bun.env.OPEN_GRIND_KEYSTORE_PROPERTIES ??
	`${home}/.config/open-grind/keystore.properties`;

export const harnessOptions = {
	home: serverHome,
	port,
	rate,
	failMode,
	journal: requestLog,
};

export const companionPackage = "org.opengrind.google_oauth";
export const companionRepo = "google-oauth-app";
export const companionStem = "open-grind-google-oauth";
export const companionRelease = Bun.env.COMPANION_RELEASE ?? "v1.1.0";
const addonModes = ["install", "update"] as const;

export function addonMode(): (typeof addonModes)[number] {
	const value = Bun.env.ADDON;
	if (value === undefined) return "install";
	const mode = addonModes.find((candidate) => candidate === value);
	if (!mode) throw new Error(`ADDON must be one of ${addonModes.join(", ")}`);
	return mode;
}

const companionAbiTokens = new Map([
	["aarch64", "arm64-v8a"],
	["armv7", "v7a"],
	["x86_64", "x86_64"],
]);

export const publishedCompanionAbis = [...companionAbiTokens.values()];

export function companionAbiToken(abi: string): string {
	const token = companionAbiTokens.get(abi);
	if (!token) throw new Error(`no published companion build for ${abi}`);
	return token;
}

export function companionSuffix(abiToken: string): string {
	return `-${abiToken}.apk`;
}

export function companionAsset({
	tag,
	abiToken,
}: {
	tag: string;
	abiToken: string;
}): string {
	return `${companionStem}-${tag}${companionSuffix(abiToken)}`;
}

export function cachedCompanionApk(asset: string): string {
	return `${cache}/android/${asset}`;
}

export function cachedApk(version: string): string {
	return `${cache}/android/open-grind-${version}.apk`;
}
