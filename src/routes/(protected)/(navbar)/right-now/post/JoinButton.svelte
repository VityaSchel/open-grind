<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.ts";
	import type { RightNowPostState } from "../right-now-post-state.svelte";
	import { formatTimeLeft } from "./time-left";

	let {
		post,
		onjoin,
		onopen,
	}: { post: RightNowPostState; onjoin: () => void; onopen: () => void } =
		$props();

	const RING_RADIUS = 9;
	const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
	const DEFAULT_LIFETIME_MS = 60 * 60_000;

	const running = $derived(post.status !== "none");
	const off = $derived(post.status === "off");
	const exhausted = $derived(post.freePostsLeft === 0);
	const unknown = $derived(
		post.post === null && post.freePostsLeft === null && post.loading,
	);
	const timeLeft = $derived(formatTimeLeft({ ms: post.timeLeftMs }));
	const lifetimeMs = $derived.by(() => {
		const posted = post.post?.posted ?? null;
		const expiration = post.post?.expiration ?? null;
		if (posted === null || expiration === null || expiration <= posted)
			return DEFAULT_LIFETIME_MS;
		return expiration - posted;
	});
	const remaining = $derived(
		Math.min(1, Math.max(0, post.timeLeftMs / lifetimeMs)),
	);
	const joinLabel = $derived.by(() => {
		if (typeof post.freePostsLeft !== "number") return "Join";
		return `Join · ${post.freePostsLeft} left`;
	});
	const runningLabel = $derived(
		off
			? `Your Right Now post, off, ${timeLeft} left`
			: `Your Right Now post, ${timeLeft} left`,
	);
</script>

{#if !unknown}
	<div
		data-slot="join-button"
		class={[
			"absolute end-4 bottom-nav-clear z-10 max-w-[calc(50%-var(--spacing)*11)]",
			{ "floating-chip": running },
		]}
	>
		{#if running}
			<Button
				variant="outline"
				size="lg"
				aria-label={runningLabel}
				class={["max-w-full ps-2.5 shadow-sm", { "opacity-60": off }]}
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
						class="stroke-primary"
					/>
				</svg>
				<span class="truncate tabular-nums">{timeLeft} left</span>
			</Button>
		{:else}
			<Button
				size="lg"
				class="max-w-full shadow-md"
				disabled={exhausted || post.joining}
				aria-label={exhausted
					? `${joinLabel}. No free posts left in this area`
					: undefined}
				onclick={onjoin}
			>
				<span class="truncate">{joinLabel}</span>
			</Button>
		{/if}
	</div>
{/if}
