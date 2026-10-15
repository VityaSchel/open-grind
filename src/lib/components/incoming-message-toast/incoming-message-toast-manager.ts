import { toast } from "svelte-sonner";

import { registerAccountCache } from "$lib/api/account-caches";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import IncomingMessageToast from "./IncomingMessageToast.svelte";

const shownToastIds = new Set<string>();

registerAccountCache({
	reset: () => {
		for (const id of shownToastIds) toast.dismiss(id);
		shownToastIds.clear();
	},
});

export function showIncomingMessageToast({
	message,
	sender,
	conversationId,
}: {
	message: ApiResponseMessage;
	sender?: { name: string; avatarMediaHash: string | null };
	conversationId: string;
}): void {
	shownToastIds.add(conversationId);
	toast.custom(IncomingMessageToast, {
		componentProps: { message, sender, conversationId },
		position: "top-center",
		class: "incoming-message-toast rounded-2xl",
		id: conversationId,
	});
}
