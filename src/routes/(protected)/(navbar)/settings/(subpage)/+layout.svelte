<script lang="ts">
	import SubpageScreen, {
		type SubpageRoute,
	} from "$lib/components/shared/SubpageScreen.svelte";

	const base = "/(protected)/(navbar)/settings/(subpage)";
	const routes = {
		[`${base}/account`]: {
			title: "settings.subpage.titles.account",
			back: "/settings",
		},
		[`${base}/account/privacy`]: {
			title: "settings.subpage.titles.privacy",
			back: "/settings/account",
		},
		[`${base}/account/blocked`]: {
			title: "settings.subpage.titles.blocked",
			back: "/settings/account",
		},
		[`${base}/account/hidden`]: {
			title: "settings.subpage.titles.hidden",
			back: "/settings/account",
		},
		[`${base}/albums`]: {
			title: "settings.subpage.titles.albums",
			back: "/settings",
			wide: true,
		},
		[`${base}/albums/new`]: {
			title: "settings.subpage.titles.newAlbum",
			back: "/settings/albums",
		},
		[`${base}/albums/[albumId]`]: {
			title: "settings.subpage.titles.editAlbum",
			back: "/settings/albums",
		},
		[`${base}/app`]: {
			title: "settings.subpage.titles.app",
			back: "/settings",
		},
		[`${base}/app/notifications`]: {
			title: "settings.subpage.titles.notifications",
			back: "/settings/app",
		},
		[`${base}/app/credits`]: {
			title: "settings.subpage.titles.credits",
			back: "/settings/app",
		},
		[`${base}/profile`]: {
			title: "settings.subpage.titles.profile",
			back: "/settings",
		},
	} as const satisfies Record<string, SubpageRoute>;

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SubpageScreen {routes} parent="/settings">
	{@render children?.()}
</SubpageScreen>
