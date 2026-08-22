<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";

	import { Progress } from "$lib/components/ui/progress";
	import type { UpdateStage } from "./stage";
	import ToastCard from "./ToastCard.svelte";

	let {
		stage,
		received,
		total,
		onActivate,
		onCancel,
	}: {
		stage: UpdateStage;
		received: number;
		total: number;
		onActivate: () => void;
		onCancel: () => void;
	} = $props();

	const copy = $derived(
		{
			available: {
				icon: DownloadSimpleIcon,
				title: "New update available",
				body: "Tap to install, swipe to dismiss",
			},
			downloading: {
				icon: DownloadSimpleIcon,
				title: "Downloading update…",
				body: undefined,
			},
			verifying: {
				icon: ArrowsClockwiseIcon,
				title: "Verifying the update…",
				body: undefined,
			},
			paused: {
				icon: DownloadSimpleIcon,
				title: "Update is available",
				body: "Tap to download",
			},
			ready: {
				icon: ArrowsClockwiseIcon,
				title: "Update is downloaded",
				body: "Tap to install",
			},
			installing: {
				icon: ArrowsClockwiseIcon,
				title: "Installing…",
				body: undefined,
			},
		}[stage],
	);
	const indeterminate = $derived(
		stage === "installing" || stage === "verifying",
	);
	const percent = $derived(
		indeterminate
			? 100
			: total === 0
				? 0
				: Math.min(100, Math.round((received / total) * 100)),
	);
</script>

<ToastCard
	icon={copy.icon}
	title={copy.title}
	body={copy.body}
	onActivate={copy.body === undefined ? undefined : onActivate}
	onCancel={stage === "downloading" ? onCancel : undefined}
>
	<Progress
		value={percent}
		class={["mt-2", { "animate-pulse": indeterminate }]}
	/>
</ToastCard>
