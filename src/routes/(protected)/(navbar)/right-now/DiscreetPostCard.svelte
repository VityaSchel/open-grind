<script lang="ts">
	import DetectiveIcon from "phosphor-svelte/lib/DetectiveIcon";

	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import { sexualPositions } from "#lib/model/users/profiles.ts";
	import { labelFromMap } from "#lib/util/options.ts";
	import { formatHeight, formatWeightGrams } from "#lib/util/units.ts";
	import type { DiscreetPostData } from "#lib/model/right-now/feed.ts";
	import RightNowPostMeta from "./RightNowPostMeta.svelte";
	import RightNowPostPhoto from "./RightNowPostPhoto.svelte";

	let { post }: { post: DiscreetPostData } = $props();

	const headlineId = $props.id();

	const units = $derived(preferencesSnapshot().units);
	const photo = $derived(post.media?.at(0));
	const fields = $derived(
		[
			post.profileFields.age?.toString(),
			post.profileFields.height === null
				? undefined
				: formatHeight(post.profileFields.height, units),
			post.profileFields.weight === null
				? undefined
				: formatWeightGrams(post.profileFields.weight, units),
			post.profileFields.position === null
				? undefined
				: labelFromMap({
						labels: sexualPositions,
						id: post.profileFields.position,
					}),
		].filter((field) => field !== undefined),
	);
</script>

<article
	data-slot="right-now-discreet-post"
	aria-labelledby={headlineId}
	class="flex gap-3 py-3"
>
	<div
		class="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
	>
		<DetectiveIcon class="size-6" />
	</div>
	<div class="flex min-w-0 flex-1 flex-col gap-2">
		<h2
			id={headlineId}
			class={[
				"font-heading text-base font-semibold wrap-break-word whitespace-pre-wrap",
				{ "text-muted-foreground": !post.text },
			]}
		>
			{post.text || "Discreet post"}
		</h2>
		{#if fields.length > 0}
			<p
				data-slot="right-now-discreet-post-fields"
				class="text-sm text-muted-foreground"
			>
				{fields.join(" · ")}
			</p>
		{/if}
		{#if photo}
			<RightNowPostPhoto media={photo} />
		{/if}
		<div class="flex min-h-9 items-center">
			<RightNowPostMeta
				posted={post.posted}
				distance={post.distance}
				hosting={post.hosting}
			/>
		</div>
	</div>
</article>
