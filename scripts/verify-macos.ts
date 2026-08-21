import { $ } from "bun";

import { only } from "./lib/only";

const root = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(
	/\/$/,
	"",
);

async function unpack(source: string, into: string): Promise<string> {
	await $`mkdir -p ${into}`;
	if (source.endsWith(".zip")) {
		await $`ditto -x -k ${source} ${into}`;
		return only("*.app", into);
	}
	const copy = `${into}/${source.split("/").pop()}`;
	await $`ditto ${source} ${copy}`;
	return copy;
}

async function normalize(app: string): Promise<void> {
	await $`codesign --force --deep --sign - ${app}`.quiet();
	await $`codesign --remove-signature ${app}`.quiet();
	await $`rm -rf ${app}/Contents/_CodeSignature ${app}/Contents/CodeResources`;
}

const published = Bun.argv[2];
if (!published) {
	throw new Error(
		"usage: bun scripts/verify-macos.ts <published.zip|.app> [local.zip|.app]",
	);
}
const local = Bun.argv[3];

const scratch = (await $`mktemp -d`.text()).trim();
try {
	const theirs = await unpack(published, `${scratch}/published`);
	const ours = await unpack(
		local ??
			(await only(
				"*.app",
				`${root}/src-tauri/target/release/bundle/macos`,
			)),
		`${scratch}/local`,
	);

	await normalize(theirs);
	await normalize(ours);

	const comparison = await $`diff -r ${theirs} ${ours}`.nothrow().quiet();
	if (comparison.exitCode !== 0) {
		throw new Error(
			`${published} does not reproduce ${local ?? "the local build"}\n\n${comparison.stdout.toString()}`,
		);
	}
	console.log(`identical: ${published} reproduces from this source`);
} finally {
	await $`rm -rf ${scratch}`;
}
