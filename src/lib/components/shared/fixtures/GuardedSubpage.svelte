<script lang="ts">
	import SubpageScreen from "../SubpageScreen.svelte";
	import UnsavedEdits from "./UnsavedEdits.svelte";

	let { dirty }: { dirty: boolean } = $props();

	const routes = {
		"/settings/profile": {
			title: "settings.subpage.titles.profile",
			back: "/settings",
		},
	} as const;
</script>

<SubpageScreen {routes} parent="/settings">
	<UnsavedEdits {dirty} />
</SubpageScreen>
