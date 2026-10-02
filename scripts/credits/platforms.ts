import {
	creditPlatforms,
	type CreditPlatform,
} from "../../src/lib/credits/types";

const platformAnchors: Record<CreditPlatform, string> = {
	android: "jni",
	linux: "webkit2gtk",
	macos: "objc2-app-kit",
	windows: "webview2-com",
};

const commonAnchor = "tauri";

export const unshippedTargets = [
	"aarch64-apple-ios",
	"aarch64-apple-ios-sim",
	"x86_64-apple-ios",
];

const triplePatterns: Record<CreditPlatform, RegExp> = {
	android: /-linux-android/,
	linux: /-unknown-linux-/,
	macos: /-apple-darwin$/,
	windows: /-pc-windows-/,
};

export const targetTriples = (toml: string) => {
	const block = /^targets = \[(.*?)^\]/ms.exec(toml)?.[1] ?? "";
	return [...block.matchAll(/"([^"]+)"/g)]
		.map(([, triple]) => triple!)
		.sort();
};

export const platformOfTriple = (triple: string): CreditPlatform => {
	const platform = creditPlatforms.find((it) =>
		triplePatterns[it].test(triple),
	);
	if (!platform) {
		throw new Error(
			`the target ${triple} belongs to no credits platform: teach triplePatterns about it, or remove it from the targets in src-tauri/about.toml and deny.toml if no release is built for it`,
		);
	}
	return platform;
};

type DependencyKind = "build" | "dev" | null;

type ResolvedDependency = {
	pkg: string;
	dep_kinds: { kind: DependencyKind }[];
};

export type CargoMetadata = {
	packages: {
		id: string;
		name: string;
		version: string;
		targets: { kind: string[] }[];
	}[];
	resolve: {
		root: string;
		nodes: { id: string; deps: ResolvedDependency[] }[];
	};
};

type TargetGraph = { triple: string; metadata: CargoMetadata };

export type PlatformsByCrate = Map<string, Set<CreditPlatform>>;

const dependenciesOf = ({
	metadata,
	kinds,
}: {
	metadata: CargoMetadata;
	kinds: DependencyKind[];
}) =>
	new Map(
		metadata.resolve.nodes.map((node) => [
			node.id,
			node.deps
				.filter((dep) =>
					dep.dep_kinds.some((it) => kinds.includes(it.kind)),
				)
				.map((dep) => dep.pkg),
		]),
	);

const compiledForTarget = ({
	target,
	unfiltered,
}: {
	target: CargoMetadata;
	unfiltered: CargoMetadata;
}) => {
	const targetDeps = dependenciesOf({ metadata: target, kinds: [null] });
	const buildDepsOnAnyHost = dependenciesOf({
		metadata: unfiltered,
		kinds: ["build"],
	});
	const depsOnAnyHost = dependenciesOf({
		metadata: unfiltered,
		kinds: [null, "build"],
	});
	const procMacros = new Set(
		unfiltered.packages
			.filter((pkg) =>
				pkg.targets.some((it) => it.kind.includes("proc-macro")),
			)
			.map((pkg) => pkg.id),
	);

	const targetSide = new Set<string>();
	const hostSide = new Set<string>();
	const pending: { id: string; onHost: boolean }[] = [];
	const visit = ({ id, onHost }: { id: string; onHost: boolean }) => {
		const seen = onHost ? hostSide : targetSide;
		if (seen.has(id)) return;
		seen.add(id);
		pending.push({ id, onHost });
	};

	visit({ id: target.resolve.root, onHost: false });
	for (let next = pending.pop(); next; next = pending.pop()) {
		const { id, onHost } = next;
		if (onHost) {
			for (const dep of depsOnAnyHost.get(id) ?? []) {
				visit({ id: dep, onHost: true });
			}
			continue;
		}
		for (const dep of targetDeps.get(id) ?? []) {
			visit({ id: dep, onHost: procMacros.has(dep) });
		}
		for (const dep of buildDepsOnAnyHost.get(id) ?? []) {
			visit({ id: dep, onHost: true });
		}
	}

	return targetSide.union(hostSide);
};

export const classifyCrates = ({
	graphs,
	unfiltered,
}: {
	graphs: TargetGraph[];
	unfiltered: CargoMetadata;
}): PlatformsByCrate => {
	const crateOf = new Map(
		unfiltered.packages.map((pkg) => [
			pkg.id,
			`${pkg.name}@${pkg.version}`,
		]),
	);
	const platformsByCrate: PlatformsByCrate = new Map();
	for (const { triple, metadata } of graphs) {
		const platform = platformOfTriple(triple);
		const compiled = compiledForTarget({ target: metadata, unfiltered });
		if (compiled.size <= 1) {
			throw new Error(
				`cargo resolved no dependencies for ${triple}, so nothing could be told apart by platform`,
			);
		}
		for (const id of compiled) {
			const crate = crateOf.get(id);
			if (!crate) {
				throw new Error(
					`${id} is built for ${triple} but missing from the unfiltered cargo metadata`,
				);
			}
			const platforms = platformsByCrate.get(crate) ?? new Set();
			platformsByCrate.set(crate, platforms.add(platform));
		}
	}
	return platformsByCrate;
};

export const exclusivePlatform = ({
	name,
	versions,
	platformsByCrate,
}: {
	name: string;
	versions: string[];
	platformsByCrate: PlatformsByCrate;
}): CreditPlatform | undefined => {
	const perVersion = versions.map(
		(version) =>
			platformsByCrate.get(`${name}@${version}`) ??
			new Set<CreditPlatform>(),
	);
	const [platform, ...others] = new Set(perVersion.flatMap((it) => [...it]));
	const everyVersionIsBuilt = perVersion.every((it) => it.size > 0);
	return everyVersionIsBuilt && others.length === 0 ? platform : undefined;
};

export const scopeLabel = (platform: string | undefined) =>
	platform ? `${platform}-only` : "shared";

export const misplacedAnchors = (
	crates: { name: string; platform?: string }[],
) => {
	const credited = new Map(crates.map((it) => [it.name, it.platform]));
	return [
		...creditPlatforms.map((platform) => ({
			crate: platformAnchors[platform],
			expected: platform,
		})),
		{ crate: commonAnchor, expected: undefined },
	]
		.filter(
			({ crate, expected }) =>
				!credited.has(crate) || credited.get(crate) !== expected,
		)
		.map(
			({ crate, expected }) =>
				`${crate} must be credited as ${scopeLabel(expected)} but is ${credited.has(crate) ? `credited as ${scopeLabel(credited.get(crate))}` : "not credited at all"}`,
		);
};
