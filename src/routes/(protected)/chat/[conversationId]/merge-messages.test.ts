import { afterEach, describe, expect, it } from "vitest";

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import {
	mergeServerMessages,
	type OptimisticMessage,
	patchMessages,
} from "./merge-messages";

function message(messageId: string, timestamp: number): ApiResponseMessage {
	return {
		messageId,
		conversationId: "1:2",
		senderId: 2,
		timestamp,
		unsent: false,
		reactions: [],
		type: "Text",
		body: { text: messageId },
	} as unknown as ApiResponseMessage;
}

const sent = (id: string, timestamp: number): OptimisticMessage => ({
	...message(id, timestamp),
	status: "sent",
});

describe("mergeServerMessages", () => {
	it("empties the thread when the server has nothing left", () => {
		const result = mergeServerMessages({
			local: [sent("b", 2000), sent("a", 1000)],
			server: [],
		});

		expect(result.messages).toEqual([]);
		expect(result.changed).toBe(true);
	});

	it("keeps unsent work in progress when the server empties the thread", () => {
		const pending: OptimisticMessage = {
			...message("draft", 3000),
			status: "pending",
		};

		const result = mergeServerMessages({
			local: [pending, sent("a", 1000)],
			server: [],
		});

		expect(result.messages).toEqual([pending]);
		expect(result.changed).toBe(true);
	});

	it("still keeps messages older than a partial server page", () => {
		const older = sent("a", 1000);

		const result = mergeServerMessages({
			local: [sent("b", 2000), older],
			server: [message("b", 2000)],
		});

		expect(result.messages.map((m) => m.messageId)).toEqual(["b", "a"]);
		expect(result.changed).toBe(false);
	});
});

describe("mergeServerMessages with signed media", () => {
	const SIGNED_AT_S = 1_700_000_000;
	const LIFETIME_S = 15 * 60;

	afterEach(() => resetNowForTesting());

	function album({
		cover = "a.jpg",
		signedAt,
		isViewable = true,
	}: {
		cover?: string;
		signedAt: number;
		isViewable?: boolean;
	}): ApiResponseMessage {
		return {
			...message("album", 1000),
			type: "Album",
			body: {
				albumId: 7,
				coverUrl: `https://d3.cloudfront.net/${cover}?Expires=${signedAt + LIFETIME_S}&Signature=S${signedAt}&Key-Pair-Id=K`,
				isViewable,
				hasPhoto: true,
				hasVideo: false,
			},
		} as unknown as ApiResponseMessage;
	}

	const local = (...messages: ApiResponseMessage[]): OptimisticMessage[] =>
		messages.map((m) => ({ ...m, status: "sent" }));

	const coverOf = (messages: OptimisticMessage[], messageId: string) =>
		(
			messages.find((m) => m.messageId === messageId)?.body as {
				coverUrl: string;
			}
		).coverUrl;

	it("keeps a signature the server renewed less than ten minutes later", () => {
		const result = mergeServerMessages({
			local: local(album({ signedAt: SIGNED_AT_S })),
			server: [album({ signedAt: SIGNED_AT_S + 9 * 60 })],
		});

		expect(result.changed).toBe(false);
	});

	it("adopts a signature the server renewed ten minutes later", () => {
		const result = mergeServerMessages({
			local: local(album({ signedAt: SIGNED_AT_S })),
			server: [album({ signedAt: SIGNED_AT_S + 10 * 60 })],
		});

		expect(result.changed).toBe(true);
		expect(coverOf(result.messages, "album")).toContain(
			`Signature=S${SIGNED_AT_S + 10 * 60}`,
		);
	});

	it("decides renewal by the server's clock, whatever the device clock says", () => {
		const renewal = {
			local: local(album({ signedAt: SIGNED_AT_S })),
			server: [album({ signedAt: SIGNED_AT_S + 60 * 60 })],
		};
		const rotation = {
			local: local(album({ signedAt: SIGNED_AT_S })),
			server: [album({ signedAt: SIGNED_AT_S + 60 })],
		};

		for (const skewS of [-20 * 60, 20 * 60]) {
			setNowForTesting(() => (SIGNED_AT_S + skewS) * 1000);
			expect(mergeServerMessages(renewal).changed).toBe(true);
			expect(mergeServerMessages(rotation).changed).toBe(false);
		}
	});

	it("does not churn while the server keeps handing out the same signature", () => {
		const same = album({ signedAt: SIGNED_AT_S });

		const result = mergeServerMessages({
			local: local(same),
			server: [same],
		});

		expect(result.changed).toBe(false);
	});

	it("keeps fresh local signatures when something else in the page changed", () => {
		const result = mergeServerMessages({
			local: local(album({ signedAt: SIGNED_AT_S })),
			server: [
				message("new", 2000),
				album({ signedAt: SIGNED_AT_S + 60 }),
			],
		});

		expect(result.changed).toBe(true);
		expect(coverOf(result.messages, "album")).toContain(
			`Signature=S${SIGNED_AT_S}`,
		);
	});

	it("adopts a body that points at a different file", () => {
		const result = mergeServerMessages({
			local: local(album({ signedAt: SIGNED_AT_S })),
			server: [album({ cover: "b.jpg", signedAt: SIGNED_AT_S + 60 })],
		});

		expect(result.changed).toBe(true);
	});

	it("adopts a body whose album was locked in the meantime", () => {
		const result = mergeServerMessages({
			local: local(album({ signedAt: SIGNED_AT_S })),
			server: [album({ signedAt: SIGNED_AT_S, isViewable: false })],
		});

		expect(result.changed).toBe(true);
	});
});

