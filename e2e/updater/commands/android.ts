import { buildApk, clearKeystore, ensureState } from "../lib/build";
import {
	androidSuffix,
	failMode,
	newCode,
	newVersion,
	oldCode,
	oldVersion,
	repo,
} from "../lib/config";
import {
	bridge,
	canInstallPackages,
	clearAppData,
	clearOverride,
	installApk,
	installedVersion,
	launchApp,
	requireDevice,
	stopApp,
	unbridge,
	writeOverride,
} from "../lib/device";
import { startServer } from "../lib/server";
import { harnessOptions } from "../run";

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
	if (!Bun.which("minisign")) {
		throw new Error("minisign not found — run this inside 'nix develop'");
	}
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

	const harness = await startServer({
		...harnessOptions,
		payload: { file: newApk },
		tag: `v${newVersion}`,
		suffix: androidSuffix,
	});
	await bridge();
	await writeOverride({ origin: harness.origin, key: harness.publicKey });

	const shutdown = async () => {
		console.log("\nstopping");
		await stopApp();
		await clearOverride();
		await unbridge();
		await harness.stop();
		process.exit(0);
	};
	process.on("SIGINT", () => void shutdown());
	process.on("SIGTERM", () => void shutdown());

	await launchApp();
	const permitted = await canInstallPackages();
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
serving  ${harness.asset} on ${harness.origin} (reversed onto the phone)
running  ${await installedVersion()}   offering  v${newVersion} (${newCode})${failMode ? `   FAILING: ${failMode}` : ""}

what to do on the phone:
${steps.map((step, index) => `  ${index + 1}. ${step}`).join("\n")}

quitting mid-download resumes on next launch and re-hashes what it kept;
dismissing either system screen is not an error

press ctrl-c to stop the server, quit the app and remove the override`);
	await new Promise(() => {});
}
