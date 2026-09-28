import { basename } from "node:path";

import { $ } from "bun";

import { assetSuffix } from "./lib/asset-suffix";
import { MACOS_TARGET, macosBundle } from "./lib/macos-bundle";
import { only } from "./lib/only";

const root = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(
	/\/$/,
	"",
);
const profile = Bun.argv.includes("--debug") ? "debug" : "release";
const appStore = Bun.argv.includes("--app-store");
const variant = appStore
	? ["--config", `${root}/src-tauri/tauri.appstore.conf.json`]
	: [];
const features = appStore ? "keychain" : "keychain,private-api";
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
const zip = appStore
	? `${out}/open-grind-v${version}-macos-appstore.zip`
	: `${out}/open-grind-v${version}${assetSuffix("zip")}`;

const SYSTEM_DYLIBS = ["libiconv.2.dylib"];

async function useSystemDylibs(binary: string): Promise<void> {
	const linked = await $`otool -L ${binary}`.text();
	const fromStore = [
		...new Set(linked.match(/\/nix\/store\/\S+\.dylib/g) ?? []),
	];
	for (const ref of fromStore) {
		const name = ref.split("/").pop()!;
		if (!SYSTEM_DYLIBS.includes(name)) {
			throw new Error(
				`${name} is linked from the Nix store and has no system counterpart, so the app would not launch off this machine`,
			);
		}
		await $`install_name_tool -change ${ref} /usr/lib/${name} ${binary}`.quiet();
	}
}

const MACH_O_MAGIC = ["cffaedfe", "cafebabe"];

async function verifyShipped(zip: string): Promise<void> {
	const unpacked = (await $`mktemp -d`.text()).trim();
	await $`ditto -x -k ${zip} ${unpacked}`;
	const shipped = await only("*.app", unpacked);
	await $`codesign --verify --strict --deep ${shipped}`;
	for await (const path of new Bun.Glob("**").scan({ cwd: shipped })) {
		const file = `${shipped}/${path}`;
		const head = await Bun.file(file).slice(0, 4).bytes();
		if (!MACH_O_MAGIC.includes(Buffer.from(head).toString("hex"))) continue;
		const { stderr } = await $`codesign -dv ${file}`.quiet();
		if (!/flags=0x[0-9a-f]+\([^)]*runtime/.test(stderr.toString())) {
			throw new Error(`${path} is signed without the hardened runtime`);
		}
	}
	await $`rm -rf ${unpacked}`;
}

await $`bun run tauri build ${profile === "debug" ? ["--debug"] : []} ${variant} --features ${features} --target ${MACOS_TARGET} --bundles app`.cwd(
	root,
);

await $`rm -rf ${out}`;
await $`mkdir -p ${out}`;

const app = await only("*.app", bundles);
const binary = `${app}/Contents/MacOS/open-grind`;
await useSystemDylibs(binary);

const entitled = await Bun.file(entitlements).exists();

if (adHoc) {
	await $`codesign_allocate -i ${binary} -r -o ${binary}.unsigned`;
	await $`mv ${binary}.unsigned ${binary}`;
	await $`rcodesign sign -C /dev/null --code-signature-flags runtime ${entitled ? ["--entitlements-xml-file", entitlements] : []} ${app}`;
} else {
	await $`codesign --force --deep --sign ${identity} --options runtime --timestamp ${entitled ? ["--entitlements", entitlements] : []} ${app}`;
}

const archive = async () => {
	await $`chmod -R u=rwX,go=rX ${app}`;
	await $`find ${app} -depth -exec touch -h -d ${stamp} '{}' +`;
	await $`find ${basename(app)} | sort | zip -q -X -y -9 -@ ${zip}`.cwd(
		bundles,
	);
};

if (notaryProfile) {
	await archive();
	await $`xcrun notarytool submit ${zip} --keychain-profile ${notaryProfile} --wait`;
	await $`xcrun stapler staple ${app}`;
	await $`rm -f ${zip}`;
}
await archive();
await verifyShipped(zip);

const digest = new Bun.CryptoHasher("sha256")
	.update(await Bun.file(zip).bytes())
	.digest("hex");

console.log(`
${zip}
  sha256 ${digest}
  signed ${adHoc ? "ad-hoc (not distributable)" : identity}
  notarized ${notaryProfile ? "yes, ticket stapled" : "no"}`);
