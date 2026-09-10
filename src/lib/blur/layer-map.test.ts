import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync("src/layout.css", "utf8");

function layerTable(mode: "max" | "medium" | "min") {
	const prefix =
		mode === "max" ? "" : `:root\\[data-backdrop-blur="${mode}"\\] `;
	const rule = new RegExp(
		`^${prefix}\\.pblur-layer\\[data-pblur-layer="(\\d)"\\] \\{([^}]*)\\}`,
		"gm",
	);
	return [...layout.matchAll(rule)]
		.map(([, index, body = ""]) => ({
			index: Number(index),
			blur: Number(/--pblur-blur: blur\((\d+)px\);/.exec(body)?.[1]),
			stops: /--pblur-stops:\s*([^;]+);/
				.exec(body)?.[1]
				?.replace(/\s+/g, " ")
				.trim(),
		}))
		.filter((layer) => Number.isFinite(layer.blur));
}

const stops = (...values: [number, number][]) =>
	values
		.map(([alpha, position]) => `rgba(0, 0, 0, ${alpha}) ${position}%`)
		.join(", ");

type Stop = { alpha: number; position: number };

function parseStops(gradient: string): Stop[] {
	return [...gradient.matchAll(/rgba\(0, 0, 0, ([\d.]+)\) (\d+)%/g)].map(
		([, alpha, position]) => ({
			alpha: Number(alpha),
			position: Number(position),
		}),
	);
}

function maskAlphaAt({
	stops,
	position,
}: {
	stops: string | undefined;
	position: number;
}): number {
	if (stops === undefined) return 1;
	const ramp = parseStops(stops);
	const first = ramp[0];
	const last = ramp.at(-1);
	if (first === undefined || last === undefined) return 0;
	if (position <= first.position) return first.alpha;
	if (position >= last.position) return last.alpha;
	const after = ramp.findIndex((stop) => stop.position >= position);
	const to = ramp[after];
	const from = ramp[after - 1];
	if (to === undefined || from === undefined) return 0;
	if (to.position === from.position) return to.alpha;
	const progress = (position - from.position) / (to.position - from.position);
	return from.alpha + (to.alpha - from.alpha) * progress;
}

function risesThenFalls(steps: readonly number[]): boolean {
	const peak = steps.indexOf(Math.max(...steps));
	if (peak === 0 || peak === steps.length - 1) return false;
	const before = steps.slice(0, peak + 1);
	const after = steps.slice(peak);
	return (
		before.every(
			(step, index) => index === 0 || step > before[index - 1]!,
		) &&
		after.every((step, index) => index === 0 || step < after[index - 1]!)
	);
}

