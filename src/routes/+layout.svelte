<script lang="ts">
	import { IconContext } from "phosphor-svelte";
	import "@fontsource-variable/ibm-plex-sans/wght.css";
	import "@fontsource-variable/ibm-plex-sans/wght-italic.css";

	import "../layout.css";
	import { onMount } from "svelte";
	import { Toaster } from "svelte-sonner";

	import {
		applyAndroidInsets,
		applyBackGestureHandler,
	} from "$lib/android-native-bridge";
	import { hydratePreferences } from "$lib/app-data/preferences.svelte";

	onMount(() => {
		applyAndroidInsets();
		applyBackGestureHandler();
		void hydratePreferences().catch((error) => {
			console.error("Failed to hydrate preferences", error);
		});
	});

	import RequestBlockedAlert from "$lib/api/request-blocked/RequestBlockedAlert.svelte";
	import SessionErrorAlert from "$lib/api/session-error/SessionErrorAlert.svelte";
	import favicon from "$lib/assets/favicon.png";

	let {
		children,
	}: {
		children?: import("svelte").Snippet;
	} = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<div
	class="fixed inset-x-0 top-0 z-150000 bg-background/50"
	style="height: var(--safe-area-top)"
></div>
<div
	class="fixed inset-x-0 bottom-0 z-150000 bg-background/50"
	style="height: var(--safe-area-bottom)"
></div>
<Toaster
	position="bottom-center"
	toastOptions={{
		class: "toast",
	}}
	expand
/>
<IconContext values={{}}>
	{@render children?.()}
</IconContext>
<RequestBlockedAlert />
<SessionErrorAlert />
