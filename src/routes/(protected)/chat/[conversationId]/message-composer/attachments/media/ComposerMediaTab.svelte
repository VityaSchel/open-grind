<script lang="ts">
	import { page } from "$app/state";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";
	import { toast } from "svelte-sonner";

	import { addMediaToDrawer } from "$lib/api/messaging/chat-media";
	import {
		type DrawerMedia,
		getDrawerMedia,
	} from "$lib/api/messaging/drawer";
	import { asAppError } from "$lib/api/methods";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { pickMultipleMedia } from "$lib/platform/media-picker";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { getMessageComposerContext } from "../../message-composer-context.svelte";
	import SelectionGridTab from "../SelectionGridTab.svelte";
	import type { TabSelection } from "../tabs";
	import { mediaMessageDraft } from "./media-messages";
	import MediaTile from "./MediaTile.svelte";

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
	const selected = new SelectionSet<number>(10);

	let media = $state<DrawerMedia[] | null>(null);
	let error = $state<unknown>(null);
	let uploadingCount = $state(0);

	async function load() {
		media = null;
		error = null;
		try {
			media = await getDrawerMedia(page.params.conversationId as string);
		} catch (err) {
			console.error(err);
			error = err;
		}
	}

	void load();

	async function addPhoto() {
		let picked;
		try {
			picked = await pickMultipleMedia("image");
		} catch (err) {
			console.error(err);
			toast.error("Couldn't open the photo picker");
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
				const rejected = asAppError(err);
				if (
					rejected?.kind === "Media" &&
					typeof rejected.message === "string"
				) {
					toast.error(rejected.message);
				} else {
					toast.error("Couldn't add photo");
				}
			} finally {
				uploadingCount--;
			}
		}
	}

	function toggleSelected(id: number) {
		selected.toggle(id);
		onSelectionChange({ count: selected.size, label: "Send" });
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

<SelectionGridTab
	items={media}
	key={(item) => item.id}
	empty={media?.length === 0 && uploadingCount === 0}
	{error}
	onRetry={() => void load()}
	skeletons={12}
	{selected}
>
	{#snippet emptyState()}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon">
					<ImageIcon weight="fill" />
				</Empty.Media>
				<Empty.Title>No media sent yet</Empty.Title>
			</Empty.Header>
			<Empty.Content>
				<Button onclick={addPhoto}>
					<PlusIcon weight="bold" />
					Add photo
				</Button>
			</Empty.Content>
		</Empty.Root>
	{/snippet}
	{#snippet leading()}
		<button
			type="button"
			class="flex aspect-(--photo-grid-aspect) cursor-pointer flex-col items-center justify-center gap-1 bg-card-foreground/5 text-muted-foreground transition-colors hover:bg-card-foreground/10 hover:text-foreground"
			aria-label="Add photo"
			onclick={addPhoto}
		>
			<PlusIcon weight="bold" class="size-6" />
			<span class="text-xs font-medium">Add photo</span>
		</button>
		{#each Array(uploadingCount)}
			<Skeleton class="aspect-(--photo-grid-aspect) rounded-none" />
		{/each}
	{/snippet}
	{#snippet tile(item, index)}
		{@const isSelected = selected.has(item.id)}
		<MediaTile
			{item}
			{index}
			selected={isSelected}
			clickable={selected.canSelectMore || isSelected}
			onclick={() => toggleSelected(item.id)}
		/>
	{/snippet}
</SelectionGridTab>
