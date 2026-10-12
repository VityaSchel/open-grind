import { createContext, onDestroy, untrack } from "svelte";
import { toast } from "svelte-sonner";

import {
	chatMediaFailureMessage,
	uploadChatMediaFile,
} from "$lib/api/messaging/chat-media";
import { uploadRefusalMessage } from "$lib/api/methods";
import { CHAT_MEDIA_MAX_LABEL } from "$lib/model/messaging/chat-media-limits";
import {
	discardStagedMedia,
	type MediaPreview,
	previewMedia,
} from "$lib/platform/media-file";
import {
	type ScreenedMedia,
	screenMedia,
} from "$lib/platform/media-intake.svelte";
import { createSerialQueue } from "$lib/util/serial-queue";
import type { PickedMedia } from "$lib/platform/media-picker";
import { sendNowDraft } from "../attachments/media/media-messages";
import type { MessageComposerContext } from "../message-composer-context.svelte";

const UNREADABLE_PHOTO_MESSAGE = "Couldn't read that photo";

export type OfferedMedia = ScreenedMedia & {
	preview: MediaPreview | null;
	previewing: boolean;
};

async function upload({ media, inspection }: ScreenedMedia): Promise<number> {
	try {
		return (await uploadChatMediaFile(media, { inspection })).mediaId;
	} catch (error) {
		toast.error(chatMediaFailureMessage(error));
		throw error;
	}
}

export class SendMediaOffer {
	items = $state<OfferedMedia[]>([]);
	#conversationId = $state<string | null>(null);
	#composers = $state.raw<MessageComposerContext[]>([]);

	get sendable(): boolean {
		const composer = this.#composer();
		return composer !== undefined && !composer().disabled;
	}

	#composer(): MessageComposerContext | undefined {
		return this.#composers.findLast(
			(composer) => composer().conversationId === this.#conversationId,
		);
	}

	#lent(conversationId: string): boolean {
		return this.#composers.some(
			(composer) => composer().conversationId === conversationId,
		);
	}

	lend(composer: MessageComposerContext): void {
		$effect(() => {
			this.#composers = [...untrack(() => this.#composers), composer];
			return () => {
				this.#composers = this.#composers.filter(
					(lent) => lent !== composer,
				);
			};
		});
	}

	async offer({
		conversationId,
		media,
	}: {
		conversationId: string;
		media: PickedMedia[];
	}): Promise<void> {
		const screened = await screenMedia({ media, videos: true });
		if (screened.length === 0) return;
		if (!this.#lent(conversationId)) {
			await discardStagedMedia(screened.map((item) => item.media));
			return;
		}
		if (this.#conversationId !== conversationId) this.cancel();
		this.#conversationId = conversationId;
		const start = this.items.length;
		this.items.push(
			...screened.map((item) => ({
				...item,
				preview: null,
				previewing: item.inspection.kind === "photo",
			})),
		);
		for (const item of this.items.slice(start)) {
			if (item.previewing) void this.#loadPreview(item);
		}
	}

	async #loadPreview(item: OfferedMedia): Promise<void> {
		try {
			item.preview = await previewMedia(item.media);
		} catch (error) {
			console.error(error);
			toast.error(
				uploadRefusalMessage({
					error,
					limitLabel: CHAT_MEDIA_MAX_LABEL,
				}) ?? UNREADABLE_PHOTO_MESSAGE,
			);
			this.items = this.items.filter((offered) => offered !== item);
			void discardStagedMedia([item.media]);
		} finally {
			item.previewing = false;
		}
	}

	send(): void {
		const composer = this.#composer();
		if (composer === undefined) return;
		const items = this.items;
		this.items = [];
		const inTurn = createSerialQueue();
		void composer().sendMessages(
			items.map(({ media, inspection, preview }) =>
				sendNowDraft({
					inspection,
					preview,
					upload: () => inTurn(() => upload({ media, inspection })),
				}),
			),
		);
	}

	cancel(): void {
		const items = this.items;
		this.items = [];
		void discardStagedMedia(items.map(({ media }) => media));
	}

	keepFor(conversationId: string | null): void {
		untrack(() => {
			if (this.#conversationId !== conversationId) this.cancel();
		});
	}
}

const [getSendMediaOffer, setSendMediaOffer] = createContext<SendMediaOffer>();

export { getSendMediaOffer };

export function provideSendMediaOffer(): SendMediaOffer {
	const offer = new SendMediaOffer();
	setSendMediaOffer(offer);
	onDestroy(() => offer.cancel());
	return offer;
}
