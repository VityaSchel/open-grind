import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const JAVA = path.join(
	import.meta.dirname,
	"../../src-tauri/gen/android/app/src/main/java",
);

const UNLOCALIZED_READ =
	/(?<![\w.])getString\(R\.|\b(?:context|this|applicationContext|baseContext|activity|resources)\.get(?:String|Text|QuantityString)\(|(?<![\w.])get(?:Text|QuantityString)\(/g;

const unlocalizedReads = (text: string) =>
	[...text.matchAll(UNLOCALIZED_READ)].map(([read]) => read);

describe("the Android app", () => {
	const sources = globSync("**/*.kt", { cwd: JAVA }).map((file) => ({
		file,
		text: readFileSync(path.join(JAVA, file), "utf8"),
	}));

	it("finds reads that skip NativeLanguage", () => {
		expect(
			unlocalizedReads(
				[
					"title.text = getString(R.string.webview_warning_title)",
					"return context.getString(title)",
					"resources.getQuantityString(R.plurals.taps, count)",
					"localized.getString(R.string.push_self)",
					"NativeLanguage.localized(context).getString(R.string.push_self)",
					"extras.getString(EXTRA_SENDER_ID)",
					"keySet().mapNotNull { key -> getString(key) }",
				].join("\n"),
			),
		).toEqual([
			"getString(R.",
			"context.getString(",
			"resources.getQuantityString(",
		]);
	});

	it("reads every string resource in the language NativeLanguage keeps", () => {
		expect(sources.length).toBeGreaterThan(0);
		expect(
			sources.flatMap(({ file, text }) =>
				unlocalizedReads(text).map((read) => `${file}: ${read}`),
			),
		).toEqual([]);
	});
});
