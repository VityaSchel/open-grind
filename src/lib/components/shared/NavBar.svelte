<script lang="ts">
	import { page } from "$app/state";
	import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
	import DotsNineIcon from "phosphor-svelte/lib/DotsNineIcon";
	import DropIcon from "phosphor-svelte/lib/DropIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";

	import { getMyProfile } from "$lib/api/users/profiles";
	import { getOrCreateConversationsState } from "$lib/chat/conversations-context.svelte";
	import BrokenUserAvatar from "$lib/components/profile/BrokenUserAvatar.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { tabsListVariants } from "$lib/components/ui/tabs";
	import type { ConversationsState } from "$lib/chat/conversations-state.svelte";

	const myProfilePhotos = $derived(
		getMyProfile().then((profile) => profile.medias),
	);

	let conversations = $state<ConversationsState | null>(null);
	$effect(() => {
		void getMyProfile().then((profile) => {
			conversations = getOrCreateConversationsState(profile.profileId);
		});
	});
	const hasUnread = $derived(conversations?.hasUnread ?? false);
</script>

<ProgressiveBlur
	direction="bottomToTop"
	tag="nav"
	class="fixed bottom-0 z-50 w-full pt-2 pb-fixed-nav"
	bgClass="bg-linear-to-t from-background to-transparent"
	contentClass="overflow-auto no-scrollbar left-1/2 -translate-x-1/2 m-auto flex justify-center gap-2 px-2"
>
	<div
		class={[
			tabsListVariants({ variant: "default" }),
			"links shrink-0 [&>a>svg]:size-5!",
		]}
	>
		<a
			href="/"
			data-active={page.route.id === "/(protected)/(navbar)/(root)"}
			onclick={(e) => {
				if (page.route.id === "/(protected)/(navbar)/(root)") {
					e.preventDefault();
				}
			}}
		>
			<DotsNineIcon weight="fill" />
			Browse
		</a>
		<a
			href="/right-now"
			data-active={page.route.id === "/(protected)/(navbar)/right-now"}
		>
			<DropIcon weight="fill" />
			Right Now
		</a>
		<a
			href="/interest"
			data-active={page.route.id?.startsWith("/(protected)/(navbar)/interest")}
		>
			<FireIcon weight="fill" />
			Interest
		</a>
		<a href="/chat" data-active={page.route.id === "/(protected)/chat"}>
			<ChatCircleIcon weight="fill" />
			Inbox
			{#if hasUnread}
				<Badge class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0" />
			{/if}
		</a>
	</div>
	<a
		href="/settings"
		class={[
			"flex size-14 shrink-0 rounded-full border bg-muted p-1",
			{
				"border-2 border-accent":
					page.route.id === "/(protected)/(navbar)/settings/(me)",
				"border-border":
					page.route.id !== "/(protected)/(navbar)/settings/(me)",
			},
		]}
	>
		{#await myProfilePhotos then photos}
			{@const mainPhoto = photos[0] as { mediaHash: string } | undefined}
			<UserAvatar
				mediaHash={mainPhoto?.mediaHash ?? null}
				class="size-full *:rounded-full"
				size="lg"
			/>
		{:catch}
			<BrokenUserAvatar />
		{/await}
	</a>
</ProgressiveBlur>

<style lang="postcss">
	@reference "$layout";

	.links a {
		@apply relative inline-flex h-[calc(100%-1px)] flex-1 flex-col items-center justify-center gap-0.5 rounded-full border border-transparent! px-3 py-1 text-xs whitespace-nowrap text-foreground/60 group-data-vertical/tabs:rounded-2xl group-data-vertical/tabs:px-3 group-data-vertical/tabs:py-1.5 hover:bg-input/20 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:bg-input/20 data-active:font-medium data-active:text-foreground dark:data-active:border-input dark:data-active:text-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4;
	}
</style>
