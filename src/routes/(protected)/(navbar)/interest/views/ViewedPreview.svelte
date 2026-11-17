<script lang="ts">
	import EyeIcon from "phosphor-svelte/lib/EyeIcon";
	import HeartIcon from "phosphor-svelte/lib/HeartIcon";
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";

	import ProfileMiniCard from "#lib/components/profile/ProfileMiniCard.svelte";
	import Frost from "#lib/components/shared/Frost.svelte";
	import { formatList } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import Rich from "#lib/i18n/Rich.svelte";
	import { formatTimeRelativeCustom } from "#lib/util/format-time.ts";
	import { getNow } from "#lib/util/now.ts";
	import type { ViewPreview } from "#lib/model/interest/views.ts";

	let {
		preview,
		...attributes
	}: {
		preview: ViewPreview;
	} & import("svelte/elements").HTMLAttributes<HTMLDivElement> = $props();

	const { totalCount, maxDisplayCount } = $derived(preview.viewedCount);
	const viewCount = $derived(
		totalCount > maxDisplayCount
			? ({
					key: "interest.views.preview.cappedViewCount",
					count: maxDisplayCount,
				} as const)
			: ({
					key: "interest.views.preview.viewCount",
					count: totalCount,
				} as const),
	);
	const viewer = $derived(
		preview.isSecretAdmirer
			? t("interest.views.preview.a11y.secretAdmirer")
			: t("interest.views.preview.a11y.hiddenViewer"),
	);
	const lastViewed = $derived.by(() => {
		void getNow();
		return preview.lastViewed === null
			? null
			: formatTimeRelativeCustom(preview.lastViewed);
	});
	const label = $derived(
		formatList([
			viewer,
			...(lastViewed === null ? [] : [lastViewed]),
			...(totalCount > 1
				? [
						t("interest.views.preview.totalViews", {
							count: totalCount,
						}),
					]
				: []),
		]),
	);
</script>

{#snippet srOnly(text: string)}<span class="sr-only">{text}</span>{/snippet}

<div role="img" aria-label={label} {...attributes}>
	<ProfileMiniCard
		anonymous
		mediaHash={preview.profileImageMediaHash}
		distance={preview.distance}
		isFavorite={preview.isFavorite}
		class="rounded-[inherit]"
	>
		{#snippet overlay(photo: string | null)}
			<div
				class="absolute inset-0 isolate flex items-center justify-center"
			>
				<div
					class="relative flex size-9 items-center justify-center rounded-full bg-black/35 scrim text-white"
				>
					<Frost
						src={photo}
						blur="veil"
						class="inset-0"
						photoClass="top-1/2 left-1/2 -translate-1/2"
					/>
					{#if preview.isSecretAdmirer}
						<HeartIcon
							weight="fill"
							class="size-4.5 text-rose-400"
						/>
						<span class="sr-only"
							>{t(
								"interest.views.preview.a11y.secretAdmirer",
							)}</span
						>
					{:else}
						<LockSimpleIcon weight="fill" class="size-4.5" />
						<span class="sr-only"
							>{t(
								"interest.views.preview.a11y.hiddenViewer",
							)}</span
						>
					{/if}
				</div>
			</div>
			{#if preview.lastViewed !== null || totalCount > 1}
				<div
					class="absolute inset-x-0 bottom-0 z-1 flex items-center justify-between gap-1 bg-linear-to-t from-black/65 to-transparent px-1.5 pt-6 pb-1 text-2xs font-medium text-white/90"
				>
					<span class="truncate">{lastViewed}</span>
					{#if totalCount > 1}
						<span
							class="flex shrink-0 items-center gap-0.5"
							title={t("interest.views.preview.totalViews", {
								count: totalCount,
							})}
						>
							<EyeIcon weight="bold" class="size-3" />
							<Rich
								key={viewCount.key}
								count={viewCount.count}
								{srOnly}
							/>
						</span>
					{/if}
				</div>
			{/if}
		{/snippet}
	</ProfileMiniCard>
</div>
