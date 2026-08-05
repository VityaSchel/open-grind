import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

import { loadContext, SKIP_TAGS } from "./generator/context";
import { renderSharedPage, renderTagPage } from "./generator/pages";
import { tagFilePath } from "./generator/slugs";

const OUT_DIR = "content/generated/grindr-api";

function writeFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

const ctx = loadContext("lib/openapi.json");
const realTagNames = new Set(ctx.doc.tags.map((t) => t.name));
let written = 0;

for (const t of ctx.doc.tags) {
	if (SKIP_TAGS.has(t.name)) continue;
	writeFile(tagFilePath(OUT_DIR, t.name), renderTagPage(ctx, t.name));
	written++;
}

for (const pageName of ctx.schemasByPage.keys()) {
	if (realTagNames.has(pageName)) continue;
	if ((ctx.schemasByPage.get(pageName) || []).length === 0) continue;
	writeFile(tagFilePath(OUT_DIR, pageName), renderSharedPage(ctx, pageName));
	written++;
}

console.log(`Generated ${written} markdown files.`);
