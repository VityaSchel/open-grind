import fs from "node:fs";
import path from "node:path";
import { build } from "vite";
import { collectedRoots } from "./collected-roots.ts";

const [rootsFile] = process.argv.slice(2);
if (!rootsFile) throw new Error("usage: node collect-client.ts <roots file>");

const failure = await build({
	configFile: path.join(import.meta.dirname, "vite.config.collect.ts"),
	logLevel: "silent",
}).then(
	() => null,
	(error: unknown) => error,
);

const roots = collectedRoots();
if (roots.size === 0) {
	if (failure === null) {
		throw new Error("the credits collector never saw the client bundle");
	}
	throw failure instanceof Error
		? failure
		: new Error(String(failure), { cause: failure });
}
fs.writeFileSync(rootsFile, JSON.stringify([...roots]));
