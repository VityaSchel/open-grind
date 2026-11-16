<script lang="ts">
	import SubpageScreen from "#lib/components/shared/SubpageScreen.svelte";
	import { SETTINGS, settingsSubpages } from "./subpage-routes";

	let { children }: import("./$types").LayoutProps = $props();
</script>

<SubpageScreen routes={settingsSubpages} parent={SETTINGS}>
	{@render children?.()}
</SubpageScreen>
