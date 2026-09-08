import path from "node:path";
import { collectManualCredits } from "./credits/manual";
import { collectNpmCredits } from "./credits/npm";
import { collectRustCredits } from "./credits/rust";
import type { CreditEntry, CreditsChunk } from "./credits/types";

type MergedEntry = Omit<CreditEntry, "version"> & { versions: string[] };

type Credits = {
	entries: MergedEntry[];
	texts: { hash: string; text: string }[];
};

const OUTPUT = path.join(import.meta.dir, "../src/lib/credits/generated.json");

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const groupKey = (entry: CreditEntry) =>
	[
		entry.ecosystem,
		entry.name,
		entry.spdx,
		entry.textHashes.toSorted().join(","),
	].join(" ");

const merge = (chunks: CreditsChunk[]): Credits => {
	const all = chunks.flatMap((chunk) => chunk.entries);

	const entries = [...Map.groupBy(all, groupKey)]
		.sort(([a], [b]) => compare(a, b))
		.map(([, group]): MergedEntry => {
			const byId = group.toSorted((a, b) => compare(a.id, b.id));
			const first = byId[0]!;
			return {
				id: first.id,
				name: first.name,
				ecosystem: first.ecosystem,
				versions: [
					...new Set(
						byId
							.map((it) => it.version)
							.filter((version) => version !== undefined),
					),
				].sort(Bun.semver.order),
				spdx: first.spdx,
				shipped: byId.find((it) => it.shipped)?.shipped,
				url: byId.find((it) => it.url)?.url,
				textHashes: first.textHashes.toSorted(),
			};
		})
		.sort(
			(a, b) =>
				compare(a.ecosystem, b.ecosystem) ||
				compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
				compare(a.spdx, b.spdx),
		);

	const used = new Set(all.flatMap((entry) => entry.textHashes));
	const texts = new Map<string, string>();
	for (const [hash, raw] of chunks.flatMap((chunk) =>
		Object.entries(chunk.texts),
	)) {
		if (!used.has(hash)) continue;
		const text = raw.trim();
		if ((texts.get(hash) ?? text) !== text) {
			throw new Error(`hash collision on ${hash}`);
		}
		texts.set(hash, text);
	}
	const missing = [...used].filter((hash) => !texts.has(hash));
	if (missing.length > 0) {
		throw new Error(`no chunk provided license text ${missing.join(", ")}`);
	}

	return {
		entries,
		texts: [...texts]
			.map(([hash, text]) => ({ hash, text }))
			.sort((a, b) => compare(a.hash, b.hash)),
	};
};

const credits = merge([
	await collectRustCredits(),
	await collectNpmCredits(),
	await collectManualCredits(),
]);

const serialized = `${JSON.stringify(credits, null, "\t")}\n`;

if (process.argv.includes("--check")) {
	const current = await Bun.file(OUTPUT)
		.text()
		.catch(() => "");
	if (current !== serialized) {
		throw new Error(
			`${path.relative(process.cwd(), OUTPUT)} is out of date. ` +
				"Run `bun run gen:credits` and commit the result.",
		);
	}
	console.log(`credits up to date (${credits.entries.length} entries)`);
} else {
	await Bun.write(OUTPUT, serialized);
	const counts = Object.groupBy(credits.entries, (entry) => entry.ecosystem);
	console.log(
		`wrote ${credits.entries.length} entries and ${credits.texts.length} license texts (` +
			Object.entries(counts)
				.sort(([a], [b]) => compare(a, b))
				.map(([name, group]) => `${name} ${group?.length}`)
				.join(", ") +
			")",
	);
}
