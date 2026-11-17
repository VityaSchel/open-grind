<script lang="ts">
	import { version } from "$app/env";
	import { page } from "$app/state";

	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { scrollsToTopOnStatusBarTap } from "#lib/platform/status-bar-tap.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import AccountSettingsLink from "./AccountSettingsLink.svelte";
	import AlbumsLink from "./AlbumsLink.svelte";
	import AppSettingsLink from "./AppSettingsLink.svelte";
	import ProfileLink from "./ProfileLink.svelte";
	import SignOutButton from "./SignOutButton.svelte";
	import Socials from "./Socials.svelte";

	const { data }: import("./$types").PageProps = $props();

	const LINK_KEYS = [
		"profile",
		"albums",
		"account",
		"app",
		"signOut",
		"website",
		"sourceCode",
		"announcements",
		"discussion",
	];

	const links = new RovingFocusState({
		keys: () => LINK_KEYS,
		orientation: "both",
		openerScope: page.url.pathname,
	});
</script>

<PageTitle page={t("shell.navBar.a11y.me")} />

<main class="screen-nav-host">
	<div
		data-slot="me-scroller"
		class="h-full w-full scroll-pb-nav-clear overflow-y-auto overscroll-none"
		{@attach scrollsToTopOnStatusBarTap}
	>
		<div class="flex w-full p-4 pb-nav-clear">
			<div
				class="m-auto flex w-full max-w-120 flex-col gap-3"
				{@attach links.container}
			>
				<ProfileLink
					id={data.ourProfileId}
					{@attach links.item("profile")}
				/>
				<AlbumsLink
					ourProfileId={data.ourProfileId}
					{@attach links.item("albums")}
				/>
				<span role="separator"></span>
				<AccountSettingsLink {@attach links.item("account")} />
				<AppSettingsLink {@attach links.item("app")} />
				<SignOutButton {@attach links.item("signOut")} />
				<span role="separator"></span>
				<Socials {links} />
				<span
					data-slot="me-version"
					translate="no"
					class="px-4 pt-2 pb-7 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground select-text"
				>
					{version}
				</span>
			</div>
		</div>
	</div>
</main>
