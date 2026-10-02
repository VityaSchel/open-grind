import fs from "node:fs";
import path from "node:path";
import {
	misplacedAnchors,
	platformOfTriple,
	scopeLabel,
	targetTriples,
	unshippedTargets,
} from "./credits/platforms";
import { requiredCargoAbout } from "./credits/rust";
import { highlights } from "../src/lib/credits/highlights";
import { type CreditPlatform, creditPlatforms } from "../src/lib/credits/types";

const repoRoot = path.resolve(import.meta.dir, "..");

const read = (relative: string) =>
	fs.readFileSync(path.join(repoRoot, relative), "utf-8");

type GeneratedEntry = {
	id: string;
	name: string;
	ecosystem: string;
	platform?: string;
	versions: string[];
	textHashes: string[];
};

const credits = JSON.parse(read("src/lib/credits/generated.json")) as {
	entries: GeneratedEntry[];
	texts: { hash: string; text: string }[];
};

const problems: string[] = [];
const report = (problem: string) => problems.push(problem);

const lockedVersions = (source: string, pattern: RegExp) => {
	const locked = new Map<string, Set<string>>();
	for (const [, name, version] of source.matchAll(pattern)) {
		const versions = locked.get(name!) ?? new Set();
		versions.add(version!);
		locked.set(name!, versions);
	}
	return locked;
};

const checkAgainstLockfile = ({
	ecosystem,
	lockfile,
	pattern,
}: {
	ecosystem: string;
	lockfile: string;
	pattern: RegExp;
}) => {
	const locked = lockedVersions(read(lockfile), pattern);
	for (const entry of credits.entries.filter(
		(it) => it.ecosystem === ecosystem,
	)) {
		for (const version of entry.versions.flatMap((it) => it.split(", "))) {
			if (locked.get(entry.name)?.has(version)) continue;
			const held = [...(locked.get(entry.name) ?? [])].join(", ");
			report(
				`${entry.name} is credited at ${version}, but ${lockfile} holds ${held || "no such package"}`,
			);
		}
	}
};

checkAgainstLockfile({
	ecosystem: "rust",
	lockfile: "src-tauri/Cargo.lock",
	pattern: /^\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/gm,
});

checkAgainstLockfile({
	ecosystem: "npm",
	lockfile: "bun.lock",
	pattern: /\["((?:@[^"@/]+\/)?[^"@/][^"@]*)@([^"]+)"/g,
});

const credited = new Set(
	credits.entries.map((entry) => `${entry.ecosystem}:${entry.id}`),
);
for (const highlight of highlights) {
	const ref = `${highlight.ref.ecosystem}:${highlight.ref.id}`;
	if (!credited.has(ref)) {
		report(
			`the thank-you card for ${highlight.name} points at ${ref}, which nothing credits, so it would render without its license`,
		);
	}
}

const auditedTargets = targetTriples(read("src-tauri/about.toml"));
const deniedTargets = targetTriples(read("deny.toml"));
if (auditedTargets.join() !== deniedTargets.join()) {
	report(
		`src-tauri/about.toml audits ${auditedTargets.join(", ")} but deny.toml audits ${deniedTargets.join(", ")}`,
	);
}

const auditedPlatforms = new Set<CreditPlatform>();
for (const triple of auditedTargets) {
	try {
		auditedPlatforms.add(platformOfTriple(triple));
	} catch (error) {
		report((error as Error).message);
	}
}
for (const platform of creditPlatforms) {
	if (!auditedPlatforms.has(platform)) {
		report(
			`src-tauri/about.toml audits no ${platform} target, so nothing can be credited as ${platform}-only`,
		);
	}
}

const installedButUnaudited = targetTriples(read("rust-toolchain.toml")).filter(
	(triple) => !auditedTargets.includes(triple),
);
if (installedButUnaudited.join() !== unshippedTargets.toSorted().join()) {
	report(
		`rust-toolchain.toml installs ${installedButUnaudited.join(", ") || "no targets"} beyond the audited ones, but unshippedTargets expects ${unshippedTargets.join(", ") || "none"}: a target that starts shipping must be audited in src-tauri/about.toml, or the single-platform labels stop being true`,
	);
}

for (const entry of credits.entries) {
	const { platform } = entry;
	if (
		platform !== undefined &&
		!creditPlatforms.includes(platform as CreditPlatform)
	) {
		report(`${entry.name} is credited to the unknown platform ${platform}`);
	}
	if (entry.ecosystem === "android" && platform !== "android") {
		report(
			`${entry.name} only ships in the APK but is credited as ${scopeLabel(platform)}`,
		);
	}
	if (["npm", "asset"].includes(entry.ecosystem) && platform !== undefined) {
		report(
			`${entry.name} ships in the one frontend bundle every platform loads but is credited as ${scopeLabel(platform)}`,
		);
	}
}

misplacedAnchors(
	credits.entries.filter((it) => it.ecosystem === "rust"),
).forEach(report);

const pinnedInImage = /^CARGO_ABOUT_VERSION=(\S+)$/m.exec(
	read("ci/check-image.sh"),
)?.[1];
if (pinnedInImage !== requiredCargoAbout) {
	report(
		`the collector needs cargo-about ${requiredCargoAbout} but ci/check-image.sh installs ${pinnedInImage ?? "nothing"}`,
	);
}

const texts = new Set(credits.texts.map((it) => it.hash));
const referenced = new Set(
	credits.entries.flatMap((entry) => entry.textHashes),
);
for (const hash of referenced) {
	if (!texts.has(hash)) report(`no license text is stored for ${hash}`);
}
for (const hash of texts) {
	if (!referenced.has(hash))
		report(`license text ${hash} is credited to no one`);
}

if (problems.length > 0) {
	console.error(
		`the committed credits no longer match the project:\n${problems.map((it) => `  - ${it}`).join("\n")}\n\nRun \`bun run gen:credits\` and commit the result.`,
	);
	process.exit(1);
}

console.log(
	`credits consistent with the lockfiles (${credits.entries.length} entries, ${credits.texts.length} license texts, ${highlights.length} thank-you cards)`,
);
