import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { adb, waitFor } from "./device";
import { liveNamePrefix } from "./names";

const devicePictures = "/sdcard/Pictures";
const pickerPhoto = /^Photo taken on/;
const pickerConfirm = /^(Add|Done|Select)\b/;

type UiNode = {
	text: string;
	description: string;
	center: { x: number; y: number };
};

export async function uniquePhoto() {
	const size = 256;
	return await sharp(randomBytes(size * size * 3), {
		raw: { width: size, height: size, channels: 3 },
	})
		.jpeg({ quality: 92 })
		.toBuffer();
}

export async function pushUniquePhoto() {
	const name = `${liveNamePrefix}${Date.now()}.jpg`;
	const dir = mkdtempSync(join(tmpdir(), "og-e2e-photo-"));
	try {
		const file = join(dir, name);
		writeFileSync(file, await uniquePhoto());
		adb(["shell", `rm -f ${devicePictures}/${liveNamePrefix}*`]);
		adb(["push", file, `${devicePictures}/${name}`]);
		adb([
			"shell",
			"am",
			"broadcast",
			"-a",
			"android.intent.action.MEDIA_SCANNER_SCAN_FILE",
			"-d",
			`file://${devicePictures}/${name}`,
		]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	return name;
}

function attribute({ node, name }: { node: string; name: string }) {
	return node.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";
}

function screenNodes(): UiNode[] {
	const xml = adb(["exec-out", "uiautomator", "dump", "/dev/tty"]);
	return [...xml.matchAll(/<node\b[^>]*>/g)].flatMap(([node]) => {
		const bounds = attribute({ node, name: "bounds" }).match(
			/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/,
		);
		if (!bounds) return [];
		const [left, top, right, bottom] = bounds.slice(1).map(Number) as [
			number,
			number,
			number,
			number,
		];
		return [
			{
				text: attribute({ node, name: "text" }),
				description: attribute({ node, name: "content-desc" }),
				center: { x: (left + right) / 2, y: (top + bottom) / 2 },
			},
		];
	});
}

async function tapWhenShown({
	what,
	matches,
	timeoutMs = 30_000,
}: {
	what: string;
	matches: (node: UiNode) => boolean;
	timeoutMs?: number;
}) {
	const node = await waitFor({
		what: `${what} in the photo picker`,
		timeoutMs,
		probe: () => screenNodes().find(matches) ?? null,
	});
	adb([
		"shell",
		"input",
		"tap",
		String(Math.round(node.center.x)),
		String(Math.round(node.center.y)),
	]);
}

export async function pickNewestPhoto({ multiple }: { multiple: boolean }) {
	await tapWhenShown({
		what: "a photo",
		matches: ({ description }) => pickerPhoto.test(description),
	});
	if (!multiple) return;
	await tapWhenShown({
		what: "its confirm button",
		matches: ({ text }) => pickerConfirm.test(text),
	});
}
