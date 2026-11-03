import { albumShares } from "$lib/chat/album-shares.svelte";
import {
	albumReplyTarget,
	type AlbumSlide,
} from "$lib/components/album/album-lightbox";
import {
	type AlbumContentReactionMessage,
	type AlbumContentReplyMessage,
	type AlbumMessage,
	draftFromAlbumContent,
	draftFromAlbumReaction,
} from "$lib/model/messaging/messages";
import { getConversationState } from "../../conversation-state.svelte";

type AlbumBody =
	| AlbumMessage["body"]
	| AlbumContentReplyMessage["body"]
	| AlbumContentReactionMessage["body"];

export class AlbumMessageState {
	#message: () => AlbumBody;
	#state = getConversationState();
	#conversation = $derived(this.#state());
	#peerProfileId = $derived(this.#conversation.profile?.profileId ?? null);

	constructor({ message }: { message: () => AlbumBody }) {
		this.#message = message;
	}

	get canReply() {
		return (
			this.#peerProfileId !== null &&
			this.#message().ownerProfileId === this.#peerProfileId
		);
	}

	get isViewable() {
		const message = this.#message();
		if ("previewUrl" in message && message.previewUrl === null)
			return false;
		const viewable =
			"isViewable" in message ? message.isViewable : message.viewable;
		if (this.#peerProfileId === null) return viewable;
		return (
			albumShares.isSharedWith({
				albumId: message.albumId,
				profileId: this.#peerProfileId,
			}) ?? viewable
		);
	}

	readonly reply = ({ slide, text }: { slide: AlbumSlide; text: string }) => {
		this.#conversation.send(
			[
				draftFromAlbumContent({
					target: albumReplyTarget({ album: this.#message(), slide }),
					text,
				}),
			],
			{ includeReply: false },
		);
	};

	readonly react = (slide: AlbumSlide) => {
		this.#conversation.send(
			[
				draftFromAlbumReaction({
					target: albumReplyTarget({ album: this.#message(), slide }),
				}),
			],
			{ includeReply: false },
		);
	};
}
