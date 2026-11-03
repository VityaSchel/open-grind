import { conversationIdFor } from "$lib/chat/conversation-id";
import { demoMeProfileId } from "../config";
import { screenshotScene } from "../screenshot-scene";
import {
	type DemoConversation,
	demoConversationSeeds,
} from "./conversation-seeds";

export function sceneInbox() {
	return __SCREENSHOTS__ ? screenshotScene.inbox : null;
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
