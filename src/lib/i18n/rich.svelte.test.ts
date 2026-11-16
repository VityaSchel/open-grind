import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { markup, slot } from "./fixtures/dom";
import Probe from "./fixtures/Probe.svelte";
import { richParts, setLocale, SOURCE_LOCALE } from "./index";
import Rich from "./Rich.svelte";

vi.mock("./catalog-files", () => import("./fixtures/mock-catalog-files"));

const bold = createRawSnippet((text: () => string) => ({
	render: () => `<b>${text()}</b>`,
}));
const italic = (text: string) =>
	createRawSnippet(() => ({ render: () => `<i>${text}</i>` }));

afterEach(async () => {
	await setLocale({ locale: SOURCE_LOCALE });
	document.body.replaceChildren();
});

describe("richParts", () => {
	it("splits the tags and placeholders of the selected template", async () => {
		expect(
			richParts("feedback.requestBlocked.cloudflare.knownIssue"),
		).toEqual([
			{ kind: "text", text: "This is a " },
			{ kind: "tag", name: "knownIssueLink", text: "known issue" },
			{ kind: "text", text: "." },
		]);
		await setLocale({ locale: "eo" });
		expect(
			richParts("feedback.requestBlocked.cloudflare.knownIssue"),
		).toEqual([
			{ kind: "tag", name: "valueOf", text: "Tio" },
			{ kind: "text", text: " estas " },
			{ kind: "tag", name: "knownIssueLink", text: "konata" },
			{ kind: "text", text: " " },
			{ kind: "tag", name: "constructor", text: "problemo" },
			{ kind: "placeholder", name: "toString", text: "{{toString}}" },
			{ kind: "text", text: "." },
		]);
	});

	it("folds string values into the text around them", () => {
		expect(
			richParts("interest.views.preview.cappedViewCount", { count: 99 }),
		).toEqual([
			{ kind: "text", text: "99+" },
			{ kind: "tag", name: "srOnly", text: "views" },
		]);
	});
});

describe("Rich", () => {
	it("renders translator names without a prop as text", async () => {
		await setLocale({ locale: "eo" });
		const probe = mount(Probe, {
			target: document.body,
			props: { count: 1 },
		});
		flushSync();
		expect(markup(slot("known-issue"))).toBe(
			'Tio estas <a href="/issues/81">konata</a> problemo{{toString}}.',
		);
		await unmount(probe);
	});

	it("fills values inside and around the tags of the plural form", async () => {
		const rich = mount(Rich as never, {
			target: document.body,
			props: {
				key: "sample.chat.shared",
				name: "Sam",
				count: 1,
				album: "Trips",
				b: bold,
			},
		});
		flushSync();
		expect(markup(document.body)).toBe(
			"Sam shared <b>1 photo</b> in Trips",
		);
		await unmount(rich);
	});

	it("renders a component placeholder and never reads markup from values", async () => {
		const rich = mount(Rich as never, {
			target: document.body,
			props: {
				key: "sample.chat.shared",
				name: "<b>{{album}}</b>",
				count: 2,
				album: italic("Trips"),
				b: bold,
			},
		});
		flushSync();
		expect(markup(document.body)).toBe(
			"&lt;b&gt;{{album}}&lt;/b&gt; shared <b>2 photos</b> in <i>Trips</i>",
		);
		await unmount(rich);
	});

	it("keeps a component out of tag text", async () => {
		await setLocale({ locale: "eo" });
		const rich = mount(Rich as never, {
			target: document.body,
			props: {
				key: "sample.chat.shared",
				name: italic("Sam"),
				count: 2,
				album: "Trips",
				b: bold,
			},
		});
		flushSync();
		expect(markup(document.body)).toBe(
			"<b>{{name}}</b> dividis 2 fotojn en Trips",
		);
		await unmount(rich);
	});
});
