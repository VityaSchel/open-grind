<script lang="ts">
	import ArrowsClockwiseIcon from "phosphor-svelte/lib/ArrowsClockwiseIcon";
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";

	import { Progress } from "$lib/components/ui/progress";
	import { APP_COMPONENT, type ComponentKey } from "./components";
	import {
		type InstallKind,
		stageBody,
		stageTitle,
		type UpdateStage,
	} from "./stage";
	import ToastCard from "./ToastCard.svelte";

	let {
		component = APP_COMPONENT,
		kind,
		stage,
		received,
		total,
		onActivate,
		onCancel,
	}: {
		component?: ComponentKey;
		kind: InstallKind;
		stage: UpdateStage;
		received: number;
		total: number;
		onActivate: () => void;
		onCancel: () => void;
	} = $props();

	const icons = {
		available: DownloadSimpleIcon,
		downloading: DownloadSimpleIcon,
		verifying: ArrowsClockwiseIcon,
		paused: DownloadSimpleIcon,
		ready: ArrowsClockwiseIcon,
		installing: ArrowsClockwiseIcon,
	} satisfies Record<UpdateStage, unknown>;

	const title = $derived(stageTitle({ component, kind, stage }));
	const body = $derived(stageBody({ component, kind, stage }));
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
	icon={icons[stage]}
	{title}
	{body}
	onActivate={body === undefined ? undefined : onActivate}
	onCancel={stage === "downloading" ? onCancel : undefined}
>
	<Progress
		value={percent}
		class={["mt-2", { "animate-pulse": indeterminate }]}
	/>
</ToastCard>
