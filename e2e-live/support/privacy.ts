import process from "node:process";

export function keepPageSnapshotsOutOfFailureReports() {
	process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
}
