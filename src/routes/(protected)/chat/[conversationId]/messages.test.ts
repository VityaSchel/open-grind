import { describe, expect, it } from "vitest";

import {
	getStackedMessages,
	groupMessagesByDate,
	processMessages,
} from "./messages";

const baseMessage = {
	type: "Text" as const,
	body: { text: "hello" },
	conversationId: "conversation-1",
	unsent: false,
	reactions: [],
};

function localDayStart(timestamp: number): number {
	return new Date(timestamp).setHours(0, 0, 0, 0);
}

describe("getStackedMessages", () => {
	it("groups adjacent messages from the same sender within the same minute", () => {
		const messages = getStackedMessages({
			ourProfileId: 1,
			messages: [
				{
					...baseMessage,
					messageId: "a",
					senderId: 1,
					timestamp: Date.UTC(2026, 5, 5, 12, 0, 50),
				},
				{
					...baseMessage,
					messageId: "b",
					senderId: 1,
					timestamp: Date.UTC(2026, 5, 5, 12, 0, 5),
				},
				{
					...baseMessage,
					messageId: "c",
					senderId: 2,
					timestamp: Date.UTC(2026, 5, 5, 11, 59, 55),
				},
			],
		});

		expect(
			messages.map(({ messageId, indexInStack, stackLength }) => ({
				messageId,
				indexInStack,
				stackLength,
			})),
		).toEqual([
			{ messageId: "a", indexInStack: 1, stackLength: 2 },
			{ messageId: "b", indexInStack: 0, stackLength: 2 },
			{ messageId: "c", indexInStack: 0, stackLength: 1 },
		]);
	});
});

describe("groupMessagesByDate", () => {
	it("marks the oldest message shown for each day", () => {
		const newestTs = Date.UTC(2026, 5, 5, 12, 0, 0);
		const olderSameDayTs = Date.UTC(2026, 5, 5, 8, 30, 0);
		const previousDayTs = Date.UTC(2026, 5, 4, 12, 15, 0);

		const messages = groupMessagesByDate({
			messages: [
				{
					...baseMessage,
					messageId: "newest",
					senderId: 1,
					timestamp: newestTs,
				},
				{
					...baseMessage,
					messageId: "older-same-day",
					senderId: 2,
					timestamp: olderSameDayTs,
				},
				{
					...baseMessage,
					messageId: "previous-day",
					senderId: 2,
					timestamp: previousDayTs,
				},
			],
		});

		expect(
			messages.find((message) => message.messageId === "older-same-day")
				?.dayStart,
		).toBe(localDayStart(olderSameDayTs));
		expect(
			messages.find((message) => message.messageId === "newest")
				?.dayStart,
		).toBe(undefined);
		expect(
			messages.find((message) => message.messageId === "previous-day")
				?.dayStart,
		).toBe(localDayStart(previousDayTs));
	});
});

describe("processMessages", () => {
	it("combines stacking and date grouping in one pass", () => {
		const firstTs = Date.UTC(2026, 5, 5, 9, 0, 20);
		const secondTs = Date.UTC(2026, 5, 5, 9, 0, 5);
		const thirdTs = Date.UTC(2026, 5, 4, 12, 15, 0);

		const messages = processMessages({
			ourProfileId: 7,
			messages: [
				{
					...baseMessage,
					messageId: "1",
					senderId: 7,
					timestamp: firstTs,
				},
				{
					...baseMessage,
					messageId: "2",
					senderId: 7,
					timestamp: secondTs,
				},
				{
					...baseMessage,
					messageId: "3",
					senderId: 9,
					timestamp: thirdTs,
				},
			],
		});

		expect(messages[0]).toMatchObject({
			messageId: "1",
			indexInStack: 1,
			stackLength: 2,
		});
		expect(messages[1]).toMatchObject({
			messageId: "2",
			dayStart: localDayStart(secondTs),
		});
		expect(messages[2]).toMatchObject({
			messageId: "3",
			indexInStack: 0,
			stackLength: 1,
			dayStart: localDayStart(thirdTs),
		});
	});
});
