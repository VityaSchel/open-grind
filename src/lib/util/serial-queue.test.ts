import { describe, expect, it } from "vitest";

import { createSerialQueue } from "./serial-queue";

describe("createSerialQueue", () => {
	it("starts each task only once the one queued before it settles", async () => {
		const enqueue = createSerialQueue();
		const first = Promise.withResolvers<string>();
		const started: string[] = [];

		const a = enqueue(() => {
			started.push("a");
			return first.promise;
		});
		const b = enqueue(() => {
			started.push("b");
			return Promise.resolve("b");
		});
		await Promise.resolve();
		expect(started).toEqual(["a"]);

		first.resolve("a");

		await expect(a).resolves.toBe("a");
		await expect(b).resolves.toBe("b");
		expect(started).toEqual(["a", "b"]);
	});

	it("lets the next task run after one fails", async () => {
		const enqueue = createSerialQueue();

		const failed = enqueue(() => Promise.reject(new Error("offline")));
		const next = enqueue(() => Promise.resolve("sent"));

		await expect(failed).rejects.toThrow("offline");
		await expect(next).resolves.toBe("sent");
	});

	it("queues a retry behind everything already waiting", async () => {
		const enqueue = createSerialQueue();
		const order: string[] = [];
		const run = (name: string) => () => {
			order.push(name);
			return Promise.resolve(name);
		};

		await Promise.all([
			enqueue(run("video")),
			enqueue(run("photo")),
			enqueue(run("video retry")),
		]);

		expect(order).toEqual(["video", "photo", "video retry"]);
	});
});
