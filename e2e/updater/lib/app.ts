import { $ } from "bun";

import { appCache, appLog, appSupport, runningApp } from "./config";

export async function resetAppData(): Promise<void> {
	await $`rm -rf ${appSupport} ${appCache}`;
}

export async function setLaunchEnv({
	origin,
	key,
}: {
	origin: string;
	key: string;
}): Promise<void> {
	await $`launchctl setenv OPEN_GRIND_UPDATE_ORIGIN ${origin}`;
	await $`launchctl setenv OPEN_GRIND_UPDATE_KEY ${key}`;
}

export async function clearLaunchEnv(): Promise<void> {
	await $`launchctl unsetenv OPEN_GRIND_UPDATE_ORIGIN`;
	await $`launchctl unsetenv OPEN_GRIND_UPDATE_KEY`;
}

export async function runningPids(): Promise<number[]> {
	const found = await $`pgrep -f ${runningApp}`.nothrow().quiet();
	return found.stdout
		.toString()
		.split("\n")
		.filter(Boolean)
		.map(Number)
		.filter((pid) => pid !== process.pid);
}

export async function quit(): Promise<void> {
	for (const pid of await runningPids()) {
		try {
			process.kill(pid);
		} catch {
			/* already gone */
		}
	}
}

export function launch({ origin, key }: { origin: string; key: string }): void {
	const app = Bun.spawn([`${runningApp}/Contents/MacOS/open-grind`], {
		env: {
			...process.env,
			OPEN_GRIND_UPDATE_ORIGIN: origin,
			OPEN_GRIND_UPDATE_KEY: key,
		},
		stdin: "ignore",
		stdout: Bun.file(appLog),
		stderr: Bun.file(appLog),
	});
	app.unref();
}
