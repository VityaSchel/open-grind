export type PlistValue =
	| string
	| number
	| boolean
	| PlistValue[]
	| PlistDictionary;

export type PlistDictionary = { [key: string]: PlistValue };

const escaped = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

function element({
	value,
	depth,
}: {
	value: PlistValue;
	depth: number;
}): string[] {
	const indent = "\t".repeat(depth);
	if (typeof value === "string") {
		return [`${indent}<string>${escaped(value)}</string>`];
	}
	if (typeof value === "boolean") return [`${indent}<${value}/>`];
	if (typeof value === "number") {
		const tag = Number.isInteger(value) ? "integer" : "real";
		return [`${indent}<${tag}>${value}</${tag}>`];
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return [`${indent}<array/>`];
		return [
			`${indent}<array>`,
			...value.flatMap((item) =>
				element({ value: item, depth: depth + 1 }),
			),
			`${indent}</array>`,
		];
	}
	const entries = Object.entries(value).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	);
	if (entries.length === 0) return [`${indent}<dict/>`];
	return [
		`${indent}<dict>`,
		...entries.flatMap(([key, item]) => [
			`${indent}\t<key>${escaped(key)}</key>`,
			...element({ value: item, depth: depth + 1 }),
		]),
		`${indent}</dict>`,
	];
}

export function plistXml(value: PlistValue): string {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
		'<plist version="1.0">',
		...element({ value, depth: 0 }),
		"</plist>",
		"",
	].join("\n");
}
