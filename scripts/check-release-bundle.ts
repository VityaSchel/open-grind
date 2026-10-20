import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";

const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url));
const SOURCE_DIR = join(REPO_ROOT, "src");
const DEMO_DIR = join(SOURCE_DIR, "lib", "demo");
const FIXTURE_DIR = join(DEMO_DIR, "mock");
const BUILD_DIR = join(REPO_ROOT, "build");
const APP_SOURCES = "**/*.{ts,js,svelte,json,css,html}";
const TEST_ONLY = /\.test\.ts$|^test-setup\.ts$/;
const MIN_FIXTURE_LENGTH = 10;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const ESCAPED_IN_BUNDLE = /["'`\\]|\$\{/;
const MEDIA_TYPE = String.raw`(?:application|audio|font|image|model|text|video)/[\w.+-]+`;
const BARE_MEDIA_TYPE = new RegExp(`^${MEDIA_TYPE}$`);
const DATA_URL_PREFIX = new RegExp(
	String.raw`^data:(?:${MEDIA_TYPE})?(?:;[\w.+-]+(?:=[\w.+-]+)?)*,$`,
);

type Fixture = { text: string; source: string };

function literalTexts(file: ts.SourceFile): string[] {
	const texts: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isImportDeclaration(node) ||
			ts.isExportDeclaration(node) ||
			ts.isTypeNode(node)
		) {
			return;
		}
		if (
			ts.isStringLiteral(node) ||
			ts.isNoSubstitutionTemplateLiteral(node) ||
			ts.isTemplateHead(node) ||
			ts.isTemplateMiddle(node) ||
			ts.isTemplateTail(node)
		) {
			texts.push(node.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return texts;
}

function distinctive(text: string): boolean {
	return (
		text.length >= MIN_FIXTURE_LENGTH &&
		PRINTABLE_ASCII.test(text) &&
		!ESCAPED_IN_BUNDLE.test(text) &&
		!BARE_MEDIA_TYPE.test(text) &&
		!DATA_URL_PREFIX.test(text)
	);
}

async function appSourceText(): Promise<string> {
	const texts: string[] = [];
	for await (const path of new Bun.Glob(APP_SOURCES).scan(SOURCE_DIR)) {
		const absolute = join(SOURCE_DIR, path);
		if (!absolute.startsWith(`${DEMO_DIR}/`) && !TEST_ONLY.test(path)) {
			texts.push(await Bun.file(absolute).text());
		}
	}
	return texts.join("\n");
}

async function demoFixtures(): Promise<Fixture[]> {
	const appText = await appSourceText();
	const fixtures = new Map<string, Fixture>();
	for await (const path of new Bun.Glob("**/*.ts").scan(FIXTURE_DIR)) {
		if (TEST_ONLY.test(path)) continue;
		const file = ts.createSourceFile(
			path,
			await Bun.file(join(FIXTURE_DIR, path)).text(),
			ts.ScriptTarget.Latest,
		);
		for (const text of literalTexts(file)) {
			if (distinctive(text) && !appText.includes(text)) {
				fixtures.set(text, {
					text,
					source: relative(REPO_ROOT, join(FIXTURE_DIR, path)),
				});
			}
		}
	}
	return [...fixtures.values()];
}

async function bundleFiles(): Promise<{ path: string; text: string }[]> {
	const files: { path: string; text: string }[] = [];
	if (!existsSync(BUILD_DIR)) return files;
	for await (const path of new Bun.Glob("**/*").scan(BUILD_DIR)) {
		files.push({
			path,
			text: await Bun.file(join(BUILD_DIR, path)).text(),
		});
	}
	return files;
}

if (Bun.env.OPEN_GRIND_DEMO === "1") {
	console.log("OPEN_GRIND_DEMO=1 builds the demo, so its fixtures may ship");
	process.exit(0);
}

const fixtures = await demoFixtures();
if (fixtures.length === 0) {
	console.error(
		`error: found no fixture text in ${relative(REPO_ROOT, FIXTURE_DIR)}`,
	);
	process.exit(1);
}
const files = await bundleFiles();
if (files.length === 0) {
	console.error(`error: ${relative(REPO_ROOT, BUILD_DIR)}/ holds no build`);
	process.exit(1);
}

const leaks = fixtures.flatMap(({ text, source }) =>
	files
		.filter((file) => file.text.includes(text))
		.map((file) => `build/${file.path}: "${text}" from ${source}`),
);
if (leaks.length > 0) {
	console.error("error: demo fixture text ships in the release build");
	for (const leak of leaks) console.error(`  ${leak}`);
	process.exit(1);
}
console.log(
	`build/: none of ${fixtures.length} demo fixture strings in ${files.length} files`,
);
