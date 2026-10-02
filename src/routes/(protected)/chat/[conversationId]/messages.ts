import { getConversationMessages } from "$lib/api/messaging/messages";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";

type StackedMessage = Pick<ApiResponseMessage, "messageId" | "timestamp"> & {
	indexInStack: number;
	stackLength: number;
};

export function getStackedMessages({
	messages,
	ourProfileId,
}: {
	messages: ApiResponseMessage[];
	ourProfileId: number;
}) {
	const stackedMessages: StackedMessage[] = [];

	let stack:
		| { time: number; isOut: boolean; messages: ApiResponseMessage[] }
		| undefined;
	const flush = () => {
		if (stack) {
			const stackMessages = stack.messages;
			stackedMessages.push(
				...stackMessages.map(({ messageId, timestamp }, i, arr) => ({
					messageId,
					timestamp,
					indexInStack: arr.length - 1 - i,
					stackLength: arr.length,
				})),
			);
			stack = undefined;
		}
	};
	for (const message of messages) {
		const isOut = message.senderId === ourProfileId;
		const timeMs = new Date(message.timestamp).getTime();
		const time = Math.floor(timeMs / 60000) * 60000;
		if (stack && stack.isOut === isOut && time === stack.time) {
			stack.messages.push(message);
		} else {
			flush();
			stack = { time, isOut, messages: [message] };
		}
	}
	flush();

	return stackedMessages;
}

type GroupedMessage = { dayStart?: number };

export function groupMessagesByDate<
	T extends Pick<ApiResponseMessage, "timestamp">,
>({ messages }: { messages: T[] }): (T & GroupedMessage)[] {
	let dayStartGroup: number | undefined;
	const groupedMessages = messages.toReversed().map((message) => {
		const dayStart = new Date(message.timestamp).setHours(0, 0, 0, 0);
		if (dayStart !== dayStartGroup) {
			dayStartGroup = dayStart;
			return { ...message, dayStart };
		}
		return message;
	});
	return groupedMessages.toReversed();
}

export function processMessages({
	messages,
	ourProfileId,
}: {
	messages: ApiResponseMessage[];
	ourProfileId: number;
}) {
	return groupMessagesByDate({
		messages: getStackedMessages({ messages, ourProfileId }),
	});
}

export async function getConversation({
	conversationId,
	pageKey,
}: {
	conversationId: string;
	pageKey?: string;
}) {
	return await getConversationMessages({ conversationId, pageKey }).then(
		(res) => {
			return { ...res, pageKey: res.messages.at(-1)?.messageId ?? null };
		},
	);
}
