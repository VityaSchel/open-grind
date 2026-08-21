import { startServer, type Payload } from "../e2e/updater/lib/server";

import { hostAssetSuffix } from "./lib/asset-suffix";

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

const harness = await startServer({
	payload: source(),
	tag,
	home: `${root}/.updater-dev`,
	port,
	suffix: Bun.env.SUFFIX ?? hostAssetSuffix(),
	uuid: "dev-payload-uuid",
	rate,
	prerelease: true,
	notes: "Local development release.",
});

console.log(`serving ${harness.asset} on ${harness.origin}
throttled to ${rate ? `${Math.round(rate / 1024)} KiB/s, set RATE=0 to lift` : "line speed"}

export the following, then start the app in dev mode:
  export OPEN_GRIND_UPDATE_ORIGIN=${harness.origin}
  export OPEN_GRIND_UPDATE_KEY=${harness.publicKey}

on a device: adb reverse tcp:${port} tcp:${port}`);
