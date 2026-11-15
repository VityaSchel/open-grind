<script lang="ts">
	import type { ClassValue } from "svelte/elements";

	import { Button } from "#lib/components/ui/button/index.ts";
	import { MATURE_CONTENT_SETTING_HREF } from "./mature-content.ts";

	let {
		compact = false,
		class: className,
	}: { compact?: boolean; class?: ClassValue } = $props();
</script>

<div
	data-slot="mature-content-cover"
	class={[
		"@container absolute inset-0 flex flex-col items-center justify-center gap-[6cqw] overflow-hidden bg-mature-cover text-mature-cover-foreground",
		className,
	]}
>
	<span class="text-[clamp(0.5rem,24cqw,1.5rem)] leading-none font-semibold">
		18+
	</span>
	{#if !compact}
		<Button
			href={MATURE_CONTENT_SETTING_HREF}
			variant="secondary"
			size="sm"
			aria-label="Show mature content"
		>
			Show
		</Button>
	{/if}
</div>
