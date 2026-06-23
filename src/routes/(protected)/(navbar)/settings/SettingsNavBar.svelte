<script lang="ts">
	import { page } from "$app/state";
	import { ArrowLeftIcon } from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/ProgressiveBlur.svelte";

	const base = "/(protected)/(navbar)/settings/(subpage)";
	const routes: Record<string, { title: string; back: string }> = {
		[`${base}/account`]: { title: "Account Settings", back: "/settings" },
		[`${base}/account/privacy`]: {
			title: "Privacy",
			back: "/settings/account",
		},
		[`${base}/app`]: { title: "App Settings", back: "/settings" },
		[`${base}/profile`]: { title: "Edit Profile", back: "/settings" },
	};

	const current = $derived(
		(page.route.id && routes[page.route.id]) ?? {
			title: "",
			back: "/settings",
		},
	);
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="w-full shrink-0 h-19 z-20 fixed top-(--safe-area-top) left-0"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5"
	tag="nav"
>
	<a
		href={current.back}
		class="flex items-center justify-center w-19 h-full shrink-0"
	>
		<ArrowLeftIcon size={32} />
	</a>
	<span class="truncate min-w-0">
		{current.title}
	</span>
</ProgressiveBlur>
