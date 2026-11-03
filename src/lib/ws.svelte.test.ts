import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

const { invokeMock, listeners } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	listeners: new Map<string, ((event: { payload: unknown }) => void)[]>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({
	listen: (name: string, handler: (event: { payload: unknown }) => void) => {
		const forName = listeners.get(name) ?? [];
		forName.push(handler);
		listeners.set(name, forName);
		return Promise.resolve(() => {
			listeners.set(
				name,
				(listeners.get(name) ?? []).filter((it) => it !== handler),
			);
		});
	},
}));

import { apiResponseMessageSchema } from "#lib/model/messaging/messages.ts";
import { ws } from "#lib/ws.svelte.ts";

const RESPONSE_EVENT = "grindr:chat_v1_message_send_response";
const responseSchema = z.object({ messageId: z.string() });

function sentRefId() {
	const call = invokeMock.mock.calls.at(-1)?.[1] as {
		command: { ref_id: string };
	};
	return call.command.ref_id;
}

async function emitResponse(payload: unknown) {
	for (const handler of listeners.get(RESPONSE_EVENT) ?? []) {
		handler({ payload });
	}
	await Promise.resolve();
}

function frame(overrides: Record<string, unknown> = {}) {
	return {
		type: "chat.v1.message.send.response",
		notificationId: null,
		ref: sentRefId(),
		status: 200,
		payload: { messageId: "msg-1" },
		...overrides,
	};
}

function sendCommand() {
	return ws.sendCommand({
		type: "chat.v1.message.send",
		payload: { hello: "world" },
		responseSchema,
	});
}

describe("ws.sendCommand", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		invokeMock.mockResolvedValue(undefined);
		listeners.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("resolves with the parsed response payload", async () => {
		const pending = sendCommand();
		await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
		await emitResponse(frame());

		await expect(pending).resolves.toEqual({ messageId: "msg-1" });
	});

	it("treats a missing status as success, the way the official client does", async () => {
		const pending = sendCommand();
		await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
		await emitResponse(frame({ status: null }));

		await expect(pending).resolves.toEqual({ messageId: "msg-1" });
	});

	it("rejects when the server answers with an error status", async () => {
		const pending = sendCommand();
		await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
		await emitResponse(frame({ status: 400 }));

		await expect(pending).rejects.toMatchObject({
			name: "ApiError",
			response: { status: 400 },
		});
	});

	it("keeps an error frame's payload as the response body", async () => {
		const pending = sendCommand();
		await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
		const problem = { type: "urn:gr:err:entitlement_limit", status: 402 };
		await emitResponse(frame({ status: 402, payload: problem }));

		await expect(pending).rejects.toMatchObject({
			response: { status: 402, body: JSON.stringify(problem) },
		});
	});

	it("leaves the body empty when an error frame carries no payload", async () => {
		const pending = sendCommand();
		await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
		await emitResponse(frame({ status: 500, payload: null }));

		await expect(pending).rejects.toMatchObject({
			response: { status: 500, body: "" },
		});
	});

	it("ignores a response meant for a different command", async () => {
		const pending = sendCommand();
		await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
		await emitResponse(frame({ ref: "someone-elses-ref" }));

		let settled = false;
		void pending.then(
			() => (settled = true),
			() => (settled = true),
		);
		await Promise.resolve();
		expect(settled).toBe(false);

		await emitResponse(frame());
		await expect(pending).resolves.toEqual({ messageId: "msg-1" });
	});

	it("keeps a transport failure's kind instead of flattening it", async () => {
		const appError = { kind: "Http", message: "WS not connected" };
		invokeMock.mockRejectedValue(appError);

		await expect(sendCommand()).rejects.toMatchObject({
			name: "ApiError",
			kind: "Http",
			cause: appError,
		});
	});

	it("stops listening once it has settled", async () => {
		const pending = sendCommand();
		await vi.waitFor(() => expect(invokeMock).toHaveBeenCalled());
		await emitResponse(frame());
		await pending;

		expect(listeners.get(RESPONSE_EVENT) ?? []).toHaveLength(0);
	});

	it("gives up when the server never answers", async () => {
		vi.useFakeTimers();
		const pending = ws.sendCommand({
			type: "chat.v1.message.send",
			payload: {},
			responseSchema,
			timeoutMs: 50,
		});
		const assertion = expect(pending).rejects.toThrow("timed out");
		await vi.advanceTimersByTimeAsync(50);
		await assertion;
	});
});

describe("ws in the demo", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		invokeMock.mockResolvedValue(undefined);
		listeners.clear();
		vi.stubGlobal("__DEMO__", true);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("opens no native socket at startup", () => {
		ws.connect();

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("reconnects without touching the native socket", async () => {
		await ws.reconnect();

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("sends nothing over the native socket", () => {
		ws.send("chat.v1.typing_status", { conversationId: "1:2" });

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("answers a reply from the demo instead of the native socket", async () => {
		const reply = await ws.sendCommand({
			type: "chat.v1.message.send",
			payload: {
				type: "Text",
				target: { type: "Direct", targetId: 100001 },
				body: { text: "hi" },
				replyToMessageId: "1:missing",
			},
			responseSchema: apiResponseMessageSchema,
		});

		expect(reply).toMatchObject({ type: "Text", body: { text: "hi" } });
		expect(invokeMock).not.toHaveBeenCalled();
		expect(listeners.get(RESPONSE_EVENT) ?? []).toHaveLength(0);
	});

	it("rejects a command the demo cannot answer without sending it", async () => {
		await expect(
			ws.sendCommand({
				type: "fixture.probe",
				payload: {},
				responseSchema,
			}),
		).rejects.toThrow();

		expect(invokeMock).not.toHaveBeenCalled();
	});
});
