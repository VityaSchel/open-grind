import { buildApk, clearKeystore, ensureState } from "../lib/build";
import {
	addonMode,
	androidAbi,
	cachedCompanionApk,
	companionAbiToken,
	companionAsset,
	companionPackage,
	companionRelease,
	companionRepo,
	companionStem,
	companionSuffix,
	oldCode,
	oldVersion,
} from "../lib/config";
import {
	clearAppData,
	installApk,
	installedVersion,
	packageVersionName,
	requireDevice,
	uninstallPackage,
} from "../lib/device";
import { verifiedDownload } from "../lib/published";
import { requireMinisign } from "../lib/server";
import { failingMarker, printSteps, serveOnDevice } from "../lib/session";

const releases = `https://git.opengrind.org/open-grind/${companionRepo}/releases/download`;
const localCompanion = Bun.env.COMPANION_APK;

async function companionApk(abiToken: string): Promise<string> {
	if (localCompanion) return localCompanion;
	const asset = companionAsset({ tag: companionRelease, abiToken });
	return verifiedDownload({
		url: `${releases}/${companionRelease}/${asset}`,
		file: cachedCompanionApk(asset),
	});
}

function nextPatchTag(versionName: string | null): string {
	const [, major, minor, patch] =
		/^(\d+)\.(\d+)\.(\d+)/.exec(versionName ?? "") ?? [];
	if (!major || !minor || !patch) {
		throw new Error(`cannot bump companion version ${versionName}`);
	}
	return `v${major}.${minor}.${Number(patch) + 1}`;
}

export async function androidAddon({
	force,
}: {
	force: boolean;
}): Promise<void> {
	const mode = addonMode();
	requireMinisign();
	if (localCompanion && !(await Bun.file(localCompanion).exists())) {
		throw new Error(`${localCompanion} does not exist`);
	}
	const abiToken = companionAbiToken(androidAbi);
	const serial = await requireDevice();
	await ensureState();
	await clearKeystore();
	const payload = await companionApk(abiToken);
	const appApk = await buildApk({
		version: oldVersion,
		versionCode: oldCode,
		force,
	});

	console.log(`installing Open Grind v${oldVersion} on ${serial}…`);
	await installApk(appApk);
	await clearAppData();
	await uninstallPackage(companionPackage);
	if (mode === "update") await installApk(payload);
	const companionVersion = await packageVersionName(companionPackage);
	const tag =
		Bun.env.COMPANION_TAG ??
		(mode === "install"
			? companionRelease
			: nextPatchTag(companionVersion));

	const { harness, permitted } = await serveOnDevice({
		releases: [
			{
				repo: companionRepo,
				stem: companionStem,
				payload: { file: payload },
				tag,
				suffix: companionSuffix(abiToken),
			},
		],
	});

	const permissionStep =
		'once the download is verified the install-permission screen opens and the button reads "Install" again; allow it and come back, it continues by itself';
	const steps =
		mode === "install"
			? [
					'press "Get started", then "Sign in with Google"',
					'tap "Install"; the button reads "Downloading…" while the toast shows the progress',
					...(permitted ? [] : [permissionStep]),
					'the button reads "Installing…"; confirm Android\'s install dialog',
					`the toast reads "Google OAuth app installed: ${tag}" and the card switches to "Continue"; cancelling the dialog leaves an "Install" button that asks again only when tapped`,
				]
			: [
					'press "Get started" — the update checkbox is already on',
					'a "Google OAuth app update available" toast drops in — tap it to download',
					`tap "Google OAuth app update is downloaded"${
						permitted
							? ""
							: " — the install-permission screen opens first; allow it and come back"
					}`,
					"confirm Android's update dialog — Open Grind stays open",
					`the toast now reads "Google OAuth app updated: ${tag}"`,
					`the served APK is the same build re-tagged, so the device still reports ${companionVersion}; the next check offers ${tag} again`,
				];

	console.log(`
serving  ${harness.assets.join(", ")} on ${harness.origin} (reversed onto the device)
app      ${await installedVersion()}   companion  ${await installedVersion(companionPackage)}   mode  ${mode}${failingMarker}

what to do on the device:
${printSteps(steps)}

press ctrl-c to stop the server, quit the app and remove the override`);
	await new Promise(() => {});
}
