import path from "node:path";

import { planRename, type RenamePlan } from "./rename-plan";

const ROOT = path.join(import.meta.dir, "../..");

function fail(reason: string): never {
	console.error(`error: ${reason}`);
	process.exit(1);
}

const args = process.argv.slice(2);
const [from, to] = args;
if (args.length !== 2 || from === undefined || to === undefined) {
	fail(
		"usage: bun scripts/i18n/rename-key.ts <old key> <new key>, both full keys such as common.actions.close",
	);
}

let plan: RenamePlan;
try {
	plan = planRename({ root: ROOT, from, to });
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}

for (const { file, text } of [...plan.catalogs, ...plan.references]) {
	await Bun.write(path.join(ROOT, file), text);
}

console.log(
	`moved ${from} to ${to} in ${plan.catalogs.length} catalog files and ${plan.references.length} files that name it`,
);
for (const note of plan.undecided) console.warn(`warning: ${note}`);

const generate = Bun.spawnSync([process.execPath, "run", "gen:i18n"], {
	cwd: ROOT,
	stdout: "inherit",
	stderr: "inherit",
});
process.exit(generate.exitCode);
