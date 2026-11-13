<script lang="ts">
	import { FLOATING_CHIP_FLY } from "#lib/components/shared/floating-chip.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { fly } from "#lib/util/reduced-motion.ts";
	import type { RightNowPostState } from "../right-now-post-state.svelte";
	import { formatTimeLeft } from "./time-left";

	let {
		ownPost,
		compact = false,
		onjoin,
		onopen,
	}: {
		ownPost: RightNowPostState;
		compact?: boolean;
		onjoin: () => void;
		onopen: () => void;
	} = $props();

	const RING_RADIUS = 9;
	const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
	const DEFAULT_LIFETIME_MS = 60 * 60_000;

	const running = $derived(ownPost.status !== "none");
	const off = $derived(ownPost.status === "off");
	const exhausted = $derived(ownPost.freePostsLeft === 0);
	const unknown = $derived(
		ownPost.post === null &&
			ownPost.freePostsLeft === null &&
			ownPost.loading,
	);
	const timeLeft = $derived(formatTimeLeft({ ms: ownPost.timeLeftMs }));
	const lifetimeMs = $derived.by(() => {
		const posted = ownPost.post?.posted ?? null;
		const expiration = ownPost.post?.expiration ?? null;
		if (posted === null || expiration === null || expiration <= posted)
			return DEFAULT_LIFETIME_MS;
		return expiration - posted;
	});
	const remaining = $derived(
		Math.min(1, Math.max(0, ownPost.timeLeftMs / lifetimeMs)),
	);
	const allowanceText = $derived(
		typeof ownPost.freePostsLeft === "number"
			? ` · ${ownPost.freePostsLeft} left`
			: "",
	);
	const joinLabel = $derived(`Join${allowanceText}`);
	const runningLabel = $derived(
		off
			? `Your Right Now post, off, ${timeLeft} left`
			: `Your Right Now post, ${timeLeft} left`,
	);
	const runningText = $derived(
		off ? `Off · ${timeLeft}` : `${timeLeft} left`,
	);
</script>

{#if !unknown}
	<div
		data-slot="join-button"
		class={[
			"absolute end-[max(var(--spacing)*4,calc(50%-var(--spacing)*80+var(--spacing)*4))] bottom-nav-clear z-10 max-w-[min(calc(50%-var(--spacing)*11),var(--spacing)*69)]",
			{ "floating-chip": running },
		]}
		transition:fly={FLOATING_CHIP_FLY}
	>
		{#if running}
			<Button
				variant="outline"
				size="lg"
				aria-label={runningLabel}
				class={[
					"max-w-full ps-2.5 shadow-sm",
					{ "max-sm:pe-2.5": compact },
				]}
				onclick={onopen}
			>
				<svg
					data-slot="join-button-ring"
					viewBox="0 0 24 24"
					class="size-6 -rotate-90"
					aria-hidden="true"
				>
					<circle
						cx="12"
						cy="12"
						r={RING_RADIUS}
						fill="none"
						stroke-width="3"
						class="stroke-muted"
					/>
					<circle
						data-slot="join-button-ring-progress"
						cx="12"
						cy="12"
						r={RING_RADIUS}
						fill="none"
						stroke-width="3"
						stroke-linecap="round"
						stroke-dasharray={RING_LENGTH}
						stroke-dashoffset={RING_LENGTH * (1 - remaining)}
						class={{
							"stroke-primary": !off,
							"stroke-muted-foreground": off,
						}}
					/>
				</svg>
				<span
					data-slot="join-button-time"
					class={[
						"truncate tabular-nums",
						{ "max-sm:hidden": compact },
					]}
				>
					{runningText}
				</span>
			</Button>
		{:else}
			<Button
				size="lg"
				class="max-w-full shadow-sm"
				disabled={exhausted || ownPost.joining}
				aria-label={exhausted
					? `${joinLabel}. No free posts left in this area`
					: joinLabel}
				onclick={onjoin}
			>
				<span class="truncate"
					>Join<span
						data-slot="join-button-allowance"
						class={{ "max-sm:hidden": compact }}
						>{allowanceText}</span
					></span
				>
			</Button>
		{/if}
	</div>
{/if}
