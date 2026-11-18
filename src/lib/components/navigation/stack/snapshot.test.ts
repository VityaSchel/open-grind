import { afterEach, describe, expect, it, vi } from "vitest";

import { snapshotPane, snapshotScreen, trackScrolled } from "./snapshot";

function mountPane(html: string): HTMLElement {
	const pane = document.createElement("div");
	pane.innerHTML = html;
	document.body.append(pane);
	return pane;
}

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

describe("snapshotPane", () => {
	it("is inert and hidden from assistive technology", () => {
		const snapshot = snapshotPane({
			pane: mountPane("<p>Account</p>"),
			path: "/settings",
		});
		expect(snapshot.node.inert).toBe(true);
		expect(snapshot.node.getAttribute("aria-hidden")).toBe("true");
		expect(snapshot.node.textContent).toBe("Account");
		expect(snapshot.path).toBe("/settings");
	});

	it("drops the handles that would make the clone answer to the live page's queries", () => {
		const pane = mountPane(
			'<input id="display-name" /><div data-slot="subpage-scroller"></div>',
		);
		pane.setAttribute("data-slot", "page-stack-pane");

		const snapshot = snapshotPane({ pane, path: "/settings/profile" });
		document.body.append(snapshot.node);

		expect(snapshot.node.dataset.slot).toBe("page-stack-ghost");
		expect(snapshot.node.querySelector("[id]")).toBeNull();
		expect(snapshot.node.querySelector("[data-slot]")).toBeNull();
		expect(document.getElementById("display-name")).not.toBeNull();
		expect(
			document.querySelectorAll('[data-slot="subpage-scroller"]'),
		).toHaveLength(1);
	});

	it("carries the offsets of scrolled elements once the clone is in the document", () => {
		const pane = mountPane(
			'<section><p></p><div class="scroller"></div></section>',
		);
		const stopTracking = trackScrolled(pane);
		const scroller = pane.querySelector<HTMLElement>(".scroller")!;
		scroller.scrollTop = 120;
		scroller.scrollLeft = 30;
		scroller.dispatchEvent(new Event("scroll"));

		const snapshot = snapshotPane({ pane, path: "/settings/account" });
		const copy = snapshot.node.querySelector<HTMLElement>(".scroller")!;
		expect(copy.scrollTop).toBe(0);

		document.body.append(snapshot.node);
		snapshot.restore();
		expect(copy.scrollTop).toBe(120);
		expect(copy.scrollLeft).toBe(30);
		stopTracking?.();
	});

	it("never reads the scroll offset of an element that was not scrolled", () => {
		const pane = mountPane('<div class="scroller"></div><p></p>');
		const stopTracking = trackScrolled(pane);
		const reads = vi.spyOn(Element.prototype, "scrollTop", "get");

		snapshotPane({ pane, path: "/settings/app/credits" }).restore();

		expect(reads).not.toHaveBeenCalled();
		stopTracking?.();
	});

	it("forgets scrolled elements that left the pane", () => {
		const pane = mountPane('<div class="scroller"></div>');
		const stopTracking = trackScrolled(pane);
		const scroller = pane.querySelector<HTMLElement>(".scroller")!;
		scroller.scrollTop = 120;
		scroller.dispatchEvent(new Event("scroll"));
		scroller.remove();
		pane.append(document.createElement("div"));

		const snapshot = snapshotPane({ pane, path: "/settings/account" });
		document.body.append(snapshot.node);
		snapshot.restore();

		expect(snapshot.node.firstElementChild!.scrollTop).toBe(0);
		stopTracking?.();
	});

	it("carries values the clone would otherwise lose", () => {
		const pane = mountPane(
			"<input /><textarea></textarea><select><option>a</option><option>b</option></select>",
		);
		pane.querySelector("input")!.value = "typed";
		pane.querySelector("input")!.checked = true;
		pane.querySelector("textarea")!.value = "about me";
		pane.querySelector("select")!.selectedIndex = 1;

		const snapshot = snapshotPane({ pane, path: "/settings/profile" });
		document.body.append(snapshot.node);
		snapshot.restore();

		expect(snapshot.node.querySelector("input")!.value).toBe("typed");
		expect(snapshot.node.querySelector("input")!.checked).toBe(true);
		expect(snapshot.node.querySelector("textarea")!.value).toBe("about me");
		expect(snapshot.node.querySelector("select")!.selectedIndex).toBe(1);
	});

	it("reads the live values at capture time, not at restore time", () => {
		const pane = mountPane("<input />");
		const input = pane.querySelector("input")!;
		input.value = "captured";

		const snapshot = snapshotPane({ pane, path: "/settings/profile" });
		input.value = "changed after capture";
		pane.remove();

		document.body.append(snapshot.node);
		snapshot.restore();
		expect(snapshot.node.querySelector("input")!.value).toBe("captured");
	});

	it("pins each row that skips offscreen rendering to the content box it fills live, fractions included", () => {
		const pane = mountPane(
			'<p data-offscreen-skip style="padding: 6px 4px; border-width: 0"></p><p data-offscreen-skip style="padding: 2px; border: 1.5px solid"></p>',
		);
		const rows = pane.querySelectorAll<HTMLElement>(
			"[data-offscreen-skip]",
		);
		const liveHeights = [54.5, 310.25];
		rows.forEach((row, index) =>
			vi
				.spyOn(row, "getBoundingClientRect")
				.mockReturnValue({ height: liveHeights[index] } as DOMRect),
		);

		const snapshot = snapshotPane({ pane, path: "/settings/app/credits" });
		document.body.append(snapshot.node);
		snapshot.restore();

		const copies = snapshot.node.querySelectorAll<HTMLElement>(
			"[data-offscreen-skip]",
		);
		expect(copies[0]?.style.containIntrinsicBlockSize).toBe("42.5px");
		expect(copies[1]?.style.containIntrinsicBlockSize).toBe("303.25px");
	});
});

