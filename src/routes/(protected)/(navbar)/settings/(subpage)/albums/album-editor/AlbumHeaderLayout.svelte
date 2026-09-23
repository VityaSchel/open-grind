<script lang="ts">
	import type { Snippet } from "svelte";

	let { preview, children }: { preview: Snippet; children: Snippet } =
		$props();
</script>

<div
	data-slot="album-header"
	class="flex flex-col gap-3 split:flex-row split:items-start split:gap-4"
>
	<div
		data-slot="album-header-preview"
		class="mx-auto flex w-32 max-w-full flex-col split:mx-0 split:w-30 split:shrink-0"
	>
		{@render preview()}
	</div>
	<div
		data-slot="album-header-fields"
		class="flex min-w-0 flex-col gap-3 split:flex-1"
	>
		{@render children()}
	</div>
</div>
