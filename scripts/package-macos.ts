import { basename, dirname, resolve } from "node:path";

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
const adHocOut = `${root}/src-tauri/target/${profile}/ad-hoc`;
const EXECUTABLE = "Contents/MacOS/open-grind";

const identity = Bun.env.MACOS_SIGN_IDENTITY ?? "-";
const adHoc = identity === "-";
const notary = await notaryCredentials();

const XCRUN = [
	"/usr/bin/env",
	"-u",
	"DEVELOPER_DIR",
	"-u",
	"SDKROOT",
	"/usr/bin/xcrun",
];

const epoch = Bun.env.SOURCE_DATE_EPOCH;
if (!epoch) {
	throw new Error("SOURCE_DATE_EPOCH is unset, run `nix run .#build-macos`");
}
const stamp = new Date(Number(epoch) * 1000)
	.toISOString()
	.replace(".000Z", "Z");

const { version } = await Bun.file(`${root}/src-tauri/tauri.conf.json`).json();
const { identifier } = await Bun.file(
	`${root}/src-tauri/tauri.macos.conf.json`,
).json();
const APPLE_TEAM_LABEL = "Apple Developer team ID:";
const publishedKeys = (await Bun.file(`${root}/KEYS.md`).text())
	.split("\n")
	.map((line) => line.trim());
const teamLabel = publishedKeys.indexOf(APPLE_TEAM_LABEL);
const team = publishedKeys
	.slice(teamLabel + 1)
	.find((line) => /^[0-9A-Z]{10}$/.test(line));
if (teamLabel === -1 || !team) {
	throw new Error("KEYS.md publishes no Apple Developer team ID");
}
const DEVELOPER_ID_REQUIREMENT = `designated => identifier "${identifier}" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = ${team}`;
const zipName = appStore
	? `open-grind-v${version}-macos-appstore.zip`
	: `open-grind-v${version}${assetSuffix("zip")}`;

async function notaryCredentials(): Promise<string[] | undefined> {
	const keyId = Bun.env.MACOS_NOTARY_KEY_ID;
	const issuer = Bun.env.MACOS_NOTARY_ISSUER;
	if (!keyId && !issuer) return undefined;
	if (!keyId || !issuer) {
		throw new Error(
			"notarization needs both MACOS_NOTARY_KEY_ID and MACOS_NOTARY_ISSUER",
		);
	}
	if (adHoc) {
		throw new Error(
			"notarization needs MACOS_SIGN_IDENTITY set to a Developer ID",
		);
	}
	const key = `${Bun.env.HOME}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8`;
	if (!(await Bun.file(key).exists())) {
		throw new Error(`${key} is missing`);
	}
	return ["--key", key, "--key-id", keyId, "--issuer", issuer];
}

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

async function signAdHoc(app: string): Promise<void> {
	const binary = `${app}/${EXECUTABLE}`;
	await $`codesign_allocate -i ${binary} -r -o ${binary}.unsigned`;
	await $`mv ${binary}.unsigned ${binary}`;
	await $`rcodesign sign -C /dev/null --code-signature-flags runtime ${app}`;
}

async function archive(app: string, zip: string): Promise<void> {
	await $`rm -f ${zip}`;
	await $`chmod -R u=rwX,go=rX ${app}`;
	await $`find ${app} -depth -exec touch -h -d ${stamp} '{}' +`;
	await $`find ${basename(app)} | sort | zip -q -X -y -9 -@ ${zip}`.cwd(
		dirname(app),
	);
}

async function unpack(zip: string): Promise<string> {
	const into = (await $`mktemp -d`.text()).trim();
	await $`ditto -x -k ${zip} ${into}`;
	return only("*.app", into);
}

async function notarize(zip: string, credentials: string[]): Promise<void> {
	const submitted =
		await $`${XCRUN} notarytool submit ${zip} ${credentials} --wait --output-format json`
			.nothrow()
			.quiet();
	let outcome: { id: string; status: string };
	try {
		outcome = JSON.parse(submitted.stdout.toString());
	} catch {
		throw new Error(`notarytool submit failed:\n${submitted.stderr}`);
	}
	const { id, status } = outcome;
	if (status === "Accepted") return;
	const log = await $`${XCRUN} notarytool log ${id} ${credentials}`
		.nothrow()
		.text();
	throw new Error(`notarization ended ${status}:\n${log}`);
}

async function resignAdHoc(zip: string, into: string): Promise<void> {
	const app = await unpack(zip);
	await $`rm -f ${app}/Contents/CodeResources`;
	await signAdHoc(app);
	await archive(app, into);
	await $`rm -rf ${dirname(app)}`;
}

const MACH_O_MAGIC = ["cffaedfe", "cafebabe"];
const APP_ICON = "AppIcon";

type Signature = "ad-hoc" | "Developer ID" | "notarized";

