<script lang="ts">
	import { page } from "$app/state";
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
		if (env.PUBLIC_TEST_INSETS) {
			window.__AndroidInsets = {
				top() {
					return 64;
				},
				bottom() {
					return 64;
				},
				left() {
					return 0;
				},
				right() {
					return 0;
				},
			};
		}
		applyAndroidInsets();
		applyBackGestureHandler();
		void hydratePreferences().catch((error) => {
			console.error("Failed to hydrate preferences", error);
		});
	});

	import { env } from "$env/dynamic/public";

	import RequestBlockedAlert from "$lib/api/request-blocked/RequestBlockedAlert.svelte";
	import SessionErrorAlert from "$lib/api/session-error/SessionErrorAlert.svelte";
	import favicon from "$lib/assets/favicon.png";
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";

	let {
		children,
	}: {
		children?: import("svelte").Snippet;
	} = $props();

	const hasBottomNavBar = $derived(
		page.route.id?.startsWith("/(protected)/(navbar)") ?? false,
	);
	const toastOffset = $derived({
		top: "calc(var(--safe-area-top) + 0.5rem)",
		bottom: hasBottomNavBar
			? "calc(var(--content-pb) + 0.5rem)"
			: "calc(var(--safe-area-bottom) + 0.5rem)",
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>
<div
	class={[
		"fixed inset-x-0 top-0 z-150000",
		{
			"bg-background/50": !env.PUBLIC_TEST_INSETS,
			"bg-red-900": env.PUBLIC_TEST_INSETS,
		},
	]}
	style="height: var(--safe-area-top)"
></div>
<div
	class={[
		"fixed inset-x-0 bottom-0 z-150000",
		{
			"bg-background/50": !env.PUBLIC_TEST_INSETS,
			"bg-red-900": env.PUBLIC_TEST_INSETS,
		},
	]}
	style="height: var(--safe-area-bottom)"
></div>
<Toaster
	position="bottom-center"
	offset={toastOffset}
	mobileOffset={toastOffset}
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
<CommandCenter />
