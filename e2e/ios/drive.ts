import { $ } from "bun";
import { exists, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = import.meta.dir;
const derivedData = join(root, "build");
const simulatorName = Bun.env.OG_SIMULATOR ?? "og-ios-test";
const cleanXcodeEnv = ["/usr/bin/env", "-u", "DEVELOPER_DIR", "-u", "SDKROOT"];

interface SimulatorListing {
	devices: Record<string, { name: string; udid: string }[]>;
}

async function simulatorId(): Promise<string> {
	const listing: SimulatorListing =
		await $`${cleanXcodeEnv} xcrun simctl list devices --json`.json();
	for (const devices of Object.values(listing.devices)) {
		const device = devices.find(
			(candidate) => candidate.name === simulatorName,
		);
		if (device) return device.udid;
	}
	throw new Error(`no simulator named ${simulatorName}`);
}

async function testRun(): Promise<string | undefined> {
	const products = join(derivedData, "Build", "Products");
	if (!(await exists(products))) return undefined;
	for await (const file of new Bun.Glob("*.xctestrun").scan({
		cwd: products,
	})) {
		return join(products, file);
	}
	return undefined;
}

async function build(destination: string): Promise<string> {
	await $`xcodegen generate --spec ${join(root, "project.yml")} --quiet`;
	await $`${cleanXcodeEnv} xcodebuild build-for-testing -project ${join(root, "OpenGrindUITests.xcodeproj")} -scheme OpenGrindUITests -destination ${destination} -derivedDataPath ${derivedData} -quiet`;
	const run = await testRun();
	if (!run) throw new Error("build-for-testing produced no .xctestrun");
	return run;
}

const usage = `usage: bun e2e/ios/drive.ts <steps.json | '[{"tap":"Get started"}]'>

Runs on the simulator named OG_SIMULATOR (default og-ios-test), which must exist and boots if it is shut down. OG_REBUILD=1 rebuilds the runner.

Steps (labels match label, identifier or placeholder; points are normalized 0..1):
	{"launch": true} | {"activate": true} | {"home": true}
	{"rotate": "portrait" | "landscapeLeft" | "landscapeRight"}
	{"pasteboardImage": "<host png path>"} | {"pasteboardText": "<host text file path>"} (for secrets: the text never enters a log, unlike "type")
	{"tap": label} | {"tapIfPresent": label} | {"doubleTap": label} | {"tapSecure": label} (a secure text field, not its <label>)
	{"press": label, "seconds": 1}
	{"springboard": label} taps a SpringBoard element, such as a system alert button ("Allow While Using App")
	{"tapAt": [x, y]} | {"drag": [x1, y1, x2, y2]}
	{"dragHold": {"path": [x1, y1, x2, y2], "hold": 2, "velocity": 1000, "screenshot": path, "tree": path}}
	{"type": text} | {"swipe": "up" | "down" | "left" | "right", "on": label}
	{"wait": seconds} | {"expect": label} | {"expectGone": label} | {"keyboard": true | false}
	{"screenshot": "<host path>"} | {"tree": "<host path>"}

dragHold presses, drags at velocity points/s and holds without lifting; it captures once, about hold/2 into the hold, timed from the call because the gesture runs as one synthesized event. The gesture starts about 0.5 s after the call, so keep hold at 2 s or more.
Screenshots keep the portrait pixel buffer, so landscape content comes out rotated; tree frames follow the app's orientation.
Runs that need the software keyboard need: defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false`;

const [stepsArgument] = Bun.argv.slice(2);
if (!stepsArgument) {
	console.error(usage);
	process.exit(2);
}

const udid = await simulatorId();
const destination = `platform=iOS Simulator,id=${udid}`;
await $`${cleanXcodeEnv} xcrun simctl bootstatus ${udid} -b`.quiet();

const run = Bun.env.OG_REBUILD
	? await build(destination)
	: ((await testRun()) ?? (await build(destination)));

let stepsPath = stepsArgument;
if (stepsArgument.trimStart().startsWith("[")) {
	stepsPath = join(await mkdtemp(join(tmpdir(), "og-steps-")), "steps.json");
	await writeFile(stepsPath, stepsArgument);
}

const result =
	await $`${cleanXcodeEnv} xcodebuild test-without-building -xctestrun ${run} -destination ${destination} -only-testing:OpenGrindUITests/Driver/testSteps -collect-test-diagnostics never`
		.env({ ...process.env, TEST_RUNNER_OG_STEPS: stepsPath })
		.nothrow()
		.quiet();
const output = result.stdout.toString() + result.stderr.toString();
const failures = output
	.split("\n")
	.filter((line) => /error:|failed|XCTAssert|no element labelled/.test(line));
console.log(
	result.exitCode === 0
		? "steps passed"
		: `steps failed:\n${failures.join("\n")}`,
);
process.exit(result.exitCode);
