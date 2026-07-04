<script lang="ts">
	import { page } from "$app/state";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";
	import { expoOut, sineIn } from "svelte/easing";
	import { SvelteSet } from "svelte/reactivity";
	import { fly } from "svelte/transition";

	import { type DrawerMedia, getDrawerMedia } from "$lib/api/media-drawer";
	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClose,
	}: {
		onClose: () => void;
	} = $props();

	const composer = getMessageComposerContext();

	const maxSelected = 10;
	const selected = new SvelteSet<number>();

	let media = $state<DrawerMedia[] | null>(null);
	let error = $state<unknown>(null);

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

	function toggle(item: DrawerMedia) {
		if (selected.has(item.id)) {
			selected.delete(item.id);
		} else if (selected.size < maxSelected) {
			selected.add(item.id);
		}
	}

	function imageHashFromUrl(url: string): string {
		return /([0-9a-f]{64}|[0-9a-f]{40})/i.exec(url)?.[1] ?? "";
	}

	function sendSelected() {
		if (media === null) return;
		const items = media.filter((item) => selected.has(item.id));
		selected.clear();
		onClose();
		for (const item of items) {
			item.used = true;
			void composer().sendMessage({
				type: "Image",
				body: {
					mediaId: item.id,
					width: null,
					height: null,
					url: item.url,
					imageHash: imageHashFromUrl(item.url),
					takenOnGrindr: item.takenOnGrindr,
					createdAt: item.createdTs,
				},
			});
		}
	}
</script>

<div class="relative flex min-h-0 flex-1 flex-col overflow-clip">
	<div
		class="rounded-grid flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
	>
		{#if error !== null}
			<div class="flex flex-1">
				<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
			</div>
		{:else if media === null}
			<div class="photo-grid">
				{#each Array(12)}
					<Skeleton class="aspect-square rounded-none" />
				{/each}
			</div>
		{:else if media.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon">
						<ImageIcon weight="fill" />
					</Empty.Media>
					<Empty.Title>No media sent yet</Empty.Title>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class={["photo-grid", selected.size > 0 && "pb-20"]}>
				{#each media as item (item.id)}
					{@const isSelected = selected.has(item.id)}
					<button
						type="button"
						class={[
							"relative aspect-square",
							{
								"cursor-pointer": selected.size < maxSelected || isSelected,
							},
						]}
						aria-label={isSelected ? "Deselect media" : "Select media"}
						aria-pressed={isSelected}
						onclick={() => toggle(item)}
					>
						<img
							src={item.url}
							alt=""
							class="size-full rounded-[inherit] bg-card-foreground/10 object-cover"
							draggable="false"
						/>
						{#if isSelected}
							<div
								class="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-primary/50 outline-2 -outline-offset-2 outline-primary"
							>
								<div
									class="flex size-8 items-center justify-center rounded-full bg-primary"
								>
									<CheckIcon weight="bold" class="size-5 text-white" />
								</div>
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
	</div>
	{#if selected.size > 0}
		<div
			class="absolute inset-x-0 bottom-3 flex justify-center"
			in:fly={{ duration: 600, y: 100, easing: expoOut }}
			out:fly={{ duration: 400, y: 100, easing: sineIn }}
		>
			<Button size="lg" onclick={sendSelected} class="shadow-lg">
				Send
				<Badge
					variant="secondary"
					class="bg-primary-foreground/10 text-primary-foreground"
				>
					{selected.size}
				</Badge>
			</Button>
		</div>
	{/if}
</div>
