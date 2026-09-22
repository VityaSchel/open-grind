<script lang="ts">
	import SubpageScreen from "$lib/components/shared/SubpageScreen.svelte";

	const base = "/(protected)/(navbar)/albums";
	const routes = {
		[base]: { title: "My Albums", back: "/settings", wide: true },
		[`${base}/new`]: { title: "New Album", back: "/albums" },
		[`${base}/[albumId]`]: { title: "Edit Album", back: "/albums" },
	};

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SubpageScreen {routes} parent="/settings">
	{@render children?.()}
</SubpageScreen>
