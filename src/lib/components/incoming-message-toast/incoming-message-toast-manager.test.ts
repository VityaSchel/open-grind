import { toast } from "svelte-sonner";
import { afterEach, describe, expect, it } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import { sessionRecovery } from "$lib/api/session-recovery.svelte";
import { t } from "$lib/i18n";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { showIncomingMessageToast } from "./incoming-message-toast-manager";

const CONVERSATION_IDS = ["100001:100002", "100001:100003"];

function showMessageToast(conversationId: string) {
	showIncomingMessageToast({
		conversationId,
		sender: { name: "Sam", avatarMediaHash: null },
		message: apiResponseMessageSchema.parse({
			messageId: `m-${conversationId}`,
			conversationId,
			senderId: 100002,
			timestamp: 1_700_000_000_000,
			type: "Text",
			body: { text: "hello" },
		}),
	});
}

function activeToastIds() {
	return toast.getActiveToasts().map((active) => active.id);
}

afterEach(() => {
	toast.dismiss();
});

describe("toasts on sign-out", () => {
	it("dismisses the message toasts and leaves the session toast up", () => {
		const sessionToast = toast.error(t("feedback.sessionError.expired"));
		for (const conversationId of CONVERSATION_IDS)
			showMessageToast(conversationId);
		expect(activeToastIds()).toHaveLength(3);

		clearAccountCaches();

		expect(activeToastIds()).toStrictEqual([sessionToast]);
	});

	it("dismisses the session recovery toast and leaves the session toast up", () => {
		const sessionToast = toast.error(t("feedback.sessionError.expired"));
		sessionRecovery.report({
			message: "connection reset",
			unauthorized: false,
			kind: "Http",
			attempts: 3,
			transient: false,
		});
		expect(activeToastIds()).toStrictEqual([
			"session-transport",
			sessionToast,
		]);

		clearAccountCaches();

		expect(activeToastIds()).toStrictEqual([sessionToast]);
	});
});
