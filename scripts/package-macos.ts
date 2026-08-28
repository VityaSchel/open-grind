import { $ } from "bun";

import { hostAssetSuffix } from "./lib/asset-suffix";
import { MACOS_TARGET, macosBundle } from "./lib/macos-bundle";
import { only } from "./lib/only";

const root = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(
	/\/$/,
	"",
);
const profile = Bun.argv.includes("--debug") ? "debug" : "release";
const bundles = macosBundle(root, profile);
const out = `${root}/src-tauri/target/${profile}/artifacts`;
const entitlements = `${root}/src-tauri/entitlements.plist`;

const identity = Bun.env.MACOS_SIGN_IDENTITY ?? "-";
const notaryProfile = Bun.env.MACOS_NOTARY_PROFILE;
const adHoc = identity === "-";

if (notaryProfile && adHoc) {
	throw new Error(
		"notarization needs MACOS_SIGN_IDENTITY set to a Developer ID",
	);
}

const epoch = Bun.env.SOURCE_DATE_EPOCH;
if (!epoch) {
	throw new Error("SOURCE_DATE_EPOCH is unset, run `nix run .#build-macos`");
}
const stamp = new Date(Number(epoch) * 1000)
	.toISOString()
	.replace(".000Z", "Z");

const { version } = await Bun.file(`${root}/src-tauri/tauri.conf.json`).json();
const zip = `${out}/open-grind-v${version}${hostAssetSuffix()}`;

await $`bun run tauri build ${profile === "debug" ? ["--debug"] : []} --features keychain --target ${MACOS_TARGET} --bundles app`.cwd(
	root,
);

await $`rm -rf ${out}`;
await $`mkdir -p ${out}`;

const app = await only("*.app", bundles);
const timestamped = adHoc ? [] : ["--timestamp"];
const entitled = (await Bun.file(entitlements).exists())
	? ["--entitlements", entitlements]
	: [];

await $`codesign --force --deep --sign ${identity} --options runtime ${timestamped} ${entitled} ${app}`;
await $`codesign --verify --strict ${app}`;

const archive = async () => {
	await $`find ${app} -depth -exec touch -h -d ${stamp} '{}' +`;
	await $`ditto -c -k --keepParent ${app} ${zip}`;
};

if (notaryProfile) {
	await archive();
	await $`xcrun notarytool submit ${zip} --keychain-profile ${notaryProfile} --wait`;
	await $`xcrun stapler staple ${app}`;
	await $`rm -f ${zip}`;
}
await archive();

const digest = new Bun.CryptoHasher("sha256")
	.update(await Bun.file(zip).bytes())
	.digest("hex");

console.log(`
${zip}
  sha256 ${digest}
  signed ${adHoc ? "ad-hoc (not distributable)" : identity}
  notarized ${notaryProfile ? "yes, ticket stapled" : "no"}`);
