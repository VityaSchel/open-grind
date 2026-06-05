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

		expect(messages.map(({ messageId, indexInStack, stackLength }) => ({
			messageId,
			indexInStack,
			stackLength,
		}))).toEqual([
			{ messageId: "a", indexInStack: 1, stackLength: 2 },
			{ messageId: "b", indexInStack: 0, stackLength: 2 },
			{ messageId: "c", indexInStack: 0, stackLength: 1 },
		]);
	});
});

describe("groupMessagesByDate", () => {
	it("marks the first rendered message of each day", () => {
		const messages = groupMessagesByDate({
			messages: [
				{
					...baseMessage,
					messageId: "newest",
					senderId: 1,
					timestamp: Date.UTC(2026, 5, 5, 12, 0, 0),
				},
				{
					...baseMessage,
					messageId: "older-same-day",
					senderId: 2,
					timestamp: Date.UTC(2026, 5, 5, 8, 30, 0),
				},
				{
					...baseMessage,
					messageId: "previous-day",
					senderId: 2,
					timestamp: Date.UTC(2026, 5, 4, 23, 45, 0),
				},
			],
		});

		expect(messages.find((message) => message.messageId === "newest")?.dayStart).toBe(
			Date.UTC(2026, 5, 5, 0, 0, 0),
		);
		expect(
			messages.find((message) => message.messageId === "older-same-day")?.dayStart,
		).toBeUndefined();
		expect(
			messages.find((message) => message.messageId === "previous-day")?.dayStart,
		).toBe(Date.UTC(2026, 5, 4, 0, 0, 0));
	});
});

describe("processMessages", () => {
	it("combines stacking and date grouping in one pass", () => {
		const messages = processMessages({
			ourProfileId: 7,
			messages: [
				{
					...baseMessage,
					messageId: "1",
					senderId: 7,
					timestamp: Date.UTC(2026, 5, 5, 9, 0, 20),
				},
				{
					...baseMessage,
					messageId: "2",
					senderId: 7,
					timestamp: Date.UTC(2026, 5, 5, 9, 0, 5),
				},
				{
					...baseMessage,
					messageId: "3",
					senderId: 9,
					timestamp: Date.UTC(2026, 5, 4, 22, 15, 0),
				},
			],
		});

		expect(messages[0]).toMatchObject({
			messageId: "1",
			indexInStack: 1,
			stackLength: 2,
			dayStart: Date.UTC(2026, 5, 5, 0, 0, 0),
		});
		expect(messages[2]).toMatchObject({
			messageId: "3",
			indexInStack: 0,
			stackLength: 1,
			dayStart: Date.UTC(2026, 5, 4, 0, 0, 0),
		});
	});
});
