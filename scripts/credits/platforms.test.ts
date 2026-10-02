import { describe, expect, it } from "vitest";

import type { CreditPlatform } from "../../src/lib/credits/types";
import {
	type CargoMetadata,
	classifyCrates,
	exclusivePlatform,
	misplacedAnchors,
	platformOfTriple,
	targetTriples,
} from "./platforms";

type Edge = { from: string; to: string; kind?: "build" | "dev" };

const version = "1.0.0";

const metadata = ({
	edges,
	procMacros = [],
}: {
	edges: Edge[];
	procMacros?: string[];
}): CargoMetadata => {
	const names = [...new Set(edges.flatMap(({ from, to }) => [from, to]))];
	return {
		packages: names.map((name) => ({
			id: name,
			name,
			version,
			targets: [
				{ kind: [procMacros.includes(name) ? "proc-macro" : "lib"] },
			],
		})),
		resolve: {
			root: "app",
			nodes: names.map((name) => ({
				id: name,
				deps: edges
					.filter(({ from }) => from === name)
					.map(({ to, kind }) => ({
						pkg: to,
						dep_kinds: [{ kind: kind ?? null }],
					})),
			})),
		},
	};
};

const triples = {
	android: "aarch64-linux-android",
	linux: "x86_64-unknown-linux-gnu",
	macos: "aarch64-apple-darwin",
	windows: "x86_64-pc-windows-msvc",
};

const shared: Edge[] = [{ from: "app", to: "serde" }];

const classify = ({
	perPlatform,
	procMacros,
}: {
	perPlatform: Partial<Record<keyof typeof triples, Edge[]>>;
	procMacros?: string[];
}) => {
	const platformsByCrate = classifyCrates({
		graphs: Object.entries(triples).map(([platform, triple]) => ({
			triple,
			metadata: metadata({
				edges: [
					...shared,
					...(perPlatform[platform as keyof typeof triples] ?? []),
				],
				procMacros,
			}),
		})),
		unfiltered: metadata({
			edges: [...shared, ...Object.values(perPlatform).flat()],
			procMacros,
		}),
	});
	return (name: string) =>
		exclusivePlatform({ name, versions: [version], platformsByCrate });
};

