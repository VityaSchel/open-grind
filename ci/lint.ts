#!/usr/bin/env bun

const HEARTBEAT_MS = 15_000;
const PROGRESS_LINE = /^ {2}lint /;

const started = performance.now();
let linted = 0;

function elapsed(): string {
	const seconds = Math.round((performance.now() - started) / 1000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const eslint = Bun.spawn(["bun", "run", "lint"], {
	env: { ...process.env, ESLINT_PROGRESS: "1" },
	stdout: "inherit",
	stderr: "pipe",
});

const heartbeat = setInterval(() => {
	process.stderr.write(`  linted ${linted} files (${elapsed()})\n`);
}, HEARTBEAT_MS);

const decoder = new TextDecoder();
let tail = "";
for await (const chunk of eslint.stderr) {
	const lines = (tail + decoder.decode(chunk, { stream: true })).split("\n");
	tail = lines.pop() ?? "";
	for (const line of lines) {
		if (PROGRESS_LINE.test(line)) {
			linted++;
		} else {
			process.stderr.write(`${line}\n`);
		}
	}
}
clearInterval(heartbeat);
if (tail) process.stderr.write(`${tail}\n`);
process.stderr.write(`  linted ${linted} files in ${elapsed()}\n`);

process.exitCode = await eslint.exited;
