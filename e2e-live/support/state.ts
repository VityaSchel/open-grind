import { homedir } from "node:os";
import { join } from "node:path";

const stateDir = join(homedir(), ".cache", "open-grind", "live-e2e");

export const liveStatePaths = {
	dir: stateDir,
	ledger: join(stateDir, "ledger.json"),
	lock: join(stateDir, "run.lock"),
	stop: join(stateDir, "stop.json"),
} as const;
