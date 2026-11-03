import { conversationIdFor } from "$lib/chat/conversation-id";
import { demoMeProfileId, screenshotsEnabled } from "../config";
import { screenshotScene } from "../screenshot-scene";
import {
	type DemoConversation,
	demoConversationSeeds,
} from "./conversation-seeds";

export function sceneInbox() {
	return screenshotsEnabled ? screenshotScene.inbox : null;
}

export function conversationSeeds(): DemoConversation[] {
	return sceneInbox()?.conversations ?? demoConversationSeeds();
}

export function conversationSeed(
	conversationId: string,
): DemoConversation | undefined {
	return conversationSeeds().find(
		(conv) =>
			conversationIdFor({
				profileId: conv.withId,
				ourProfileId: demoMeProfileId,
			}) === conversationId,
	);
}
