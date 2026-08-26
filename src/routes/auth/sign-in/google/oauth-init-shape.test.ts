import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const VENDOR = "src-tauri/vendor/grindr-google-oauth-webextension/shared";
const INIT = "src-tauri/src/api/google_oauth/oauth_init.js";

const read = (path: string) => readFileSync(path, "utf8");

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const compile = (source: string) => new Function(source);

const buildScript = (config: unknown) =>
	`${read(`${VENDOR}/gis-core.js`)}\n${read(`${VENDOR}/oauth-ui.js`)}\n(${read(INIT)})(${JSON.stringify(config)});`;

describe("google oauth init script", () => {
	it("parses as JavaScript once assembled the way web.rs assembles it", () => {
		expect(() =>
			compile(buildScript({ css: "body{}", nonce: "abc123" })),
		).not.toThrow();
	});

	it("is a function expression taking the config argument", () => {
		const init: unknown = compile(`return (${read(INIT)});`)();
		expect(typeof init).toBe("function");
		expect((init as (config: unknown) => void).length).toBe(1);
	});

	it("waits for the document element before mounting the overlay", async () => {
		const html = document.documentElement;
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const run = new Function(
			"location",
			buildScript({ css: "body{}", nonce: "abc123" }),
		);
		document.removeChild(html);
		try {
			run({ origin: "https://web.grindr.com" });
			expect(document.documentElement).toBeNull();
			document.appendChild(html);
			await new Promise((resolve) => setTimeout(resolve));
			expect(html.classList.contains("grindr-oauth-active")).toBe(true);
		} finally {
			if (!document.documentElement) document.appendChild(html);
			html.classList.remove("grindr-oauth-active");
			html.querySelector(".grindr-oauth-overlay")?.remove();
		}
	});

	it("never reads the nonce or stylesheet off window", () => {
		const source = read(INIT);
		expect(source).not.toContain("window.__grindrOauthCss");
		expect(source).toContain("config.nonce");
	});

	it("origin-checks the postMessage listener", () => {
		expect(read(INIT)).toContain("event.origin !== GOOGLE_ORIGIN");
	});

	it("does not patch HTMLFormElement", () => {
		expect(read(INIT)).not.toContain("HTMLFormElement");
	});
});
