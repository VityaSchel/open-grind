<script lang="ts">
	import { page } from "$app/state";
	import ChatCircleIcon from "phosphor-svelte/lib/ChatCircleIcon";
	import DotsNineIcon from "phosphor-svelte/lib/DotsNineIcon";
	import FireIcon from "phosphor-svelte/lib/FireIcon";
	import { untrack } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	import { getProfile, onProfileEdit } from "#lib/api/users/profiles.ts";
	import { getOrCreateConversationsState } from "#lib/chat/conversations-context.svelte.ts";
	import BrokenUserAvatar from "#lib/components/profile/BrokenUserAvatar.svelte";
	import UserAvatar from "#lib/components/profile/UserAvatar.svelte";
	import SplashIcon from "#lib/components/right-now/SplashIcon.svelte";
	import ProgressiveBlur from "#lib/components/shared/ProgressiveBlur.svelte";
	import { Badge } from "#lib/components/ui/badge/index.ts";
	import { tabsListVariants } from "#lib/components/ui/tabs/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { getTapsState } from "#lib/interest/taps-state.svelte.ts";
	import { softKeyboardShrinksPage } from "#lib/platform/soft-keyboard.svelte.ts";
	import { returnTo } from "#lib/util/history.ts";
	import { isWithin } from "#lib/util/pathname.ts";
	import { isPlainClick } from "#lib/util/plain-click.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import { bottomChrome } from "#lib/util/screen-chrome.svelte.ts";

	let {
		ourProfileId,
		...attachments
	}: { ourProfileId: number } & Pick<HTMLAttributes<HTMLElement>, symbol> =
		$props();

	const TABS = ["browse", "rightNow", "interest", "inbox", "me"] as const;

	let myProfilePhotos = $state(
		untrack(() =>
			getProfile(ourProfileId).then((profile) => profile.medias),
		),
	);

	$effect(() =>
		onProfileEdit(({ profileId, patch }) => {
			if (profileId !== ourProfileId || patch.medias === undefined)
				return;
			myProfilePhotos = Promise.resolve(patch.medias);
		}),
	);

	const conversations = untrack(() =>
		getOrCreateConversationsState(ourProfileId),
	);
	const hasUnread = $derived(conversations.hasUnread);

	const taps = untrack(() => getTapsState(ourProfileId));
	const hasUnseenTaps = $derived(taps.hasUnseen);

	const currentTab = $derived.by(() => {
		const route = page.route.id ?? "";
		if (route === "/(protected)/(navbar)/(root)") {
			return "browse";
		}
		if (route === "/(protected)/(navbar)/right-now") {
			return "rightNow";
		}
		if (route.startsWith("/(protected)/(navbar)/interest")) {
			return "interest";
		}
		if (route === "/(protected)/chat") {
			return "inbox";
		}
		if (route === "/(protected)/(navbar)/settings/(me)") {
			return "me";
		}
		return null;
	});

	const currentSection = $derived(
		page.route.id === "/(protected)/chat/[conversationId]"
			? "inbox"
			: currentTab,
	);

	const tabs = new RovingFocusState({
		keys: () => TABS,
		orientation: "horizontal",
		wrap: "loop",
		restingKey: () => currentSection ?? TABS[0],
	});

	function tabNavigation({
		href,
		landsOn = href,
	}: {
		href: string;
		landsOn?: string;
	}) {
		return (event: MouseEvent) => {
			if (!isPlainClick(event)) return;

			const current = page.url.pathname;
			if (current === landsOn) {
				event.preventDefault();
				return;
			}
			if (!isWithin({ pathname: current, root: href })) return;

			event.preventDefault();
			returnTo(landsOn);
		};
	}
</script>

