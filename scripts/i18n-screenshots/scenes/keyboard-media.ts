import type { Scene } from ".";
import { emitEvent } from "./drive";
import { openConversation } from "./media-drop";
import { openAppSettings } from "./settings";
import { addingToast } from "./toast";

const KEYBOARD_MEDIA = "keyboard-media";
const DISCARD = { discard_staged_media: { answer: null } };

export const keyboardMediaFailed: Scene = {
	platform: "phone",
	views: [
		{
			id: "chat/conversation/keyboard-failed",
			screen: "chat/conversation",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openConversation(page);
				await addingToast({
					page,
					action: () =>
						emitEvent({
							page,
							event: KEYBOARD_MEDIA,
							payload: { id: null, mimeType: "image/png" },
						}),
				});
			},
		},
	],
};

export const keyboardMediaOutsideChat: Scene = {
	platform: "phone",
	native: DISCARD,
	views: [
		{
			id: "settings/app/keyboard-outside-chat",
			screen: "settings/app",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				await addingToast({
					page,
					action: () =>
						emitEvent({
							page,
							event: KEYBOARD_MEDIA,
							payload: { id: "sticker", mimeType: "image/png" },
						}),
				});
			},
		},
	],
};
