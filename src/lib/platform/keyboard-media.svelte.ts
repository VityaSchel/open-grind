import { listen } from "@tauri-apps/api/event";
import { untrack } from "svelte";
import { toast } from "svelte-sonner";
import z from "zod";

import { t } from "$lib/i18n";
import { discardStagedMedia } from "$lib/platform/media-file";
import { isAndroidPlatform } from "$lib/platform/os";
import type { PickedMedia } from "$lib/platform/media-picker";

const KEYBOARD_MEDIA_EVENT = "keyboard-media";

const stagedSchema = z.object({
	id: z.string().nullable(),
	mimeType: z.string().nullable(),
});

type KeyboardTarget = (media: PickedMedia) => void;

let targets = $state.raw<KeyboardTarget[]>([]);

export function receiveKeyboardMedia(
	target: () => KeyboardTarget | null,
): void {
	$effect(() => {
		const registered = target();
		if (registered === null) return;
		targets = [...untrack(() => targets), registered];
		return () => {
			targets = targets.filter((other) => other !== registered);
		};
	});
}

export function listenForKeyboardMedia(): () => void {
	if (!isAndroidPlatform()) return () => {};
	const unlisten = listen(KEYBOARD_MEDIA_EVENT, ({ payload }) => {
		deliver(stagedSchema.parse(payload));
	});
	return () => void unlisten.then((stop) => stop());
}

function deliver({ id, mimeType }: z.infer<typeof stagedSchema>): void {
	if (id === null) {
		toast.error(t("chat.keyboardMedia.errors.readFailed"));
		return;
	}
	const media: PickedMedia = {
		source: "staged",
		key: crypto.randomUUID(),
		mimeType,
		id,
	};
	const target = targets.at(-1);
	if (target === undefined) {
		toast.error(t("chat.keyboardMedia.errors.notInChat"));
		void discardStagedMedia([media]);
		return;
	}
	target(media);
}
