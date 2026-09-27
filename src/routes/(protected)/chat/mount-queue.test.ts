// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { MountQueue } from "./mount-queue";

const BUDGET_MS = 4;

function harness({ mountCostMs = 0 }: { mountCostMs?: number } = {}) {
	let clock = 0;
	let lastHandle = 0;
	const frames = new Map<number, () => void>();
	const mounted: string[] = [];
	const cancelFrame = vi.fn((handle: number) => frames.delete(handle));
	const queue = new MountQueue({
		requestFrame: (callback) => {
			lastHandle += 1;
			frames.set(lastHandle, callback);
			return lastHandle;
		},
		cancelFrame,
		now: () => clock,
		flush: () => (clock += mountCostMs),
		budgetMs: BUDGET_MS,
	});

	function placeholder(name: string) {
		const node = document.createElement("div");
		node.dataset.name = name;
		document.body.append(node);
		return node;
	}

	function add({
		name,
		node = placeholder(name),
	}: {
		name: string;
		node?: Node;
	}) {
		return queue.add({ node, mount: () => mounted.push(name) });
	}

	function runFrame() {
		const due = [...frames.values()];
		frames.clear();
		for (const callback of due) callback();
		return [...mounted];
	}

	return {
		queue,
		mounted,
		placeholder,
		add,
		runFrame,
		cancelFrame,
		pendingFrames: () => frames.size,
	};
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("MountQueue", () => {
	it("mounts offscreen rows top to bottom whatever order they registered in", () => {
		const { placeholder, add, runFrame } = harness();
		const [first, second, third] = ["first", "second", "third"].map(
			placeholder,
		);
		add({ name: "third", node: third! });
		add({ name: "first", node: first! });
		add({ name: "second", node: second! });

		expect(runFrame()).toEqual(["first", "second", "third"]);
	});

	it("asks for one frame however many rows register", () => {
		const { add, pendingFrames } = harness();
		for (const name of ["a", "b", "c"]) add({ name });

		expect(pendingFrames()).toBe(1);
	});

	it("mounts rows scrolled into view before offscreen rows, top to bottom", () => {
		const { add, runFrame, mounted } = harness({ mountCostMs: BUDGET_MS });
		const tickets = ["a", "b", "c", "d"].map((name) => add({ name }));
		tickets[3]?.promote();
		tickets[1]?.promote();

		for (let frame = 0; frame < tickets.length; frame += 1) runFrame();

		expect(mounted).toEqual(["b", "d", "a", "c"]);
	});

	it("mounts rows on screen before rows only near the screen", () => {
		const { add, runFrame, mounted } = harness({ mountCostMs: BUDGET_MS });
		const tickets = ["a", "b", "c", "d"].map((name) => add({ name }));
		tickets[0]?.promote();
		tickets[2]?.promote({ inView: true });

		for (let frame = 0; frame < tickets.length; frame += 1) runFrame();

		expect(mounted).toEqual(["c", "a", "b", "d"]);
	});

	it("keeps a row on screen ahead when it is later reported only near it", () => {
		const { add, runFrame, mounted } = harness({ mountCostMs: BUDGET_MS });
		const tickets = ["a", "b"].map((name) => add({ name }));
		tickets[1]?.promote({ inView: true });
		tickets[1]?.promote();
		tickets[0]?.promote();

		for (let frame = 0; frame < tickets.length; frame += 1) runFrame();

		expect(mounted).toEqual(["b", "a"]);
	});

	it("stops once the frame budget is spent and carries on next frame", () => {
		const { add, runFrame } = harness({ mountCostMs: 1.5 });
		for (const name of ["a", "b", "c", "d", "e", "f", "g"]) add({ name });

		expect(runFrame()).toHaveLength(3);
		expect(runFrame()).toHaveLength(6);
		expect(runFrame()).toHaveLength(7);
	});

	it("mounts one row per frame even when a single row overruns the budget", () => {
		const { add, runFrame } = harness({ mountCostMs: 50 });
		for (const name of ["a", "b", "c"]) add({ name });

		expect(runFrame()).toEqual(["a"]);
		expect(runFrame()).toEqual(["a", "b"]);
		expect(runFrame()).toEqual(["a", "b", "c"]);
	});

	it("stops asking for frames once every row is mounted", () => {
		const { add, runFrame, pendingFrames } = harness();
		for (const name of ["a", "b"]) add({ name });

		runFrame();

		expect(pendingFrames()).toBe(0);
	});

	it("never mounts a cancelled row", () => {
		const { add, runFrame } = harness();
		add({ name: "a" }).cancel();
		add({ name: "b" });

		expect(runFrame()).toEqual(["b"]);
	});

	it("does not bring back a row by promoting it after it mounted", () => {
		const { add, runFrame, pendingFrames } = harness();
		const ticket = add({ name: "a" });
		runFrame();

		ticket.promote();

		expect(pendingFrames()).toBe(0);
		expect(runFrame()).toEqual(["a"]);
	});

	it("skips a row whose placeholder left the document without spinning", () => {
		const { placeholder, add, runFrame, pendingFrames } = harness();
		const gone = placeholder("gone");
		add({ name: "gone", node: gone });
		add({ name: "kept" });
		gone.remove();

		expect(runFrame()).toEqual(["kept"]);
		expect(pendingFrames()).toBe(0);
	});

	it("cancels its pending frame and forgets every row when destroyed", () => {
		const { queue, add, runFrame, cancelFrame, pendingFrames } = harness();
		add({ name: "a" });

		queue.destroy();

		expect(cancelFrame).toHaveBeenCalledOnce();
		expect(pendingFrames()).toBe(0);
		expect(runFrame()).toEqual([]);
	});

	it("keeps draining the rest when one row fails to mount", () => {
		const { queue, add, runFrame } = harness();
		queue.add({
			node: document.body.appendChild(document.createElement("div")),
			mount: () => {
				throw new Error("render failed");
			},
		});
		add({ name: "after" });

		expect(() => runFrame()).toThrow("render failed");
		expect(runFrame()).toEqual(["after"]);
	});
});
