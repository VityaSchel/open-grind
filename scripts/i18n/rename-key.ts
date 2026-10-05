import path from "node:path";

import { LOCALES, readLocaleFiles } from "./locale-files";
import { type LocaleFile, moveMessage, renameLiterals } from "./move-message";

const ROOT = path.join(import.meta.dir, "../..");
const SOURCES = new Bun.Glob("src/**/*.{js,ts,svelte}");

function fail(reason: string): never {
	console.error(`error: ${reason}`);
	process.exit(1);
}

const args = process.argv.slice(2);
const [from, to] = args;
if (args.length !== 2 || from === undefined || to === undefined) {
	fail("usage: bun scripts/i18n/rename-key.ts <old> <new>");
}

const catalogs = [...readLocaleFiles(LOCALES)].flatMap(([locale, files]) =>
	files.map(({ namespace, text }) => ({ locale, namespace, text })),
);

let moved: LocaleFile[] = [];
try {
	moved = moveMessage({ files: catalogs, from, to });
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}

for (const { locale, namespace, text } of moved) {
	await Bun.write(path.join(LOCALES, locale, `${namespace}.json`), text);
}

let rewritten = 0;
for (const relative of SOURCES.scanSync({ cwd: ROOT })) {
	const file = Bun.file(path.join(ROOT, relative));
	const text = await file.text();
	const renamed = renameLiterals({ text, from, to });
	if (renamed !== text) {
		await Bun.write(file, renamed);
		rewritten += 1;
	}
}

console.log(
	`moved ${from} to ${to} in ${moved.length} catalog files and ${rewritten} source files`,
);

const generate = Bun.spawnSync([process.execPath, "run", "gen:i18n"], {
	cwd: ROOT,
	stdout: "inherit",
	stderr: "inherit",
});
process.exit(generate.exitCode);
