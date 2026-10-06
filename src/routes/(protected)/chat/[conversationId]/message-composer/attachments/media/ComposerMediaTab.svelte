<script lang="ts">
	import { toast } from "svelte-sonner";

	import {
		addMediaToDrawer,
		CHAT_MEDIA_MAX_LABEL,
		UnsupportedChatMediaError,
	} from "$lib/api/messaging/chat-media";
	import {
		deleteDrawerMedia,
		type DrawerMedia,
		getDrawerMedia,
	} from "$lib/api/messaging/drawer";
	import { uploadRefusalMessage } from "$lib/api/methods";
	import MediaSheetGrid from "$lib/components/media-sheet/MediaSheetGrid.svelte";
	import { mediaFileKindOf } from "$lib/platform/media-file";
	import { pickMultipleMedia } from "$lib/platform/media-picker";
	import { proxyMediaUrl } from "$lib/util/media";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { getConversationState } from "../../../conversation-state.svelte";
	import { getMessageComposerContext } from "../../message-composer-context.svelte";
	import type { TabSelection } from "../tabs";
	import { mediaMessageDraft } from "./media-messages";
	import SentOverlay from "./SentOverlay.svelte";

	let {
		onClose,
		onSelectionChange,
		expiring,
	}: {
		onClose: () => void;
		onSelectionChange: (selection: TabSelection) => void;
		expiring: boolean;
	} = $props();

	const composer = getMessageComposerContext();
	const conversationState = $derived(getConversationState()());
	const selected = new SelectionSet<number>(10);

	let media = $state<DrawerMedia[] | null>(null);
	let error = $state<unknown>(null);
	let uploadingCount = $state(0);

	async function load() {
		media = null;
		error = null;
		try {
			media = await getDrawerMedia(conversationState.conversationId);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();

	function addFailureMessage(err: unknown): string {
		if (err instanceof UnsupportedChatMediaError) return err.message;
		return (
			uploadRefusalMessage({
				error: err,
				limitLabel: CHAT_MEDIA_MAX_LABEL,
			}) ?? "Couldn't upload photo or video"
		);
	}

	async function addMedia() {
		let picked;
		try {
			picked = await pickMultipleMedia("media");
		} catch (err) {
			console.error(err);
			toast.error("Couldn't open the picker");
			return;
		}
		if (picked.length === 0) return;

		uploadingCount += picked.length;
		for (const item of picked) {
			try {
				const added = await addMediaToDrawer(item);
				media = [
					added,
					...(media ?? []).filter(({ id }) => id !== added.id),
				];
			} catch (err) {
				console.error(err);
				toast.error(addFailureMessage(err));
			} finally {
				uploadingCount--;
			}
		}
	}

	function toggleSelected(id: number) {
		selected.toggle(id);
		onSelectionChange({ count: selected.size, action: "send" });
	}

	function describe(item: DrawerMedia) {
		const video = mediaFileKindOf(item.contentType) === "video";
		return {
			key: item.id,
			src: proxyMediaUrl(item.url, { as: video ? "video" : "image" }),
			video,
		};
	}

	export function submitSelection() {
		if (media === null) return;
		const items = media.filter((item) => selected.has(item.id));
		const sendAsExpiring = expiring;
		selected.clear();
		onClose();
		for (const item of items) item.used = true;
		void composer().sendMessages(
			items.map((item) =>
				mediaMessageDraft({ item, expiring: sendAsExpiring }),
			),
		);
	}
</script>

<MediaSheetGrid
	items={media}
	{error}
	onRetry={() => void load()}
	{describe}
	{selected}
	onToggle={toggleSelected}
	emptyTitle="No media sent yet"
	addLabel="Upload photos or videos"
	onAdd={addMedia}
	pending={uploadingCount}
	remove={(item) => deleteDrawerMedia(item.id)}
	onRemoved={(item) => {
		media = (media ?? []).filter(({ id }) => id !== item.id);
	}}
>
	{#snippet overlay(item)}
		{#if item.used}
			<SentOverlay />
		{/if}
	{/snippet}
</MediaSheetGrid>
