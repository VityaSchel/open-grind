<script lang="ts">
	import "@fontsource-variable/ibm-plex-sans/wght.css";
	import "@fontsource-variable/ibm-plex-sans/wght-italic.css";

	import "../layout.css";
	import { beforeNavigate } from "$app/navigation";
	import { IconContext } from "phosphor-svelte";
	import { onMount, untrack } from "svelte";
	import { Toaster } from "svelte-sonner";

	import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
	import { startGoogleHandoffWatch } from "$lib/api/google-handoff";
	import {
		hydratePreferences,
		preferencesLoaded,
		preferencesSnapshot,
	} from "$lib/app-data/preferences.svelte";
	import { abortBackdropBlurTrialGesture } from "$lib/blur/calibration/trial.svelte";
	import { hydrateBackdropCompositing } from "$lib/blur/compositing.svelte";
	import { applyBackdropBlurQuality } from "$lib/blur/quality.svelte";
	import {
		applyAndroidInsets,
		applyBackGestureHandler,
		registerAndroidBackButtonListener,
	} from "$lib/platform/android-native-bridge";
	import { blockZoom } from "$lib/platform/block-zoom";
	import { isAndroidPlatform } from "$lib/platform/os";
	import { installScrollGestureBridge } from "$lib/platform/scroll-gesture";
	import { reconcileNotifications } from "$lib/push/notifications.svelte";
	import { startPushWatch } from "$lib/push/watch";
	import { startAddonUpdateWatch } from "$lib/updates/addon.svelte";
	import { updatesSelfManaged } from "$lib/updates/capability.svelte";
	import { startUpdateWatch } from "$lib/updates/updates-manager";
	import {
		bottomChromeClearance,
		topChromeClearance,
	} from "$lib/util/screen-chrome.svelte";

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
		void hydratePreferences().catch((error: unknown) => {
			console.error("Failed to hydrate preferences", error);
		});
		void hydrateBackdropCompositing().catch((error: unknown) => {
			console.error("Failed to read backdrop compositing", error);
		});
		return releaseZoomBlock;
	});

	import { env } from "$env/dynamic/public";

	import faviconPng from "$lib/assets/favicon.png";
	import AccountStatusAlert from "$lib/components/feedback/AccountStatusAlert.svelte";
	import CopyErrorConfirmAlert from "$lib/components/feedback/CopyErrorConfirmAlert.svelte";
	import EntitlementBypassAlert from "$lib/components/feedback/EntitlementBypassAlert.svelte";
	import GoogleHandoffConfirmAlert from "$lib/components/feedback/GoogleHandoffConfirmAlert.svelte";
	import RequestBlockedAlert from "$lib/components/feedback/RequestBlockedAlert.svelte";
	import SessionErrorAlert from "$lib/components/feedback/SessionErrorAlert.svelte";
	import faviconSvg from "../../contrib/logo/open-grind.svg";

	let { children }: { children?: import("svelte").Snippet } = $props();

	const onboarded = $derived(
		preferencesLoaded() && preferencesSnapshot().onboardingComplete,
	);

	beforeNavigate(() => abortBackdropBlurTrialGesture());

	$effect(() => {
		applyBackdropBlurQuality();
	});

	$effect(() => {
		if (!onboarded) return;
		const appUpdates = updatesSelfManaged()
			? startUpdateWatch()
			: Promise.resolve();
		void appUpdates.finally(() => startAddonUpdateWatch());
	});

	$effect(() => {
		if (!onboarded) return;
		untrack(() => {
			void startPushWatch().catch((error: unknown) => {
				console.error("Failed to watch push notifications", error);
			});
		});
	});

	$effect(() => {
		if (!onboarded || !appLifecycle.active) return;
		untrack(() => void reconcileNotifications());
	});

	$effect(() => {
		if (!onboarded) return;
		const watch = startGoogleHandoffWatch();
		return () => {
			void watch.then((stop) => stop());
		};
	});

	const toastOffset = $derived({
		top: `calc(max(var(--safe-area-top), ${topChromeClearance()}px) + 0.5rem)`,
		bottom: `calc(max(var(--safe-area-bottom), ${bottomChromeClearance()}px) + 0.5rem)`,
	});
</script>

<svelte:head>
	<link rel="icon" href={faviconPng} sizes="any" />
	<link rel="icon" href={faviconSvg} type="image/svg+xml" />
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
	<GoogleHandoffConfirmAlert />
	<EntitlementBypassAlert />
</IconContext>
