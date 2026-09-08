import fs from "node:fs";
import path from "node:path";
import { build } from "vite";
import { collectedRoots } from "./collected-roots";
import { hashText } from "./hash";
import { cssImportsCreditedElsewhere, npmOverrides } from "./npm-overrides";
import type { CreditEntry, CreditsChunk } from "./types";

const repoRoot = path.resolve(import.meta.dir, "../..");
const textsDir = path.join(import.meta.dir, "texts");
const sourceDir = path.join(repoRoot, "src");
const collectConfig = path.join(import.meta.dir, "vite.config.collect.ts");
const svelteConfig = path.join(repoRoot, "svelte.config.js");

const licenseFilePattern =
	/^((third[-._]?party[-._]?)?(licen[cs]es?|copying|unlicen[cs]e|notices?))([-._][a-z0-9._+-]*)?$/i;
const licenseDirectoryPattern = /^(licen[cs]es|license-files)$/i;
const textExtension = /\.(md|txt|markdown|rst)$/i;
const metadataExtension = /\.(spdx|json|m?js|cjs|ts|xml|ya?ml|html?)$/i;
const cssImportPattern = /@import\s+(?:url\()?\s*["']([^"']+)["']/g;

const isLicenseFile = (name: string) =>
	!metadataExtension.test(name) &&
	licenseFilePattern.test(name.replace(textExtension, ""));

const warn = (message: string) => console.warn(`credits/npm: ${message}`);

type PackageManifest = {
	name?: string;
	version?: string;
	license?: string | { type?: string };
	licenses?: Array<string | { type?: string }>;
	homepage?: string;
	repository?: string | { url?: string };
};

const licenseName = (value: string | { type?: string } | undefined) =>
	typeof value === "string" ? value : (value?.type ?? "");

const declaredLicense = ({ license, licenses }: PackageManifest) =>
	licenseName(license) ||
	(licenses ?? []).map(licenseName).filter(Boolean).join(" OR ") ||
	"UNKNOWN";

const repositoryUrl = ({ repository, homepage }: PackageManifest) => {
	const raw = typeof repository === "string" ? repository : repository?.url;
	if (!raw) return homepage;
	const shorthand = /^(github|gitlab|bitbucket):(.+)$/.exec(raw);
	const url = (
		shorthand
			? `https://${shorthand[1]}.com/${shorthand[2]}`
			: raw
					.replace(/^git\+/, "")
					.replace(/^git:\/\//, "https://")
					.replace(/^ssh:\/\/git@/, "https://")
					.replace(/^git@([^:]+):/, "https://$1/")
	).replace(/\.git$/, "");
	if (!url) return homepage;
	return /^[\w.-]+\/[\w.-]+$/.test(url) ? `https://github.com/${url}` : url;
};

const sortedNames = (dir: string, wanted: (entry: fs.Dirent) => boolean) =>
	fs
		.readdirSync(dir, { withFileTypes: true })
		.filter(wanted)
		.map((entry) => entry.name)
		.sort();

const licenseTexts = (packageRoot: string) => {
	const files = sortedNames(
		packageRoot,
		(entry) => !entry.isDirectory() && isLicenseFile(entry.name),
	).map((name) => path.join(packageRoot, name));
	for (const directory of sortedNames(
		packageRoot,
		(entry) =>
			entry.isDirectory() && licenseDirectoryPattern.test(entry.name),
	)) {
		const dir = path.join(packageRoot, directory);
		files.push(
			...sortedNames(
				dir,
				(entry) =>
					!entry.isDirectory() && !metadataExtension.test(entry.name),
			).map((name) => path.join(dir, name)),
		);
	}
	return files
		.map((file) => fs.readFileSync(file, "utf-8"))
		.filter((text) => text.trim());
};

const overrideFor = (name: string, version: string | undefined) => {
	const override = npmOverrides[name];
	if (!override) return undefined;
	if (!override.versions.includes(version ?? "")) {
		throw new Error(
			`${name}@${version} is not one of the versions its license override was verified against (${override.versions.join(", ")}). Re-check the package against ${override.source}, then widen the override.`,
		);
	}
	return override;
};

const overrideTexts = (override: { textFiles?: string[] } | undefined) =>
	(override?.textFiles ?? []).map((file) =>
		fs.readFileSync(path.join(textsDir, file), "utf-8"),
	);

const packageNameOf = (specifier: string) => {
	const [first, second] = specifier.split("/");
	return first!.startsWith("@") ? `${first}/${second}` : first!;
};

const cssPackageRoots = () => {
	const roots = new Set<string>();
	const styleSheets = [
		...new Bun.Glob("**/*.css").scanSync({
			cwd: sourceDir,
			absolute: true,
		}),
	].sort();
	for (const file of styleSheets) {
		const source = fs.readFileSync(file, "utf-8");
		for (const [, specifier] of source.matchAll(cssImportPattern)) {
			if (/^([a-z]+:|\/|\.)/i.test(specifier!)) continue;
			const name = packageNameOf(specifier!);
			if (cssImportsCreditedElsewhere.includes(name)) continue;
			const root = path.join(repoRoot, "node_modules", name);
			if (fs.existsSync(path.join(root, "package.json"))) roots.add(root);
			else
				warn(
					`css @import "${specifier}" in ${path.relative(repoRoot, file)} resolved to no package`,
				);
		}
	}
	return [...roots];
};

const serviceWorkerBase = path.join(sourceDir, "service-worker");

const isFile = (file: string) =>
	fs.existsSync(file) && fs.statSync(file).isFile();

const serviceWorkerEntry = () => {
	if (fs.readFileSync(svelteConfig, "utf-8").includes("serviceWorker")) {
		return "a service worker path configured in svelte.config.js";
	}
	const entry = [
		serviceWorkerBase,
		`${serviceWorkerBase}.js`,
		`${serviceWorkerBase}.ts`,
		path.join(serviceWorkerBase, "index.js"),
		path.join(serviceWorkerBase, "index.ts"),
	].find(isFile);
	return entry && path.relative(repoRoot, entry);
};

const bundledPackageRoots = async () => {
	const serviceWorker = serviceWorkerEntry();
	if (serviceWorker) {
		throw new Error(
			`SvelteKit builds ${serviceWorker} after the client bundle, ` +
				"which this collector aborts on, so its imports would go uncredited. Collect that bundle too.",
		);
	}

	const roots = collectedRoots();
	roots.clear();
	const cwd = process.cwd();
	process.chdir(repoRoot);
	const failure = await build({
		configFile: collectConfig,
		logLevel: "silent",
	}).then(
		() => null,
		(error: unknown) => error,
	);
	process.chdir(cwd);

	if (roots.size === 0) {
		if (failure === null) {
			throw new Error(
				"the credits collector never saw the client bundle",
			);
		}
		throw failure instanceof Error
			? failure
			: new Error(String(failure), { cause: failure });
	}
	return [...roots];
};

export const collectNpmCredits = async (): Promise<CreditsChunk> => {
	const manifests = new Map<
		string,
		{ root: string; manifest: PackageManifest }
	>();
	for (const root of [...(await bundledPackageRoots()), ...cssPackageRoots()]
		.filter((root) => !path.basename(root).startsWith("."))
		.sort()) {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(root, "package.json"), "utf-8"),
		) as PackageManifest;
		if (!manifest.name) throw new Error(`${root}/package.json has no name`);
		const key = `${manifest.name}@${manifest.version ?? ""}`;
		if (!manifests.has(key)) manifests.set(key, { root, manifest });
	}

	const versionsByName = Map.groupBy(
		manifests.values(),
		({ manifest }) => manifest.name!,
	);

	const texts: Record<string, string> = {};
	const entries = [...manifests.values()].map(
		({ root, manifest }): CreditEntry => {
			const name = manifest.name!;
			const found = licenseTexts(root);
			const declared = declaredLicense(manifest);
			const override =
				found.length > 0 && declared !== "UNKNOWN"
					? undefined
					: overrideFor(name, manifest.version);
			const textHashes = [
				...new Set(
					(found.length > 0 ? found : overrideTexts(override)).map(
						(text) => {
							const hash = hashText(text);
							texts[hash] = text;
							return hash;
						},
					),
				),
			];
			return {
				id:
					versionsByName.get(name)!.length > 1
						? `${name}@${manifest.version}`
						: name,
				name,
				version: manifest.version,
				ecosystem: "npm",
				spdx:
					declared === "UNKNOWN"
						? (override?.spdx ?? declared)
						: declared,
				url: repositoryUrl(manifest),
				textHashes,
			};
		},
	);

	const uncredited = (what: string, culprits: CreditEntry[]) =>
		culprits.length === 0
			? []
			: [
					`${what}: ${culprits.map((it) => `${it.name}@${it.version ?? ""}`).join(", ")}`,
				];
	const gaps = [
		...uncredited(
			"shipped with no license text to reproduce",
			entries.filter((it) => it.textHashes.length === 0),
		),
		...uncredited(
			"shipped with no license to name",
			entries.filter((it) => it.spdx === "UNKNOWN"),
		),
	];
	if (gaps.length > 0) {
		throw new Error(
			`${gaps.join("; ")}. Add an entry to scripts/credits/npm-overrides.ts recording where the license came from.`,
		);
	}

	return { entries, texts };
};
