import { toast } from "svelte-sonner";

import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import IncomingMessageToast from "./IncomingMessageToast.svelte";

export function showIncomingMessageToast({
	message,
	sender,
	conversationId,
}: {
	message: ApiResponseMessage;
	sender?: { name: string; avatarMediaHash: string | null };
	conversationId: string;
}): void {
	toast.custom(IncomingMessageToast, {
		componentProps: {
			message,
			sender,
			conversationId,
		},
		position: "top-center",
		class: "incoming-message-toast rounded-2xl",
		id: conversationId,
	});
}