describe("snapshot sanitizing", () => {
	it("leaves out the ghost and dim layers a stack had mounted mid-slide", () => {
		const root = mountPane(
			'<div data-slot="page-stack-pane"><p>Live</p></div><div data-slot="page-stack-ghost"><p>Ghost</p></div><div data-slot="page-stack-dim"></div><div data-slot="live-stack-dim"></div>',
		);

		for (const snapshot of [
			snapshotPane({ pane: root, path: "/settings" }),
			snapshotScreen({ root, path: "/settings" }),
		]) {
			expect(snapshot.node.textContent).toBe("Live");
			expect(snapshot.node.children).toHaveLength(1);
		}
	});

	it("puts every stack pane it copied back at rest without its stack's handle", () => {
		const root = mountPane(
			'<div data-slot="live-stack-base" style="transform: translate3d(-33%, 0, 0); z-index: 10"></div><div data-slot="live-stack-sheet" style="transform: translate3d(40%, 0, 0); opacity: 0.5"></div>',
		);
		root.setAttribute("data-slot", "page-stack-pane");
		root.style.transform = "translate3d(20%, 0, 0)";

		const snapshot = snapshotScreen({ root, path: "/chat" });

		const [base, sheet] = snapshot.node
			.children as unknown as HTMLElement[];
		expect(snapshot.node.style.transform).toBe("");
		expect(base!.style.transform).toBe("");
		expect(base!.style.zIndex).toBe("10");
		expect(sheet!.style.transform).toBe("");
		expect(sheet!.style.opacity).toBe("");
		expect(base!.hasAttribute("data-slot")).toBe(false);
		expect(sheet!.hasAttribute("data-slot")).toBe(false);
		expect(
			root.querySelector('[data-slot="live-stack-base"]'),
		).not.toBeNull();
	});

	it("carries scroll offsets and field values past the layers it leaves out", () => {
		const root = mountPane(
			'<div data-slot="page-stack-ghost"><input /><div class="scroller"></div></div><input /><div class="scroller"></div>',
		);
		const stopTracking = trackScrolled(root);
		const [ghostField, liveField] = root.querySelectorAll("input");
		ghostField!.value = "ghost";
		liveField!.value = "live";
		const scroller = root.lastElementChild as HTMLElement;
		scroller.scrollTop = 80;
		scroller.dispatchEvent(new Event("scroll"));

		const snapshot = snapshotScreen({ root, path: "/profile/1" });
		document.body.append(snapshot.node);
		snapshot.restore();

		expect(snapshot.node.querySelectorAll("input")).toHaveLength(1);
		expect(snapshot.node.querySelector("input")!.value).toBe("live");
		expect(
			snapshot.node.querySelector<HTMLElement>(".scroller")!.scrollTop,
		).toBe(80);
		stopTracking?.();
	});
});

