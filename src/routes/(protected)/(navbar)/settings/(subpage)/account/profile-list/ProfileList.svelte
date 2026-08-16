<script lang="ts">
	import { beforeNavigate } from "$app/navigation";

	import { getProfiles } from "$lib/api/users/profiles";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { nearestScrollableAncestor } from "$lib/util/scroll";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import type {
		ProfileListEntry,
		ProfileListScroll,
		ProfileListToggle,
	} from "./profile-list";
	import ProfileListRow from "./ProfileListRow.svelte";

	let {
		loadIds,
		empty,
		scroll,
		...toggle
	}: {
		loadIds: () => Promise<number[]>;
		empty: { title: string; description: string };
		scroll: ProfileListScroll;
	} & ProfileListToggle = $props();

	let entries: ProfileListEntry[] = $state([]);
	let loading = $state(true);
	let error: Error | null = $state(null);
	let root: HTMLElement | null = $state(null);

	const scroller = $derived(
		root ? (nearestScrollableAncestor(root) as HTMLElement | null) : null,
	);

	restoreScrollOnce(() => scroller, {
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		get scrollY() {
			return scroll.scrollY;
		},
	});

	beforeNavigate(() => {
		if (scroller) scroll.scrollY = scroller.scrollTop;
	});

	async function load() {
		loading = true;
		error = null;
		try {
			const ids = await loadIds();
			const resolved = new Map(
				(await getProfiles(ids)).map((profile) => [
					profile.profileId,
					profile,
				]),
			);
			entries = ids.map((profileId) => ({
				profileId,
				profile: resolved.get(profileId) ?? null,
			}));
		} catch (caught) {
			console.error(caught);
			error =
				caught instanceof Error
					? caught
					: new Error("Failed to load profiles", { cause: caught });
		} finally {
			loading = false;
		}
	}

	void load();
</script>

<div bind:this={root} class="flex flex-1 flex-col gap-3">
	{#if loading}
		{#each Array(6)}
			<Skeleton class="h-24.5 w-full shrink-0" />
		{/each}
	{:else if error}
		<div class="flex flex-1">
			<ApiErrorDisplay
				{error}
				onRetry={() => void load()}
				class="m-auto"
			/>
		</div>
	{:else if entries.length === 0}
		<div class="flex flex-1">
			<Empty.Root class="m-auto">
				<Empty.Header>
					<Empty.Media variant="icon">
						{@render toggle.icon(true)}
					</Empty.Media>
					<Empty.Title>{empty.title}</Empty.Title>
					<Empty.Description>{empty.description}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		{#each entries as entry (entry.profileId)}
			<ProfileListRow {entry} {...toggle} />
		{/each}
	{/if}
</div>