describe("patchMessages", () => {
	const text = ({ id, text }: { id: string; text: string }) =>
		({
			...message(id, 1000),
			body: { text },
		}) as unknown as ApiResponseMessage;

	it("updates only the refreshed messages and drops none", () => {
		const pending: OptimisticMessage = {
			...text({ id: "draft", text: "draft" }),
			status: "pending",
		};
		const local: OptimisticMessage[] = [
			pending,
			{ ...text({ id: "a", text: "old" }), status: "sent" },
			{ ...text({ id: "b", text: "kept" }), status: "sent" },
		];

		const result = patchMessages({
			local,
			server: [text({ id: "a", text: "new" })],
		});

		expect(result.changed).toBe(true);
		expect(
			result.messages.map((m) => [
				m.messageId,
				(m.body as { text: string }).text,
			]),
		).toEqual([
			["draft", "draft"],
			["a", "new"],
			["b", "kept"],
		]);
	});

	it("reports no change when the refreshed messages are the same", () => {
		const a = text({ id: "a", text: "same" });

		expect(
			patchMessages({ local: [{ ...a, status: "sent" }], server: [a] })
				.changed,
		).toBe(false);
	});

	it("adopts any newer signature a refresh hands out", () => {
		const signed = (expires: number) =>
			({
				...message("album", 1000),
				type: "Album",
				body: {
					albumId: 7,
					coverUrl: `https://d3.cloudfront.net/a.jpg?Expires=${expires}&Signature=S${expires}`,
				},
			}) as unknown as ApiResponseMessage;
		const local = (expires: number): OptimisticMessage[] => [
			{ ...signed(expires), status: "sent" },
		];

		const renewed = patchMessages({
			local: local(1_700_000_000),
			server: [signed(1_700_000_300)],
		});
		expect(renewed.changed).toBe(true);
		expect(renewed.messages[0]?.body).toMatchObject({
			coverUrl: expect.stringContaining("Expires=1700000300"),
		});

		expect(
			patchMessages({
				local: local(1_700_000_300),
				server: [signed(1_700_000_000)],
			}).changed,
		).toBe(false);
	});

	it("reports a message the server stopped marking dynamic", () => {
		const a = { ...text({ id: "a", text: "same" }), dynamic: true };

		expect(
			patchMessages({
				local: [{ ...a, status: "sent" }],
				server: [{ ...a, dynamic: false }],
			}).changed,
		).toBe(true);
	});

	it("never patches a message that is still being sent", () => {
		const pending: OptimisticMessage = {
			...text({ id: "a", text: "draft" }),
			status: "pending",
		};

		const result = patchMessages({
			local: [pending],
			server: [text({ id: "a", text: "server" })],
		});

		expect(result.changed).toBe(false);
		expect(result.messages).toEqual([pending]);
	});
});