describe("snapshotScreen", () => {
	it("keeps the handles that styling and layout read inside the screen", () => {
		const root = mountPane(
			'<section class="has-data-[slot=profile-field]:flex"><div data-slot="profile-field" id="about">About</div></section><div data-slot="grid-content"></div>',
		);

		const snapshot = snapshotScreen({ root, path: "/profile/1" });
		document.body.append(snapshot.node);

		expect(snapshot.node.dataset.slot).toBe("screen-ghost");
		expect(
			snapshot.node.querySelector('[data-slot="profile-field"]'),
		).not.toBeNull();
		expect(
			snapshot.node.querySelector('[data-slot="grid-content"]'),
		).not.toBeNull();
		expect(snapshot.node.querySelector("[id]")).toBeNull();
		expect(document.querySelectorAll("#about")).toHaveLength(1);
	});

	it("is inert and hidden from assistive technology", () => {
		const snapshot = snapshotScreen({
			root: mountPane("<p>Browse</p>"),
			path: "/",
		});
		expect(snapshot.node.inert).toBe(true);
		expect(snapshot.node.getAttribute("aria-hidden")).toBe("true");
		expect(snapshot.path).toBe("/");
	});

	it("leaves the live fixed header the only one a page query finds", () => {
		const root = mountPane("<header data-fixed-header></header>");

		const snapshot = snapshotScreen({ root, path: "/" });
		document.body.append(snapshot.node);

		expect(snapshot.node.querySelector("header")).not.toBeNull();
		expect(document.querySelectorAll("[data-fixed-header]")).toHaveLength(
			1,
		);
		expect(
			document
				.querySelector("[data-fixed-header]")
				?.closest('[data-slot="screen-ghost"]'),
		).toBeNull();
	});

	it("copies videos as still frames that load and play nothing", () => {
		const root = mountPane(
			'<video src="ogmedia://clip.mp4" poster="ogmedia://still.jpg" autoplay muted loop></video>',
		);

		const video = snapshotScreen({
			root,
			path: "/profile/1",
		}).node.querySelector("video")!;

		expect(video.hasAttribute("src")).toBe(false);
		expect(video.autoplay).toBe(false);
		expect(video.getAttribute("poster")).toBe("ogmedia://still.jpg");
		expect(root.querySelector("video")!.getAttribute("src")).toBe(
			"ogmedia://clip.mp4",
		);
	});
});

describe("snapshotPane strip mode", () => {
	it("keeps clearing every handle and leaves videos as they were", () => {
		const root = mountPane(
			'<div data-slot="profile-field" id="about"></div><header data-fixed-header></header><video src="ogmedia://clip.mp4" autoplay></video>',
		);

		const snapshot = snapshotPane({
			pane: root,
			path: "/settings/profile",
		});

		expect(snapshot.node.querySelector("[data-slot]")).toBeNull();
		expect(snapshot.node.querySelector("[id]")).toBeNull();
		expect(
			snapshot.node.querySelector("[data-fixed-header]"),
		).not.toBeNull();
		expect(snapshot.node.querySelector("video")!.getAttribute("src")).toBe(
			"ogmedia://clip.mp4",
		);
	});
});
