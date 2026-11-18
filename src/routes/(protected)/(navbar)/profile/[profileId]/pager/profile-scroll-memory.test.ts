import { describe, expect, it } from "vitest";

import {
	ProfileScrollMemory,
	type RememberedScroll,
} from "./profile-scroll-memory";

const A = 100001;
const B = 100002;

function sharedHistory() {
	const remembered = new Map<number, RememberedScroll>();
	const at = { entry: 1 as number | undefined };
	const visit = ({
		entry,
		traversal,
	}: {
		entry: number;
		traversal: boolean;
	}) => {
		at.entry = entry;
		const memory = new ProfileScrollMemory({
			remembered,
			historyIndex: () => at.entry,
		});
		memory.enter({ traversal });
		return memory;
	};
	return { remembered, at, visit };
}

function scroller(): HTMLElement {
	const element = document.createElement("div");
	element.scrollTop = 0;
	return element;
}

describe("ProfileScrollMemory", () => {
	it("scrolls a profile back to where it was left when a traversal comes back to its entry", () => {
		const { visit } = sharedHistory();
		visit({ entry: 1, traversal: false }).remember({
			profileId: A,
			scrollTop: 640,
		});

		const pane = scroller();
		visit({ entry: 1, traversal: true }).restore({
			profileId: A,
			scroller: pane,
		});

		expect(pane.scrollTop).toBe(640);
	});

	it("opens a profile pushed onto an entry at the top, forgetting that entry and every one above it", () => {
		const { remembered, visit } = sharedHistory();
		visit({ entry: 1, traversal: false }).remember({
			profileId: A,
			scrollTop: 640,
		});
		visit({ entry: 2, traversal: false }).remember({
			profileId: B,
			scrollTop: 320,
		});

		const pane = scroller();
		visit({ entry: 1, traversal: false }).restore({
			profileId: A,
			scroller: pane,
		});

		expect(pane.scrollTop).toBe(0);
		expect([...remembered.keys()]).toEqual([]);
	});

	it("keeps the scroll of entries below a push", () => {
		const { visit } = sharedHistory();
		visit({ entry: 1, traversal: false }).remember({
			profileId: A,
			scrollTop: 640,
		});
		visit({ entry: 2, traversal: false });

		const pane = scroller();
		visit({ entry: 1, traversal: true }).restore({
			profileId: A,
			scroller: pane,
		});

		expect(pane.scrollTop).toBe(640);
	});

	it("leaves a profile paged to on the same entry at the top", () => {
		const { visit } = sharedHistory();
		visit({ entry: 1, traversal: false }).remember({
			profileId: A,
			scrollTop: 640,
		});

		const pane = scroller();
		visit({ entry: 1, traversal: true }).restore({
			profileId: B,
			scroller: pane,
		});

		expect(pane.scrollTop).toBe(0);
	});

	it("restores once per visit, so a later load does not pull the reader back", () => {
		const { visit } = sharedHistory();
		visit({ entry: 1, traversal: false }).remember({
			profileId: A,
			scrollTop: 640,
		});
		const memory = visit({ entry: 1, traversal: true });
		const pane = scroller();

		memory.restore({ profileId: A, scroller: pane });
		pane.scrollTop = 100;
		memory.restore({ profileId: A, scroller: pane });

		expect(pane.scrollTop).toBe(100);
	});

	it("remembers nothing while history has no index", () => {
		const { remembered, at } = sharedHistory();
		at.entry = undefined;
		const memory = new ProfileScrollMemory({
			remembered,
			historyIndex: () => at.entry,
		});
		memory.enter({ traversal: false });

		memory.remember({ profileId: A, scrollTop: 640 });

		expect(remembered.size).toBe(0);
	});
});
