import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = "content/grindr-api";
const GENERATED = "content/generated/grindr-api";

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir)) {
		const full = join(dir, e);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (e.endsWith(".md")) out.push(full);
	}
	return out;
}

function pageOf(filePath: string): string {
	return filePath
		.replace(/^content\/(?:generated\/)?/, "/")
		.replace(/\.md$/, "");
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function collectAnchors(filePath: string): Set<string> {
	const content = readFileSync(filePath, "utf8");
	const anchors = new Set<string>([""]);
	for (const m of content.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
		anchors.add(slugify(m[1] ?? ""));
	}
	return anchors;
}

const pages = new Map<string, Set<string>>();
function register(route: string, anchors: Set<string>): void {
	const existing = pages.get(route);
	if (existing) for (const a of anchors) existing.add(a);
	else pages.set(route, new Set(anchors));
}
for (const f of [...walk(ROOT), ...walk(GENERATED)]) {
	const route = pageOf(f);
	const anchors = collectAnchors(f);
	register(route, anchors);
	if (route.endsWith("/index")) {
		register(route.slice(0, -"/index".length), anchors);
		register(route.slice(0, -"index".length), anchors);
	}
}

interface Broken {
	file: string;
	link: string;
	label: string;
	reason: string;
}

const broken: Broken[] = [];
const linkRe = /\[([^\]]*)\]\((\/grindr-api\/[^)#\s]*)(#[^)\s]+)?\)/g;

for (const f of walk(ROOT)) {
	const content = readFileSync(f, "utf8");
	const fromPage = pageOf(f);
	for (const m of content.matchAll(linkRe)) {
		const label = m[1] ?? "";
		const path = m[2] ?? "";
		const hash = m[3];
		const anchor = hash ? hash.slice(1) : "";
		const anchors = pages.get(path);
		if (!anchors) {
			broken.push({
				file: fromPage,
				link: `${path}${hash ?? ""}`,
				label,
				reason: "missing page",
			});
			continue;
		}
		if (anchor && !anchors.has(anchor)) {
			broken.push({
				file: fromPage,
				link: `${path}${hash ?? ""}`,
				label,
				reason: "missing anchor",
			});
		}
	}
}

const grouped = new Map<
	string,
	{ reason: string; label: string; refs: string[] }
>();
for (const b of broken) {
	const existing = grouped.get(b.link) ?? {
		reason: b.reason,
		label: b.label,
		refs: [],
	};
	existing.refs.push(b.file);
	grouped.set(b.link, existing);
}

console.log(`Total broken link occurrences: ${broken.length}`);
console.log(`Unique broken targets: ${grouped.size}\n`);
const sorted = [...grouped.entries()].sort(
	(a, b) => b[1].refs.length - a[1].refs.length,
);
for (const [link, info] of sorted) {
	const sample =
		info.refs.slice(0, 3).join(", ") +
		(info.refs.length > 3 ? ` +${info.refs.length - 3}` : "");
	console.log(
		`  ${info.reason}: ${link}  (${info.refs.length}x) "${info.label}"  [${sample}]`,
	);
}
