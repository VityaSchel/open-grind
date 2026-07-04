<script lang="ts">
	import { page } from "$app/state";
	import ImageIcon from "phosphor-svelte/lib/ImageIcon";

	import { type DrawerMedia, getDrawerMedia } from "$lib/api/media-drawer";
	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import { Skeleton } from "$lib/components/ui/skeleton";

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
</script>

{#if error !== null}
	<div class="flex flex-1">
		<ApiErrorDisplay {error} onRetry={() => void load()} class="m-auto" />
	</div>
{:else if media === null}
	<div class="profile-grid">
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
	<div class="profile-grid">
		{#each media as item (item.id)}
			<div class="relative aspect-square">
				<img
					src={item.url}
					alt=""
					class="size-full bg-card-foreground/10 object-cover"
					draggable="false"
				/>
				{#if item.used}
					<div
						class="absolute inset-0 flex items-center justify-center bg-black/50"
					>
						<span class="text-sm font-medium text-white">Sent</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
