<script lang="ts">
	import SubpageScreen from "$lib/components/shared/SubpageScreen.svelte";

	const base = "/(protected)/(navbar)/settings/(subpage)";
	const routes = {
		[`${base}/account`]: { title: "Account Settings", back: "/settings" },
		[`${base}/account/privacy`]: {
			title: "Privacy",
			back: "/settings/account",
		},
		[`${base}/account/blocked`]: {
			title: "Blocked Users",
			back: "/settings/account",
		},
		[`${base}/account/hidden`]: {
			title: "Hidden Users",
			back: "/settings/account",
		},
		[`${base}/albums`]: {
			title: "My Albums",
			back: "/settings",
			wide: true,
		},
		[`${base}/albums/new`]: {
			title: "New Album",
			back: "/settings/albums",
		},
		[`${base}/albums/[albumId]`]: {
			title: "Edit Album",
			back: "/settings/albums",
		},
		[`${base}/app`]: { title: "App Settings", back: "/settings" },
		[`${base}/app/notifications`]: {
			title: "Notifications",
			back: "/settings/app",
		},
		[`${base}/app/credits`]: {
			title: "Credits & Licenses",
			back: "/settings/app",
		},
		[`${base}/profile`]: { title: "Edit Profile", back: "/settings" },
	};

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SubpageScreen {routes} parent="/settings">
	{@render children?.()}
</SubpageScreen>