describe("classifyCrates", () => {
	it("labels a crate that only one platform's targets link", () => {
		const platformOf = classify({
			perPlatform: { windows: [{ from: "app", to: "webview2-com" }] },
		});

		expect(platformOf("webview2-com")).toBe("windows");
	});

	it("keeps a crate common when every platform links it", () => {
		const platformOf = classify({ perPlatform: {} });

		expect(platformOf("serde")).toBeUndefined();
	});

	it("keeps a crate common when two platforms link it", () => {
		const platformOf = classify({
			perPlatform: {
				macos: [{ from: "app", to: "rfd" }],
				windows: [{ from: "app", to: "rfd" }],
			},
		});

		expect(platformOf("rfd")).toBeUndefined();
	});

	it("labels a crate that only one of a platform's targets links", () => {
		const linkedOnX86: Edge[] = [
			...shared,
			{ from: "app", to: "raw-cpuid" },
		];
		const platformsByCrate = classifyCrates({
			graphs: [
				{
					triple: triples.android,
					metadata: metadata({ edges: shared }),
				},
				{
					triple: "x86_64-linux-android",
					metadata: metadata({ edges: linkedOnX86 }),
				},
				{
					triple: triples.linux,
					metadata: metadata({ edges: shared }),
				},
			],
			unfiltered: metadata({ edges: linkedOnX86 }),
		});

		expect(
			exclusivePlatform({
				name: "raw-cpuid",
				versions: [version],
				platformsByCrate,
			}),
		).toBe("android");
	});

	it("follows a platform-only crate's own dependencies", () => {
		const platformOf = classify({
			perPlatform: {
				linux: [
					{ from: "app", to: "webkit2gtk" },
					{ from: "webkit2gtk", to: "glib" },
				],
			},
		});

		expect(platformOf("glib")).toBe("linux");
	});

	it("keeps a host-gated dependency of a shared build dependency common", () => {
		const platformOf = classify({
			perPlatform: {
				android: [{ from: "app", to: "tauri-build", kind: "build" }],
				linux: [{ from: "app", to: "tauri-build", kind: "build" }],
				windows: [{ from: "app", to: "tauri-build", kind: "build" }],
				macos: [
					{ from: "app", to: "tauri-build", kind: "build" },
					{ from: "tauri-build", to: "swift-rs" },
				],
			},
		});

		expect(platformOf("swift-rs")).toBeUndefined();
	});

	it("keeps a host-gated dependency of a shared proc-macro common", () => {
		const platformOf = classify({
			procMacros: ["tauri-macros"],
			perPlatform: {
				android: [{ from: "app", to: "tauri-macros" }],
				linux: [{ from: "app", to: "tauri-macros" }],
				windows: [{ from: "app", to: "tauri-macros" }],
				macos: [
					{ from: "app", to: "tauri-macros" },
					{ from: "tauri-macros", to: "swift-rs" },
				],
			},
		});

		expect(platformOf("swift-rs")).toBeUndefined();
	});

	it("labels a proc-macro and its dependencies when only one platform reaches it", () => {
		const platformOf = classify({
			procMacros: ["webview2-com-macros"],
			perPlatform: {
				windows: [
					{ from: "app", to: "webview2-com" },
					{ from: "webview2-com", to: "webview2-com-macros" },
					{ from: "webview2-com-macros", to: "windows-only-syn" },
				],
			},
		});

		expect(platformOf("webview2-com-macros")).toBe("windows");
		expect(platformOf("windows-only-syn")).toBe("windows");
	});

	it("labels the build dependency of a platform-only crate", () => {
		const platformOf = classify({
			perPlatform: {
				linux: [
					{ from: "app", to: "glib-sys" },
					{ from: "glib-sys", to: "system-deps", kind: "build" },
				],
			},
		});

		expect(platformOf("system-deps")).toBe("linux");
	});

	it("keeps a host-gated build dependency of a shared crate common", () => {
		const platformOf = classify({
			perPlatform: {
				macos: [{ from: "serde", to: "swift-rs", kind: "build" }],
			},
		});

		expect(platformOf("swift-rs")).toBeUndefined();
	});

	it("keeps a host-gated build dependency of a shared build dependency common", () => {
		const platformOf = classify({
			perPlatform: {
				android: [{ from: "app", to: "tauri-build", kind: "build" }],
				linux: [{ from: "app", to: "tauri-build", kind: "build" }],
				windows: [{ from: "app", to: "tauri-build", kind: "build" }],
				macos: [
					{ from: "app", to: "tauri-build", kind: "build" },
					{ from: "tauri-build", to: "swift-rs", kind: "build" },
					{ from: "app", to: "swift-rs" },
				],
			},
		});

		expect(platformOf("swift-rs")).toBeUndefined();
	});

	it("leaves out a crate that only the app's tests depend on", () => {
		const platformOf = classify({
			perPlatform: {
				linux: [
					{ from: "app", to: "tempfile", kind: "dev" },
					{ from: "app", to: "glib" },
				],
			},
		});

		expect(platformOf("tempfile")).toBeUndefined();
		expect(platformOf("glib")).toBe("linux");
	});

	it("refuses a target whose graph holds nothing but the app", () => {
		const whole = metadata({ edges: shared });
		const hollow = {
			...whole,
			resolve: { root: "app", nodes: [{ id: "app", deps: [] }] },
		};

		expect(() =>
			classifyCrates({
				graphs: [{ triple: triples.linux, metadata: hollow }],
				unfiltered: whole,
			}),
		).toThrow(/no dependencies for x86_64-unknown-linux-gnu/);
	});
});