function blockEnd(css: string): number {
	let depth = 0;
	for (let index = 0; index < css.length; index += 1) {
		if (css[index] === "{") depth += 1;
		if (css[index] === "}") {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

const BLUR_ONSET_PERCENT = 10;

const DIRECTIONS = ["bottomToTop", "topToBottom"] as const;

function minRule(selector: string) {
	const parts = selector
		.split(/\s+/)
		.map((part) => part.replace(/[.[\]"]/g, (c) => "\\" + c))
		.join("\\s+");
	const rule = new RegExp(
		`:root\\[data-backdrop-blur="min"\\]\\s+${parts} \\{([^}]*)\\}`,
	);
	return rule.exec(layout)?.[1] ?? "";
}

function minPlane(direction: (typeof DIRECTIONS)[number]) {
	return minRule(
		`.pblur[data-pblur-direction="${direction}"] .pblur-layer[data-pblur-layer="0"]`,
	);
}

describe("progressive blur layer map", () => {
	it("keeps max identical to the table shipped before the setting existed", () => {
		expect(layerTable("max")).toEqual([
			{
				index: 0,
				blur: 1,
				stops: stops([0, 0], [1, 10], [1, 30], [0, 40]),
			},
			{
				index: 1,
				blur: 2,
				stops: stops([0, 10], [1, 20], [1, 40], [0, 50]),
			},
			{
				index: 2,
				blur: 4,
				stops: stops([0, 15], [1, 30], [1, 50], [0, 60]),
			},
			{
				index: 3,
				blur: 8,
				stops: stops([0, 20], [1, 40], [1, 60], [0, 70]),
			},
			{
				index: 4,
				blur: 12,
				stops: stops([0, 30], [1, 50], [1, 70], [0, 80]),
			},
			{
				index: 5,
				blur: 16,
				stops: stops([0, 40], [1, 60], [1, 80], [0, 90]),
			},
			{
				index: 6,
				blur: 24,
				stops: stops([0, 50], [1, 70], [1, 90], [0, 100]),
			},
			{ index: 7, blur: 32, stops: stops([0, 60], [1, 80]) },
			{ index: 8, blur: 64, stops: stops([0, 70], [1, 100]) },
		]);
	});

	it("halves the layer count at medium while keeping the peak radius", () => {
		expect(layerTable("medium")).toEqual([
			{ index: 0, blur: 1, stops: stops([0, 0], [1, 10]) },
			{ index: 1, blur: 4, stops: stops([0, 10], [1, 25]) },
			{ index: 2, blur: 10, stops: stops([0, 20], [1, 40]) },
			{ index: 3, blur: 28, stops: stops([0, 35], [1, 65]) },
			{ index: 4, blur: 64, stops: stops([0, 60], [1, 100]) },
		]);
	});

	it("collapses to a single plane at min", () => {
		expect(layerTable("min")).toEqual([
			{ index: 0, blur: 32, stops: undefined },
		]);
	});

	it("overhangs min's plane past the edge content scrolls in from, since a backdrop-filter synthesizes every sample beyond its own box", () => {
		expect(minPlane("bottomToTop")).toContain(
			"top: calc(-1 * var(--pblur-overhang))",
		);
		expect(minPlane("topToBottom")).not.toContain("top:");
		for (const direction of DIRECTIONS) {
			expect(minPlane(direction)).toContain(
				"height: calc(100% + var(--pblur-overhang))",
			);
		}
	});

	it("hard-stops min's mask at the overhang, so the band itself stays fully opaque", () => {
		for (const direction of DIRECTIONS) {
			const stops = [
				...minPlane(direction).matchAll(
					/(transparent|black) (var\(--pblur-overhang\))/g,
				),
			].map(([, color, position]) => `${color}@${position}`);
			expect(stops).toEqual([
				"transparent@var(--pblur-overhang)",
				"black@var(--pblur-overhang)",
			]);
		}
	});

	it("keeps min's overhang out of hit testing, since it covers content above the band", () => {
		expect(minRule('.pblur-layer[data-pblur-layer="0"]')).toContain(
			"pointer-events: none",
		);
	});

	it("carries min readability with a tint and a hairline inner edge", () => {
		expect(layout).toContain(
			':root[data-backdrop-blur="min"] .pblur-bg {\n\tbackground-image: none;\n}',
		);
		expect(layout).toContain("background-color: rgba(0, 0, 0, 0.55);");
		expect(layout).toContain("border-top: 1px solid var(--border);");
		expect(layout).toContain("border-bottom: 1px solid var(--border);");
	});

	it("covers every position past the onset with a fully masked-in layer, in every mode", () => {
		for (const mode of ["max", "medium", "min"] as const) {
			const layers = layerTable(mode);
			for (
				let position = BLUR_ONSET_PERCENT;
				position <= 100;
				position += 1
			) {
				const covered = layers.some(
					(layer) =>
						maskAlphaAt({ stops: layer.stops, position }) === 1,
				);
				expect(covered, `${mode} at ${position}%`).toBe(true);
			}
		}
	});

	it("eases both off-mode gradients in and out, so alpha never reaches zero at a hard slope", () => {
		const offBlocks = [
			...layout.matchAll(
				/:root\[data-backdrop-blur="off"\] \.pblur-(?:bg|scrim) \{([\s\S]*?)^\}/gm,
			),
		];
		expect(offBlocks).toHaveLength(2);
		for (const [, body = ""] of offBlocks) {
			const ramp = parseStops(body);
			expect(ramp[0]).toEqual({ alpha: 0, position: 0 });
			const steps = ramp
				.slice(1)
				.map((stop, index) => stop.alpha - (ramp[index]?.alpha ?? 0));
			expect(risesThenFalls(steps), body).toBe(true);
		}
	});

	it("hides every layer at off", () => {
		expect(layout).toContain(
			':root[data-backdrop-blur="off"] .pblur-layer {\n\tdisplay: none;\n}',
		);
	});
});

describe("backdrop token map", () => {
	const tokens = ["lens", "veil", "rail", "panel", "chip"] as const;

	function tokenBlock(mode: string | null) {
		const selector =
			mode === null ? ":root" : `:root\\[data-backdrop-blur="${mode}"\\]`;
		const blocks = [
			...layout.matchAll(
				new RegExp(`^${selector} \\{\\n([\\s\\S]*?)^\\}`, "gm"),
			),
		];
		return blocks.find((block) => block[1]?.includes("--bd-"))?.[1] ?? "";
	}

	function tokenValue(mode: string | null, token: string) {
		return new RegExp(`--bd-${token}: ([^;]+);`).exec(
			tokenBlock(mode),
		)?.[1];
	}

	it("defines every token at the base, which is what max renders", () => {
		expect(tokens.map((token) => tokenValue(null, token))).toEqual([
			"blur(1px)",
			"blur(8px)",
			"blur(16px)",
			"blur(24px)",
			"blur(40px)",
		]);
	});

	it("never names max in a selector, so max is the absence of overrides", () => {
		expect(layout).not.toContain('[data-backdrop-blur="max"]');
	});

	it("overrides no :root token at medium, so the trial's mid-scroll swap restyles only descendants", () => {
		expect(tokenBlock("medium")).toBe("");
	});

	it("keeps ::backdrop rules literal, since ::backdrop inherits custom properties only from Chromium 122", () => {
		const backdropRules = [
			...layout.matchAll(/::backdrop \{([^}]*)\}/g),
		].map(([, body]) => body ?? "");
		expect(backdropRules.length).toBeGreaterThan(0);
		for (const body of backdropRules) expect(body).not.toContain("var(");
	});

	it("renders off from CSS alone on an engine without backdrop-filter: the last block, on :root:root to outrank the mode blocks, naming both spellings", () => {
		const fallbackAt = layout.lastIndexOf("@supports not (");
		expect(fallbackAt).toBeGreaterThan(0);
		const fallback = layout.slice(fallbackAt);
		expect(fallback).toContain("(-webkit-backdrop-filter: blur(1px))");
		expect(fallback).toContain("(backdrop-filter: blur(1px))");
		expect(fallback.slice(blockEnd(fallback) + 1).trim()).toBe("");
		const selectors = [...fallback.matchAll(/^\t([^{\n]+) \{/gm)].map(
			([, selector]) => selector,
		);
		expect(selectors.length).toBeGreaterThan(0);
		for (const selector of selectors)
			expect(selector).toMatch(/^:root:root/);
		for (const token of tokens) {
			expect(fallback).toContain(`--bd-${token}: none;`);
		}
	});

	it("gives every fixed bar the same clearance from page content, so only the mode decides it", () => {
		const utility =
			/@utility (pt-header-clear-\*|pb-nav-clear) \{([^}]*)\}/g;
		const bodies = [...layout.matchAll(utility)].map(([, name, body]) => [
			name,
			body ?? "",
		]);
		expect(new Set(bodies.map(([name]) => name))).toEqual(
			new Set(["pb-nav-clear", "pt-header-clear-*"]),
		);
		for (const [name, body] of bodies) {
			expect(body, name).toContain("var(--bar-content-gap)");
		}
	});

	it("declares the clearance on the same element the mode attribute lands on, or body would shadow it", () => {
		expect(tokenBlock(null)).toContain("--bar-content-gap: 0px");
		expect(tokenBlock("min")).toContain("--bar-content-gap: 0.75rem");
		const body = /^body \{\n([\s\S]*?)^\}/m.exec(layout)?.[1] ?? "";
		expect(body).not.toBe("");
		expect(body).not.toContain("--bar-content-gap");
	});

	it("turns every token off at off", () => {
		for (const token of tokens) {
			expect(tokenValue("off", token)).toBe("none");
		}
	});

	it("keeps blur declarations out of every other source file", () => {
		const root = "src";
		const offenders: string[] = [];
		const walk = (directory: string) => {
			for (const entry of readdirSync(directory, {
				withFileTypes: true,
			})) {
				const full = join(directory, entry.name);
				if (entry.isDirectory()) {
					walk(full);
					continue;
				}
				if (!/\.(svelte|ts)$/.test(entry.name)) continue;
				if (full.startsWith("src/lib/blur/")) continue;
				if (
					/backdrop-blur|backdrop-filter:/.test(
						readFileSync(full, "utf8"),
					)
				) {
					offenders.push(full);
				}
			}
		};
		walk(root);
		expect(offenders).toEqual([]);
	});
});
