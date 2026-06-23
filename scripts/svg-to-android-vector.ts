// bun scripts/svg-to-android-vector.ts <in.svg> <out.xml> [options]
//
// Options:
//   --width  <dp>   intrinsic width  (default: SVG width,  rounded)
//   --height <dp>   intrinsic height (default: SVG height, rounded)
//   --scale  <s>    wrap all shapes in a <group> scaled by <s> about the
//                   viewport centre
//   --mono <color>  force every fill/stroke to <color>

import { readFileSync, writeFileSync } from "fs";

function parseArgs(argv: string[]) {
	const positional = [];
	const opts: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a !== undefined && a.startsWith("--")) opts[a.slice(2)] = argv[++i]!;
		else positional.push(a);
	}
	return { positional, opts };
}

function attr(tag: string, name: string) {
	const m = tag.match(
		new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`),
	);
	return m ? (m[1] ?? m[2]) : undefined;
}

function paint(value: string) {
	if (!value || value === "none") return undefined;
	return value;
}

function withOpacity(color: string, opacity: string) {
	if (opacity === undefined) return color;
	const a = Math.round(Math.max(0, Math.min(1, parseFloat(opacity))) * 255);
	const alpha = a.toString(16).padStart(2, "0").toUpperCase();
	let hex = color.replace("#", "");
	if (hex.length === 3)
		hex = hex
			.split("")
			.map((c) => c + c)
			.join("");
	if (hex.length !== 6) return color; // named colours etc: leave as-is
	return `#${alpha}${hex.toUpperCase()}`;
}

function rectToPath(tag: string) {
	const x = parseFloat(attr(tag, "x") ?? "0");
	const y = parseFloat(attr(tag, "y") ?? "0");
	const w = parseFloat(attr(tag, "width")!);
	const h = parseFloat(attr(tag, "height")!);
	if (attr(tag, "rx") || attr(tag, "ry")) {
		throw new Error("rounded <rect> (rx/ry) is not supported");
	}
	return `M${x},${y} h${w} v${h} h${-w} z`;
}

function pathFromShape({
	tag,
	kind,
	depth,
	mono,
}: {
	tag: string;
	kind: string;
	depth: number;
	mono?: string;
}) {
	const tagIndent = "    ".repeat(depth);
	const indent = "    ".repeat(depth + 1);
	const fill = paint(attr(tag, "fill")!);
	const stroke = paint(attr(tag, "stroke")!);
	const fillRule = attr(tag, "fill-rule");
	const strokeWidth = attr(tag, "stroke-width");
	const strokeCap = attr(tag, "stroke-linecap");
	const strokeJoin = attr(tag, "stroke-linejoin");

	const data = kind === "rect" ? rectToPath(tag) : attr(tag, "d");
	if (!data) throw new Error(`<${kind}> without geometry`);

	const lines = [];
	if (fill)
		lines.push(
			`${indent}android:fillColor="${mono ?? withOpacity(fill, attr(tag, "fill-opacity")!)}"`,
		);
	if (fillRule === "evenodd") lines.push(`${indent}android:fillType="evenOdd"`);
	if (stroke) {
		lines.push(
			`${indent}android:strokeColor="${mono ?? withOpacity(stroke, attr(tag, "stroke-opacity")!)}"`,
		);
		lines.push(`${indent}android:strokeWidth="${strokeWidth ?? "1"}"`);
		if (strokeCap) lines.push(`${indent}android:strokeLineCap="${strokeCap}"`);
		if (strokeJoin)
			lines.push(`${indent}android:strokeLineJoin="${strokeJoin}"`);
	}
	lines.push(`${indent}android:pathData="${data}"`);
	return `${tagIndent}<path\n${lines.join("\n")} />`;
}

function main() {
	const { positional, opts } = parseArgs(process.argv.slice(2));
	const [input, output] = positional;
	if (!input || !output) {
		console.error(
			"usage: bun scripts/svg-to-android-vector.ts <in.svg> <out.xml> [--width dp] [--height dp] [--scale s] [--mono #color]",
		);
		process.exit(2);
	}

	const svg = readFileSync(input, "utf8");
	const svgTag = svg.match(/<svg\b[^>]*>/)?.[0];
	if (!svgTag) throw new Error("no <svg> element found");

	const viewBox = attr(svgTag, "viewBox");
	let vbW, vbH;
	if (viewBox) {
		const [, , w, h] = viewBox
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		vbW = w;
		vbH = h;
	} else {
		vbW = parseFloat(attr(svgTag, "width")!);
		vbH = parseFloat(attr(svgTag, "height")!);
	}
	if (!vbW || !vbH) throw new Error("could not determine viewBox/size");

	const widthDp = Math.round(
		parseFloat(opts.width ?? attr(svgTag, "width") ?? vbW.toString()),
	);
	const heightDp = Math.round(
		parseFloat(opts.height ?? attr(svgTag, "height") ?? vbH.toString()),
	);

	const body = svg.slice(
		svg.indexOf(svgTag) + svgTag.length,
		svg.lastIndexOf("</svg>"),
	);
	const unsupported = body.match(
		/<(g|use|image|text|clipPath|defs|linearGradient|radialGradient|symbol)\b/,
	);
	if (unsupported)
		throw new Error(
			`unsupported element <${unsupported[1]}>; this converter only handles flat <path>/<rect>`,
		);

	const grouped = opts.scale !== undefined;
	const matches = [...body.matchAll(/<(path|rect)\b[^>]*?\/?>/g)];
	if (matches.length === 0) throw new Error("no <path>/<rect> shapes found");
	const shapes = matches.map((m) =>
		pathFromShape({
			tag: m[0],
			kind: m[1]!,
			depth: grouped ? 2 : 1,
			mono: opts.mono,
		}),
	);

	let inner = shapes.join("\n");
	if (grouped) {
		const s = parseFloat(opts.scale!);
		const cx = +(vbW / 2).toFixed(4);
		const cy = +(vbH / 2).toFixed(4);
		inner =
			`    <group\n` +
			`        android:scaleX="${s}"\n` +
			`        android:scaleY="${s}"\n` +
			`        android:pivotX="${cx}"\n` +
			`        android:pivotY="${cy}">\n` +
			`${inner}\n` +
			`    </group>`;
	}

	const xml =
		`<?xml version="1.0" encoding="utf-8"?>\n` +
		`<!-- Generated by scripts/svg-to-android-vector.ts from ${input}. Do not edit by hand. -->\n` +
		`<vector xmlns:android="http://schemas.android.com/apk/res/android"\n` +
		`    android:width="${widthDp}dp"\n` +
		`    android:height="${heightDp}dp"\n` +
		`    android:viewportWidth="${vbW}"\n` +
		`    android:viewportHeight="${vbH}">\n` +
		`${inner}\n` +
		`</vector>\n`;

	writeFileSync(output, xml);
	console.log(
		`wrote ${output} (${shapes.length} paths, viewport ${vbW}x${vbH}, ${widthDp}x${heightDp}dp${opts.scale ? `, scale ${opts.scale}` : ""})`,
	);
}

main();