describe("exclusivePlatform", () => {
	const platformsByCrate = new Map<string, Set<CreditPlatform>>([
		["windows-sys@0.59.0", new Set(["windows"])],
		["windows-sys@0.61.2", new Set(["windows", "linux"])],
		["jni@0.21.1", new Set(["android"])],
		["jni@0.22.0", new Set(["android"])],
	]);

	it("keeps a name common when its versions ship on different platforms", () => {
		expect(
			exclusivePlatform({
				name: "windows-sys",
				versions: ["0.59.0", "0.61.2"],
				platformsByCrate,
			}),
		).toBeUndefined();
	});

	it("labels a name whose every version ships on the same single platform", () => {
		expect(
			exclusivePlatform({
				name: "jni",
				versions: ["0.21.1", "0.22.0"],
				platformsByCrate,
			}),
		).toBe("android");
	});

	it("keeps a name common when one of its credited versions is built for no audited target", () => {
		expect(
			exclusivePlatform({
				name: "jni",
				versions: ["0.19.0", "0.21.1"],
				platformsByCrate,
			}),
		).toBeUndefined();
	});

	it("keeps a crate common when no audited target builds it", () => {
		expect(
			exclusivePlatform({
				name: "uds_windows",
				versions: ["1.2.1"],
				platformsByCrate,
			}),
		).toBeUndefined();
	});
});

describe("misplacedAnchors", () => {
	const anchored = [
		{ name: "jni", platform: "android" },
		{ name: "webkit2gtk", platform: "linux" },
		{ name: "objc2-app-kit", platform: "macos" },
		{ name: "webview2-com", platform: "windows" },
		{ name: "tauri" },
	];

	it("accepts each platform's direct dependency under its platform and tauri as shared", () => {
		expect(misplacedAnchors(anchored)).toEqual([]);
	});

	it("names a platform's direct dependency that lost its label", () => {
		expect(
			misplacedAnchors(
				anchored.map((it) =>
					it.name === "webview2-com" ? { name: it.name } : it,
				),
			),
		).toEqual([
			"webview2-com must be credited as windows-only but is credited as shared",
		]);
	});

	it("names tauri when one platform claims it", () => {
		expect(
			misplacedAnchors([
				...anchored.slice(0, 4),
				{ name: "tauri", platform: "linux" },
			]),
		).toEqual([
			"tauri must be credited as shared but is credited as linux-only",
		]);
	});

	it("names an anchor that is no longer credited", () => {
		expect(misplacedAnchors(anchored.slice(1))).toEqual([
			"jni must be credited as android-only but is not credited at all",
		]);
	});

	it("names tauri when it is no longer credited", () => {
		expect(misplacedAnchors(anchored.slice(0, 4))).toEqual([
			"tauri must be credited as shared but is not credited at all",
		]);
	});
});

describe("platformOfTriple", () => {
	it.each([
		["aarch64-linux-android", "android"],
		["armv7-linux-androideabi", "android"],
		["aarch64-unknown-linux-gnu", "linux"],
		["x86_64-apple-darwin", "macos"],
		["aarch64-pc-windows-msvc", "windows"],
	])("maps %s to %s", (triple, platform) => {
		expect(platformOfTriple(triple)).toBe(platform);
	});

	it("refuses a target no release is classified for and says where to resolve it", () => {
		expect(() => platformOfTriple("aarch64-apple-ios")).toThrow(
			"the target aarch64-apple-ios belongs to no credits platform: teach triplePatterns about it, or remove it from the targets in src-tauri/about.toml and deny.toml if no release is built for it",
		);
	});
});

describe("targetTriples", () => {
	it("reads the sorted targets list and nothing else from a manifest", () => {
		const toml = [
			'accepted = ["MIT"]',
			"targets = [",
			'\t"x86_64-pc-windows-msvc",',
			'\t"aarch64-apple-darwin",',
			"]",
			'workarounds = ["gtk"]',
		].join("\n");

		expect(targetTriples(toml)).toEqual([
			"aarch64-apple-darwin",
			"x86_64-pc-windows-msvc",
		]);
	});
});
