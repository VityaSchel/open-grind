<script lang="ts">
	import DetectiveIcon from "phosphor-svelte/lib/DetectiveIcon";

	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import ReportPostButton from "#lib/components/right-now/ReportPostButton.svelte";
	import RightNowPostMeta from "#lib/components/right-now/RightNowPostMeta.svelte";
	import RightNowPostPhoto from "#lib/components/right-now/RightNowPostPhoto.svelte";
	import { sexualPositions } from "#lib/model/users/profiles.ts";
	import { labelFromMap } from "#lib/util/options.ts";
	import { formatHeight, formatWeightGrams } from "#lib/util/units.ts";
	import type { DiscreetPostData } from "#lib/model/right-now/feed.ts";

	let {
		post,
		onreport,
	}: { post: DiscreetPostData; onreport: (() => Promise<void>) | null } =
		$props();

	const headlineId = $props.id();

	const units = $derived(preferencesSnapshot().units);
	const photo = $derived(post.media?.at(0));
	const reportable = $derived(Boolean(post.text) || photo !== undefined);
	const fields = $derived(
		[
			post.profileFields.age === null
				? undefined
				: `${post.profileFields.age} years old`,
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
		<DetectiveIcon weight="fill" class="size-6" />
	</div>
	<div class="flex min-w-0 flex-1 flex-col gap-2">
		<div class="flex flex-col gap-1">
			<div class="flex items-start gap-2">
				<h2
					id={headlineId}
					class={[
						"min-w-0 flex-1 font-heading text-base font-medium wrap-break-word whitespace-pre-wrap",
						{ "text-muted-foreground": !post.text },
					]}
				>
					{post.text || "Discreet post"}
				</h2>
				{#if onreport !== null && reportable}
					<ReportPostButton {onreport} />
				{/if}
			</div>
			{#if fields.length > 0}
				<p
					data-slot="right-now-discreet-post-fields"
					class="text-sm text-muted-foreground"
				>
					{fields.join(" · ")}
				</p>
			{/if}
		</div>
		{#if photo}
			<RightNowPostPhoto
				media={photo.data}
				blurred={photo.data.isNsfw && photo.data.shouldBlur}
			/>
		{/if}
		<div class="flex min-h-8 items-center">
			<RightNowPostMeta
				posted={post.posted}
				distance={post.distance}
				hosting={post.hosting}
			/>
		</div>
	</div>
</article>
