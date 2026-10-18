<script lang="ts" module>
	import type {
		OfferedMedia,
		SendMediaOffer,
	} from "./send-media-offer.svelte";

	function titleFor(items: OfferedMedia[]): string {
		const videos = items.filter(
			({ inspection }) => inspection.kind === "video",
		).length;
		const photos = items.length - videos;
		if (items.length === 1) {
			return `Preview of the ${videos === 1 ? "video" : "photo"} to send`;
		}
		if (videos === 0) return `Preview of ${photos} photos to send`;
		if (photos === 0) return `Preview of ${videos} videos to send`;
		return `Preview of ${items.length} photos and videos to send`;
	}
</script>

<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import SendMediaTile from "./SendMediaTile.svelte";

	let { offer }: { offer: SendMediaOffer } = $props();

	const items = $derived(offer.items);

	let latched: OfferedMedia[] = [];
	const shown = $derived.by(() => {
		if (items.length > 0) latched = items;
		return latched;
	});
	const single = $derived(shown.length === 1);
	const previewing = $derived(items.some((item) => item.previewing));

	dismissOnBackGesture({
		active: () => items.length > 0,
		dismiss: () => offer.cancel(),
	});
</script>

<AlertDialog.Root
	bind:open={
		() => items.length > 0,
		(open) => {
			if (!open) offer.cancel();
		}
	}
>
	<AlertDialog.Content
		class="z-modal flex flex-col overflow-hidden"
		overlayClass="z-modal"
	>
		<AlertDialog.Title class="sr-only">{titleFor(shown)}</AlertDialog.Title>
		<div
			data-slot="send-media-previews"
			class={[
				"@container grid min-h-0 auto-rows-max gap-2 overflow-y-auto",
				{ "grid-cols-2": !single },
			]}
		>
			{#each shown as item (item.media.key)}
				<SendMediaTile {item} {single} />
			{/each}
		</div>
		<AlertDialog.Footer class="shrink-0">
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				size="lg"
				disabled={previewing || !offer.sendable}
				onclick={() => offer.send()}
			>
				Send
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
