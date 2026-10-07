<script lang="ts">
	import { QuestionIcon } from "phosphor-svelte";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import Link from "$lib/components/ui/link/Link.svelte";
	import { cn } from "$lib/util/utils";

	let { class: className, ...restProps }: HTMLAnchorAttributes = $props();
</script>

<Link
	href="https://opengrind.org/guides/blocking-and-hiding-profiles"
	aria-label="Why can't I block this profile?"
	class={cn(
		"relative after:absolute after:-inset-x-2 after:-inset-y-1",
		className,
	)}
	{...restProps}
>
	<QuestionIcon class="size-5" />
</Link>
