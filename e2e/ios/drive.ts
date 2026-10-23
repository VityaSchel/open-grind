import { $ } from "bun";
import { exists, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = import.meta.dir;
const derivedData = join(root, "build");
const simulatorName = Bun.env.OG_SIMULATOR ?? "og-ios-test";
const xcrun = ["/usr/bin/env", "-u", "DEVELOPER_DIR", "-u", "SDKROOT"];

interface SimulatorListing {
	devices: Record<string, { name: string; udid: string }[]>;
}

async function simulatorId(): Promise<string> {
	const listing: SimulatorListing =
		await $`${xcrun} xcrun simctl list devices --json`.json();
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
	await $`${xcrun} xcodebuild build-for-testing -project ${join(root, "OpenGrindUITests.xcodeproj")} -scheme OpenGrindUITests -destination ${destination} -derivedDataPath ${derivedData} -quiet`;
	const run = await testRun();
	if (!run) throw new Error("build-for-testing produced no .xctestrun");
	return run;
}

const [stepsArgument] = Bun.argv.slice(2);
if (!stepsArgument) {
	throw new Error(
		'usage: bun e2e/ios/drive.ts <steps.json | \'[{"tap":"Get started"}]\'>',
	);
}

const udid = await simulatorId();
const destination = `platform=iOS Simulator,id=${udid}`;
await $`${xcrun} xcrun simctl boot ${udid}`.nothrow().quiet();
await $`${xcrun} xcrun simctl bootstatus ${udid} -b`.quiet();

const run = Bun.env.OG_REBUILD
	? await build(destination)
	: ((await testRun()) ?? (await build(destination)));

let stepsPath = stepsArgument;
if (stepsArgument.trimStart().startsWith("[")) {
	stepsPath = join(await mkdtemp(join(tmpdir(), "og-steps-")), "steps.json");
	await writeFile(stepsPath, stepsArgument);
}

const result =
	await $`${xcrun} xcodebuild test-without-building -xctestrun ${run} -destination ${destination} -only-testing:OpenGrindUITests/Driver/testSteps`
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