async function verifyShipped(zip: string, signature: Signature): Promise<void> {
	const shipped = await unpack(zip);
	await $`codesign --verify --strict --deep ${shipped}`;
	const iconName =
		await $`/usr/bin/plutil -extract CFBundleIconName raw -o - ${shipped}/Contents/Info.plist`
			.nothrow()
			.quiet();
	if (iconName.stdout.toString().trim() !== APP_ICON) {
		throw new Error(`${shipped} ships without its Liquid Glass icon`);
	}
	for await (const path of new Bun.Glob("**").scan({ cwd: shipped })) {
		const file = `${shipped}/${path}`;
		const head = await Bun.file(file).slice(0, 4).bytes();
		if (!MACH_O_MAGIC.includes(Buffer.from(head).toString("hex"))) continue;
		const { stderr } = await $`codesign -dv ${file}`.quiet();
		if (!/flags=0x[0-9a-f]+\([^)]*runtime/.test(stderr.toString())) {
			throw new Error(`${path} is signed without the hardened runtime`);
		}
		const entitlements =
			await $`codesign -d --entitlements - --xml ${file}`.quiet();
		if (entitlements.stdout.length > 0) {
			throw new Error(`${path} is signed with entitlements`);
		}
	}
	if (signature !== "ad-hoc") {
		const { stdout } = await $`codesign -d -r- ${shipped}`.quiet();
		if (stdout.toString().trim() !== DEVELOPER_ID_REQUIREMENT) {
			throw new Error(
				`${shipped} has an unexpected requirement:\n${stdout}`,
			);
		}
	}
	if (signature === "notarized") {
		const stapled = await $`${XCRUN} stapler validate ${shipped}`
			.nothrow()
			.quiet();
		if (stapled.exitCode !== 0) {
			throw new Error(`${shipped} has no valid notarization ticket`);
		}
		const { stderr } =
			await $`/usr/sbin/spctl --assess --type execute -vv ${shipped}`
				.nothrow()
				.quiet();
		if (!stderr.toString().includes("source=Notarized Developer ID")) {
			throw new Error(`Gatekeeper rejects the shipped app:\n${stderr}`);
		}
	}
	await $`rm -rf ${dirname(shipped)}`;
}

async function sha256(file: string): Promise<string> {
	return new Bun.CryptoHasher("sha256")
		.update(await Bun.file(file).bytes())
		.digest("hex");
}

async function assertReproduces(zip: string, reference: string): Promise<void> {
	const resigned = `${adHocOut}/resigned-${basename(zip)}`;
	await resignAdHoc(zip, resigned);
	const { exitCode } = await $`cmp -s ${resigned} ${reference}`.nothrow();
	if (exitCode !== 0) {
		throw new Error(
			`${resigned}, the shipped app re-signed ad-hoc, differs from the ad-hoc build ${reference}`,
		);
	}
	await $`rm -f ${resigned}`;
}

async function reproduce(published: string): Promise<void> {
	await $`mkdir -p ${adHocOut}`;
	const resigned = `${adHocOut}/${basename(published)}`;
	await verifyShipped(resolve(published), "notarized");
	await resignAdHoc(resolve(published), resigned);
	console.log(`
${resigned}
  sha256 ${await sha256(resigned)}`);
}

async function build(): Promise<void> {
	await $`bun run tauri build ${profile === "debug" ? ["--debug"] : []} ${variant} --no-sign --features ${features} --target ${MACOS_TARGET} --bundles app`.cwd(
		root,
	);

	await $`rm -rf ${out} ${adHocOut}`;
	await $`mkdir -p ${out}`;

	const app = await only("*.app", bundles);
	await useSystemDylibs(`${app}/${EXECUTABLE}`);
	const zip = `${out}/${zipName}`;

	if (adHoc) {
		await signAdHoc(app);
		await archive(app, zip);
		await verifyShipped(zip, "ad-hoc");
		console.log(`
${zip}
  sha256 ${await sha256(zip)}
  signed ad-hoc (not distributable)`);
		return;
	}

	const reference = `${adHocOut}/${zipName}`;
	const unsigned = `${adHocOut}/${basename(app)}`;
	await $`mkdir -p ${adHocOut}`;
	await $`ditto ${app} ${unsigned}`;
	await signAdHoc(unsigned);
	await archive(unsigned, reference);
	await $`rm -rf ${unsigned}`;

	await $`codesign --force --sign ${identity} --options runtime --timestamp ${app}`;
	if (notary) {
		await archive(app, zip);
		await notarize(zip, notary);
		await $`${XCRUN} stapler staple ${app}`.quiet();
	}
	await archive(app, zip);
	await verifyShipped(zip, notary ? "notarized" : "Developer ID");
	await assertReproduces(zip, reference);

	console.log(`
${zip}
  sha256 ${await sha256(zip)}
  signed ${identity}
  notarized ${notary ? "yes, ticket stapled" : "no"}
  re-signed ad-hoc it matches ${reference}
  sha256 ${await sha256(reference)}`);
}

const resignIndex = Bun.argv.indexOf("--resign-ad-hoc");
if (resignIndex === -1) {
	await build();
} else {
	const published = Bun.argv[resignIndex + 1];
	if (!published) throw new Error("--resign-ad-hoc needs a zip path");
	await reproduce(published);
}
