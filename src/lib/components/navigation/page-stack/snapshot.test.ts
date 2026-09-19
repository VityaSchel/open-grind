import { afterEach, describe, expect, it } from "vitest";

import { snapshotPane } from "./snapshot";

function mountPane(html: string): HTMLElement {
	const pane = document.createElement("div");
	pane.innerHTML = html;
	document.body.append(pane);
	return pane;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("snapshotPane", () => {
	it("is inert and hidden from assistive technology", () => {
		const snapshot = snapshotPane(mountPane("<p>Account</p>"), "/settings");
		expect(snapshot.node.inert).toBe(true);
		expect(snapshot.node.getAttribute("aria-hidden")).toBe("true");
		expect(snapshot.node.textContent).toBe("Account");
		expect(snapshot.path).toBe("/settings");
	});

	it("drops the handles that would make the clone answer to the live page's queries", () => {
		const pane = mountPane(
			'<input id="display-name" /><div data-slot="settings-scroller"></div>',
		);
		pane.setAttribute("data-slot", "page-stack-pane");

		const snapshot = snapshotPane(pane, "/settings/profile");
		document.body.append(snapshot.node);

		expect(snapshot.node.hasAttribute("data-slot")).toBe(false);
		expect(snapshot.node.querySelector("[id]")).toBeNull();
		expect(snapshot.node.querySelector("[data-slot]")).toBeNull();
		expect(document.getElementById("display-name")).not.toBeNull();
		expect(
			document.querySelectorAll('[data-slot="settings-scroller"]'),
		).toHaveLength(1);
	});

	it("carries scroll offsets once the clone is in the document", () => {
		const pane = mountPane('<div class="scroller"></div>');
		const scroller = pane.querySelector<HTMLElement>(".scroller")!;
		scroller.scrollTop = 120;

		const snapshot = snapshotPane(pane, "/settings/account");
		const copy = snapshot.node.querySelector<HTMLElement>(".scroller")!;
		expect(copy.scrollTop).toBe(0);

		document.body.append(snapshot.node);
		snapshot.restore();
		expect(copy.scrollTop).toBe(120);
	});

	it("carries values the clone would otherwise lose", () => {
		const pane = mountPane(
			"<input /><textarea></textarea><select><option>a</option><option>b</option></select>",
		);
		pane.querySelector("input")!.value = "typed";
		pane.querySelector("input")!.checked = true;
		pane.querySelector("textarea")!.value = "about me";
		pane.querySelector("select")!.selectedIndex = 1;

		const snapshot = snapshotPane(pane, "/settings/profile");
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

		const snapshot = snapshotPane(pane, "/settings/profile");
		input.value = "changed after capture";
		pane.remove();

		document.body.append(snapshot.node);
		snapshot.restore();
		expect(snapshot.node.querySelector("input")!.value).toBe("captured");
	});
});
