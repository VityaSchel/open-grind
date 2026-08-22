import {
	clearLaunchEnv,
	launch,
	quit,
	resetAppData,
	setLaunchEnv,
} from "../lib/app";
import { buildBundle, ensureState, placeRunnable } from "../lib/build";
import {
	appLog,
	cachedBundle,
	failMode,
	newVersion,
	oldVersion,
	repo,
	runningApp,
} from "../lib/config";
import { startServer, type Harness } from "../lib/server";
import { harnessOptions } from "../run";

async function fixtures({ force }: { force: boolean }): Promise<void> {
	await ensureState();
	console.log(`building fixtures from ${repo}`);
	await buildBundle({ version: newVersion, force });
	await buildBundle({ version: oldVersion, force });
}

async function serve(): Promise<Harness> {
	const harness = await startServer({
		...harnessOptions,
		payload: { bundle: cachedBundle(newVersion) },
		tag: `v${newVersion}`,
	});
	await setLaunchEnv({ origin: harness.origin, key: harness.publicKey });

	const shutdown = async () => {
		console.log("\nstopping");
		await quit();
		await clearLaunchEnv();
		await harness.stop();
		process.exit(0);
	};
	process.on("SIGINT", () => void shutdown());
	process.on("SIGTERM", () => void shutdown());
	return harness;
}

export async function demo({ force }: { force: boolean }): Promise<void> {
	await fixtures({ force });

	await placeRunnable({ version: oldVersion, at: runningApp });
	await resetAppData();

	const harness = await serve();
	launch({ origin: harness.origin, key: harness.publicKey });

	console.log(`
serving ${harness.asset} on ${harness.origin}
running  v${oldVersion}   offering  v${newVersion}${failMode ? `   FAILING: ${failMode}` : ""}
app log  ${appLog}

what to do:
  1. press "Get started" — the update checkbox is already on
  2. a toast drops in from the top — tap it to download
  3. it verifies, swaps itself, quits and comes back on its own
  4. the only toast now is "Updated to v${newVersion}" — tapping it opens the changelog
  5. relaunching never offers again: v${newVersion} is not newer than itself

press ctrl-c to stop the server, quit the app and unset the overrides`);
	await new Promise(() => {});
}
