import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { collectedRoots } from "./collected-roots";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const packageRootOf = (id: string) => {
	const normalized = id.replaceAll("\\", "/").replace(/^\0|[?#].*$/g, "");
	const marker = "/node_modules/";
	const at = normalized.lastIndexOf(marker);
	if (at === -1) return null;
	const [first, second] = normalized.slice(at + marker.length).split("/");
	const name = first?.startsWith("@") ? `${first}/${second}` : first;
	return name ? normalized.slice(0, at + marker.length) + name : null;
};

const collectClientBundle: Plugin = {
	name: "og-credits-collect",
	enforce: "post",
	apply: "build",

	generateBundle(_options, bundle) {
		if (this.environment.name !== "client") return;
		const roots = collectedRoots();
		const record = (id: string) => {
			const root = packageRootOf(id);
			if (root) roots.add(root);
		};
		for (const output of Object.values(bundle)) {
			if (output.type === "chunk") {
				for (const id of output.moduleIds) record(id);
			} else {
				for (const origin of output.originalFileNames) {
					record(path.resolve(repoRoot, origin));
				}
			}
		}
		this.error("collected the client bundle");
	},
};

const { default: config } = await import(
	pathToFileURL(path.join(repoRoot, "vite.config.mjs")).href
);
const base = await config({ command: "build", mode: "production" });

export default { ...base, plugins: [...base.plugins, collectClientBundle] };
