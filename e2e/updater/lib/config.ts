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
export const androidSuffix = "-android.apk";
export const androidAbi = Bun.env.ABI ?? "aarch64";
export const oldCode = Number(Bun.env.OLD_CODE ?? 1030);
export const newCode = Number(Bun.env.NEW_CODE ?? 1031);
export const overrideFile = "/data/local/tmp/open-grind-update.env";
export const keystoreProperties =
	Bun.env.OPEN_GRIND_KEYSTORE_PROPERTIES ??
	`${home}/.config/open-grind/keystore.properties`;

export function cachedApk(version: string): string {
	return `${cache}/android/open-grind-${version}.apk`;
}
