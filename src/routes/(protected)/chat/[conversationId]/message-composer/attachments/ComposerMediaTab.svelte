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
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import SelectionCheck from "$lib/components/shared/SelectionCheck.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { pickMultipleMedia } from "$lib/platform/media-picker";
	import { proxyMediaUrl } from "$lib/util/media";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClose,
		onSelectionChange,
		expiring,
	}: {
		onClose: () => void;
		onSelectionChange: (count: number) => void;
		expiring: boolean;
	} = $props();

	const composer = getMessageComposerContext();
	const selected = new SelectionSet<number>(10);

	function toggleSelected(id: number) {
		selected.toggle(id);
		onSelectionChange(selected.size);
	}

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

	function imageHashFromUrl(url: string): string {
		return /([0-9a-f]{64}|[0-9a-f]{40})/i.exec(url)?.[1] ?? "";
	}

	export function sendSelected() {
		if (media === null) return;
		const items = media.filter((item) => selected.has(item.id));
		const sendAsExpiring = expiring;
		selected.clear();
		onClose();
		for (const item of items) {
			item.used = true;
			const mediaBody = {
				mediaId: item.id,
				width: null,
				height: null,
				url: item.url,
			};
			void composer().sendMessage(
				sendAsExpiring
					? {
							outbound: {
								type: "ExpiringImage",
								body: { mediaId: item.id, expiring: true },
							},
							optimistic: {
								type: "ExpiringImage",
								body: mediaBody,
							},
						}
					: {
							outbound: {
								type: "Image",
								body: { mediaId: item.id },
							},
							optimistic: {
								type: "Image",
								body: {
									...mediaBody,
									imageHash: imageHashFromUrl(item.url),
									takenOnGrindr: item.takenOnGrindr,
									createdAt: item.createdTs,
								},
							},
						},
			);
		}
	}
</script>

<div class="@container/photo-grid flex flex-col rounded-grid">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay
				{error}
				onRetry={() => void load()}
				class="m-auto"
			/>
		</div>
	{:else if media === null}
		<div class="photo-grid">
			{#each Array(12)}
				<Skeleton class="aspect-(--photo-grid-aspect) rounded-none" />
			{/each}
		</div>
	{:else if media.length === 0 && uploadingCount === 0}
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
	{:else}
		<div class="photo-grid">
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
			{#each media as item, index (item.id)}
				{@const isSelected = selected.has(item.id)}
				<button
					type="button"
					data-slot="media-tile"
					class={[
						"relative aspect-(--photo-grid-aspect)",
						{
							"cursor-pointer":
								selected.canSelectMore || isSelected,
						},
					]}
					aria-pressed={isSelected}
					onclick={() => toggleSelected(item.id)}
				>
					<MediaImage
						src={proxyMediaUrl(item.url)}
						alt="Photo {index + 1}"
						class="size-full rounded-[inherit]"
						imgClass="bg-card-foreground/10"
					/>
					{#if isSelected}
						<div
							class="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-primary/50 outline-2 -outline-offset-2 outline-primary"
						>
							<SelectionCheck />
						</div>
					{:else if item.used}
						<div
							class="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/50"
						>
							<span class="font-medium text-white">Sent</span>
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
	<div role="status" class="sr-only">
		{selected.size === selected.max
			? `Maximum ${selected.max} selected`
			: ""}
	</div>
</div>
