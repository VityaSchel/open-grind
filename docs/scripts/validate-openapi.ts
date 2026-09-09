import { readFileSync } from "fs";

import { SKIP_TAGS } from "./generator/context";
import type { OpenApiDoc } from "./generator/types";
import { HTTP_METHODS } from "./generator/types";

const doc = JSON.parse(readFileSync("lib/openapi.json", "utf8")) as OpenApiDoc;
const errors: string[] = [];
const warnings: string[] = [];

function err(msg: string): void {
	errors.push(msg);
}
function warn(msg: string): void {
	warnings.push(msg);
}

for (const [p, item] of Object.entries(doc.paths)) {
	for (const m of HTTP_METHODS) {
		const op = item[m];
		if (!op?.responses) continue;
		for (const [code, resp] of Object.entries(op.responses)) {
			if (!/^(1\d\d|2\d\d|3\d\d|4\d\d|5\d\d|default)$/.test(code)) {
				err(
					`${m.toUpperCase()} ${p}: response key "${code}" is not a valid HTTP status code`,
				);
			}
			if (typeof resp?.description !== "string") {
				err(`${m.toUpperCase()} ${p}: response ${code} missing description`);
			}
		}
	}
}

function walk(node: unknown, path: string): void {
	if (Array.isArray(node)) {
		node.forEach((v, i) => walk(v, `${path}[${i}]`));
		return;
	}
	if (node && typeof node === "object") {
		const obj = node as Record<string, unknown>;
		if (typeof obj["$ref"] === "string" && Object.keys(obj).length > 1) {
			err(
				`${path}: $ref has sibling properties ${JSON.stringify(Object.keys(obj).filter((k) => k !== "$ref"))}`,
			);
		}
		for (const [k, v] of Object.entries(obj)) walk(v, `${path}.${k}`);
	}
}
walk(doc, "");

for (const [p, item] of Object.entries(doc.paths)) {
	const templated = [...p.matchAll(/\{([^}]+)\}/g)].map((x) => x[1] ?? "");
	for (const m of HTTP_METHODS) {
		const op = item[m];
		if (!op) continue;
		const declared = new Set();
		for (const param of [
			...(item.parameters ?? []),
			...(op.parameters ?? []),
		]) {
			if ("$ref" in param) {
				const ref = param.$ref.replace("#/components/parameters/", "");
				const resolved = doc.components.parameters?.[ref];
				if (resolved?.in === "path") declared.add(resolved.name);
			} else if (param.in === "path") declared.add(param.name);
		}
		for (const name of templated) {
			if (!declared.has(name)) {
				err(
					`${m.toUpperCase()} ${p}: path template {${name}} has no matching path parameter`,
				);
			}
		}
	}
}

{
	const leafTags = new Set<string>();
	const groupTags = new Set<string>();
	for (const entry of doc["x-sidebar-order"] ?? []) {
		if (typeof entry === "string") leafTags.add(entry);
		else {
			groupTags.add(entry.group);
			for (const tag of entry.items) leafTags.add(tag);
		}
	}
	const declared = new Set(doc.tags.map((t) => t.name));
	for (const tag of [...leafTags, ...groupTags]) {
		if (!declared.has(tag)) {
			err(`x-sidebar-order lists "${tag}", which is not declared in tags[]`);
		}
	}
	for (const [p, item] of Object.entries(doc.paths)) {
		for (const m of HTTP_METHODS) {
			const op = item[m];
			if (!op) continue;
			const tags = op.tags ?? [];
			if (tags.some((t) => leafTags.has(t) || SKIP_TAGS.has(t))) continue;
			err(
				`${m.toUpperCase()} ${p}: tagged ${JSON.stringify(tags)}, none of which is a leaf in x-sidebar-order — it lands on the group's overview page instead of getting a page of its own`,
			);
		}
	}
}

{
	const defined = new Set(Object.keys(doc.components.schemas));
	const used = new Set<string>();
	function w(n: unknown): void {
		if (Array.isArray(n)) {
			n.forEach(w);
			return;
		}
		if (n && typeof n === "object") {
			const obj = n as Record<string, unknown>;
			const ref = obj["$ref"];
			if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
				used.add(ref.replace("#/components/schemas/", ""));
			}
			for (const v of Object.values(obj)) w(v);
		}
	}
	w(doc);
	for (const name of defined) {
		if (used.has(name)) continue;
		if (doc.components.schemas[name]?.["x-render-on-tag"]) continue;
		warn(`schema "${name}" is defined but never referenced`);
	}
}

for (const [p, item] of Object.entries(doc.paths)) {
	for (const m of ["get", "head", "delete"] as const) {
		if (item[m]?.requestBody) {
			warn(
				`${m.toUpperCase()} ${p}: requestBody on ${m.toUpperCase()} is allowed but discouraged`,
			);
		}
	}
}

console.log(`Errors:   ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
if (errors.length) {
	console.log("\n— Errors —");
	for (const e of errors) console.log("  " + e);
}
if (warnings.length) {
	console.log("\n— Warnings —");
	for (const w of warnings.slice(0, 50)) console.log("  " + w);
	if (warnings.length > 50)
		console.log(`  ... and ${warnings.length - 50} more`);
}
process.exit(errors.length ? 1 : 0);
