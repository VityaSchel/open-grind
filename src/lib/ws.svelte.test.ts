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

import { ws } from "$lib/ws.svelte";

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
