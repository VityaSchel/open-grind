import { buildApk, clearKeystore, ensureState } from "../lib/build";
import {
	androidSuffix,
	newCode,
	newVersion,
	oldCode,
	oldVersion,
	repo,
} from "../lib/config";
import {
	clearAppData,
	installApk,
	installedVersion,
	requireDevice,
} from "../lib/device";
import { requireMinisign } from "../lib/server";
import { failingMarker, printSteps, serveOnDevice } from "../lib/session";

export async function androidFixtures({
	force,
}: {
	force: boolean;
}): Promise<{ newApk: string; oldApk: string }> {
	await ensureState();
	await clearKeystore();

	console.log(`building fixtures from ${repo}`);
	const newApk = await buildApk({
		version: newVersion,
		versionCode: newCode,
		force,
	});
	const oldApk = await buildApk({
		version: oldVersion,
		versionCode: oldCode,
		force,
	});
	return { newApk, oldApk };
}

export async function android({
	force,
	keepData,
}: {
	force: boolean;
	keepData: boolean;
}): Promise<void> {
	requireMinisign();
	const serial = await requireDevice();
	const { newApk, oldApk } = await androidFixtures({ force });

	console.log(
		`installing v${oldVersion} on ${serial} (this takes a minute)…`,
	);
	await installApk(oldApk);
	if (keepData) {
		console.log("keeping app data, an earlier stage may still resume");
	} else {
		await clearAppData();
	}

	const { harness, permitted } = await serveOnDevice({
		releases: [
			{
				payload: { file: newApk },
				tag: `v${newVersion}`,
				suffix: androidSuffix,
			},
		],
	});

	const steps = [
		...(keepData
			? []
			: ['press "Get started" — the update checkbox is already on']),
		"a toast drops in from the top — tap it to download",
		'"Verifying the update…" only shows when a resumed download has to\n     re-hash the part it already had; a fresh download verifies in ~60ms',
		`tap "Update is downloaded"${
			permitted
				? ""
				: `; the install-permission screen opens instead of
     an error — turn the switch on and come back, and it installs itself`
		}`,
		'confirm "Update this app?" — Android kills the app to install it',
		"reopen it yourself: Android 14+ forbids an app relaunching itself",
		`the only toast now is "Updated to v${newVersion}"; relaunching never offers again`,
	];

	console.log(`
serving  ${harness.assets.join(", ")} on ${harness.origin} (reversed onto the phone)
running  ${await installedVersion()}   offering  v${newVersion} (${newCode})${failingMarker}

what to do on the phone:
${printSteps(steps)}

quitting mid-download resumes on next launch and re-hashes what it kept;
dismissing either system screen is not an error

press ctrl-c to stop the server, quit the app and remove the override`);
	await new Promise(() => {});
}