{#snippet label(text: string)}
	<span class="label" data-label={text}>
		<span data-slot="navbar-tab-label" class="max-w-full truncate"
			>{text}</span
		>
	</span>
{/snippet}

<ProgressiveBlur
	{...attachments}
	data-slot="navbar"
	direction="bottomToTop"
	tag="nav"
	aria-label={t("shell.navBar.a11y.navigation")}
	class="fixed bottom-0 z-50 w-full pt-2 px-safe pb-fixed-nav"
	bgClass="bg-linear-to-t from-background to-transparent"
	hidden={softKeyboardShrinksPage()}
	{@attach bottomChrome}
>
	<div
		role="toolbar"
		aria-label={t("shell.navBar.a11y.sections")}
		class="flex justify-center gap-2 px-1"
		{@attach tabs.container}
	>
		<div
			class={[
				tabsListVariants({ variant: "default" }),
				"links min-w-0 [&>a>svg]:size-5!",
			]}
		>
			<a
				href="/"
				data-active={currentTab === "browse"}
				aria-current={currentSection === "browse" ? "page" : undefined}
				onclick={tabNavigation({ href: "/" })}
				{@attach tabs.item("browse")}
			>
				<DotsNineIcon weight="fill" />
				{@render label(t("shell.navBar.tabs.browse"))}
			</a>
			<a
				href="/right-now"
				data-active={currentTab === "rightNow"}
				aria-current={currentSection === "rightNow"
					? "page"
					: undefined}
				onclick={tabNavigation({ href: "/right-now" })}
				{@attach tabs.item("rightNow")}
			>
				<SplashIcon weight="fill" />
				{@render label(t("shell.navBar.tabs.rightNow"))}
			</a>
			<a
				href="/interest"
				data-active={currentTab === "interest"}
				aria-current={currentSection === "interest"
					? "page"
					: undefined}
				onclick={tabNavigation({
					href: "/interest",
					landsOn: "/interest/taps",
				})}
				{@attach tabs.item("interest")}
			>
				<FireIcon weight="fill" />
				{@render label(t("common.sections.interest"))}
				{#if hasUnseenTaps}
					<Badge
						class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0"
					/>
				{/if}
			</a>
			<a
				href="/chat"
				data-active={currentTab === "inbox"}
				aria-current={currentSection === "inbox" ? "page" : undefined}
				onclick={tabNavigation({ href: "/chat" })}
				{@attach tabs.item("inbox")}
			>
				<ChatCircleIcon weight="fill" />
				{@render label(t("shell.navBar.tabs.inbox"))}
				{#if hasUnread}
					<Badge
						class="absolute inset-e-2 top-1 size-2.5 rounded-full p-0"
					/>
				{/if}
			</a>
		</div>
		<a
			href="/settings"
			aria-label={t("shell.navBar.a11y.me")}
			aria-current={currentSection === "me" ? "page" : undefined}
			onclick={tabNavigation({ href: "/settings" })}
			class={[
				"flex size-14 shrink-0 rounded-full border bg-muted p-1 transition-colors motion-reduce:transition-none",
				{
					"border-2 border-accent": currentTab === "me",
					"border-border": currentTab !== "me",
				},
			]}
			{@attach tabs.item("me")}
		>
			{#await myProfilePhotos then photos}
				{@const mainPhoto = photos[0] as
					| { mediaHash: string }
					| undefined}
				<UserAvatar
					mediaHash={mainPhoto?.mediaHash ?? null}
					own
					class="size-full *:rounded-full"
					size="lg"
				/>
			{:catch}
				<BrokenUserAvatar />
			{/await}
		</a>
	</div>
</ProgressiveBlur>

<style lang="postcss">
	@reference "$layout";

	.links a {
		@apply relative inline-flex h-[calc(100%-1px)] max-w-max min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full border border-transparent! px-3 py-1 text-xs whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:rounded-2xl group-data-vertical/tabs:px-3 group-data-vertical/tabs:py-1.5 hover:bg-input/20 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none dark:text-muted-foreground dark:hover:bg-input/20 data-active:font-medium data-active:text-foreground dark:data-active:border-input dark:data-active:text-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4;
	}

	.label {
		@apply flex max-w-full flex-col items-center;
	}

	.label::after {
		@apply invisible h-0 max-w-full overflow-hidden font-medium select-none;
		content: attr(data-label);
	}
</style>
