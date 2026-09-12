import { $ } from "bun";
import { join } from "node:path";
import { hashText } from "./hash";
import type { CreditEntry, CreditsChunk } from "./types";

const manifestDir = join(import.meta.dir, "../../src-tauri");
const releaseFeatures = "keychain,private-api";

export const requiredCargoAbout = "0.9.2";

const pinnedByClarifyStanza: Record<
	string,
	{ ids: string[]; texts: string[] }
> = {
	"atomic-waker": {
		ids: ["MIT"],
		texts: ["20746cc8a2fdc9ca", "30fefc3a7d6a0041"],
	},
	"boring-sys2": {
		ids: ["ISC", "MIT", "OpenSSL"],
		texts: ["205956f17539e9b1", "99fa98e8c63e7f05"],
	},
	"curve25519-dalek": { ids: ["BSD-3-Clause"], texts: ["82771e440a2341f4"] },
	dpi: {
		ids: ["Apache-2.0", "MIT"],
		texts: ["6dc0e068dcf3a5bc", "e07664cb9e316442"],
	},
	"futures-lite": {
		ids: ["MIT"],
		texts: ["20746cc8a2fdc9ca", "30fefc3a7d6a0041"],
	},
	parking: { ids: ["MIT"], texts: ["30fefc3a7d6a0041", "c43e20176655c7a7"] },
	"regex-syntax": {
		ids: ["MIT", "Unicode-DFS-2016"],
		texts: ["14435fbcd271e278", "ea8df489e83b7674"],
	},
	uds_windows: {
		ids: ["MIT"],
		texts: ["8e1c6bd583a7e67b", "943312cc53d8eb84"],
	},
	"zstd-sys": {
		ids: ["BSD-3-Clause", "MIT"],
		texts: ["2caa041c7859b01c", "84b7e1b767becaf1"],
	},
};

type AboutCrate = {
	name: string;
	version: string;
	license: string;
	repository: string | null;
};

type AboutLicense = { id: string; text: string; usedBy: { name: string }[] };

type AboutOutput = { crates: AboutCrate[]; licenses: AboutLicense[] };

const assertCargoAboutVersion = async () => {
	const installed = (await $`cargo about --version`.nothrow().quiet())
		.text()
		.trim();
	if (installed !== `cargo-about ${requiredCargoAbout}`) {
		throw new Error(
			`${installed || "cargo-about is not installed"}, but the committed credits were generated with cargo-about ${requiredCargoAbout}, ` +
				"and its matcher decides which copyright notices survive. " +
				`Install it with \`cargo install --locked cargo-about@${requiredCargoAbout}\`.`,
		);
	}
};

const runCargoAbout = async (): Promise<AboutOutput> => {
	await assertCargoAboutVersion();
	const result =
		await $`cargo about generate --locked --fail --features ${releaseFeatures} about.hbs`
			.cwd(manifestDir)
			.nothrow()
			.quiet();
	const stderr = result.stderr.toString();
	if (result.exitCode !== 0) {
		throw new Error(
			`cargo about generate exited ${result.exitCode}\n${stderr}`,
		);
	}
	if (stderr.includes("clarification")) {
		throw new Error(`cargo about ignored a clarification\n${stderr}`);
	}
	return result.json() as AboutOutput;
};

const assertPinnedNoticesPresent = ({
	ids,
	hashes,
}: {
	ids: Map<string, Set<string>>;
	hashes: Map<string, Set<string>>;
}) => {
	for (const [name, pinned] of Object.entries(pinnedByClarifyStanza)) {
		const lost = [
			...pinned.ids.filter((id) => !ids.get(name)?.has(id)),
			...pinned.texts.filter((hash) => !hashes.get(name)?.has(hash)),
		];
		if (lost.length > 0) {
			throw new Error(
				`${name} lost ${lost.join(", ")}: re-pin every [[${name}.clarify.files]] checksum in src-tauri/about.toml, then update pinnedByClarifyStanza`,
			);
		}
	}
};

const addTo = (map: Map<string, Set<string>>, key: string, value: string) =>
	map.get(key)?.add(value) ?? map.set(key, new Set([value]));

export const collectRustCredits = async (): Promise<CreditsChunk> => {
	const about = await runCargoAbout();

	const texts: Record<string, string> = {};
	const hashesByCrate = new Map<string, Set<string>>();
	const idsByCrate = new Map<string, Set<string>>();
	for (const license of about.licenses) {
		const hash = hashText(license.text);
		texts[hash] = license.text;
		for (const { name } of license.usedBy) {
			addTo(hashesByCrate, name, hash);
			addTo(idsByCrate, name, license.id);
		}
	}
	assertPinnedNoticesPresent({ ids: idsByCrate, hashes: hashesByCrate });

	const entries = [...Map.groupBy(about.crates, (krate) => krate.name)].map(
		([name, unsorted]): CreditEntry => {
			const versions = unsorted.toSorted((a, b) =>
				Bun.semver.order(a.version, b.version),
			);
			const expressions = [
				...new Set(versions.map((it) => it.license)),
			].sort();
			return {
				id: name,
				name,
				version: versions.map((it) => it.version).join(", "),
				ecosystem: "rust",
				spdx:
					expressions.length === 1
						? expressions[0]!
						: expressions.map((it) => `(${it})`).join(" AND "),
				shipped: [...(idsByCrate.get(name) ?? [])].sort().join(" AND "),
				url:
					versions.findLast((it) => it.repository)?.repository ??
					`https://crates.io/crates/${name}`,
				textHashes: [...(hashesByCrate.get(name) ?? [])].sort(),
			};
		},
	);

	return { entries, texts };
};
