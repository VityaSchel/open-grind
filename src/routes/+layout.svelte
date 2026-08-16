<script lang="ts">
	import "@fontsource-variable/ibm-plex-sans/wght.css";
	import "@fontsource-variable/ibm-plex-sans/wght-italic.css";

	import "../layout.css";
	import { page } from "$app/state";
	import { IconContext } from "phosphor-svelte";
	import { onMount } from "svelte";
	import { Toaster } from "svelte-sonner";

	import { hydratePreferences } from "$lib/app-data/preferences.svelte";
	import {
		applyAndroidInsets,
		applyBackGestureHandler,
		registerAndroidBackButtonListener,
	} from "$lib/platform/android-native-bridge";
	import { blockZoom } from "$lib/platform/block-zoom";
	import { isAndroidPlatform } from "$lib/platform/os";
	import { installScrollGestureBridge } from "$lib/platform/scroll-gesture";

	onMount(() => {
		installScrollGestureBridge();
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
		const releaseZoomBlock = blockZoom();
		if (isAndroidPlatform()) {
			void registerAndroidBackButtonListener().catch((error) => {
				console.error("Failed to register back button listener", error);
			});
		}
		void hydratePreferences().catch((error) => {
			console.error("Failed to hydrate preferences", error);
		});
		return releaseZoomBlock;
	});

	import { env } from "$env/dynamic/public";

	import favicon from "$lib/assets/favicon.png";
	import AccountStatusAlert from "$lib/components/feedback/AccountStatusAlert.svelte";
	import CopyErrorConfirmAlert from "$lib/components/feedback/CopyErrorConfirmAlert.svelte";
	import RequestBlockedAlert from "$lib/components/feedback/RequestBlockedAlert.svelte";
	import SessionErrorAlert from "$lib/components/feedback/SessionErrorAlert.svelte";

	let { children }: { children?: import("svelte").Snippet } = $props();

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
	style:height="var(--safe-area-top)"
></div>
<div
	class={[
		"fixed inset-x-0 bottom-0 z-150000",
		{
			"bg-background/50": !env.PUBLIC_TEST_INSETS,
			"bg-red-900": env.PUBLIC_TEST_INSETS,
		},
	]}
	style:height="var(--safe-area-bottom)"
></div>
<IconContext values={{ "aria-hidden": true }}>
	<Toaster
		position="bottom-center"
		offset={toastOffset}
		mobileOffset={toastOffset}
		toastOptions={{ class: "toast" }}
		expand
	/>
	{@render children?.()}
	<RequestBlockedAlert />
	<SessionErrorAlert />
	<AccountStatusAlert />
	<CopyErrorConfirmAlert />
</IconContext>
