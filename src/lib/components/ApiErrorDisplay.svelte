<script lang="ts">
	import { copyError } from "$lib/api/error";
	import { Button } from "$lib/components/ui/button";

	let {
		error,
		class: className,
		buttonVariant = "outline",
	}: {
		error: unknown;
		class?: import("svelte/elements").ClassValue;
		buttonVariant?: import("$lib/components/ui/button").ButtonVariant;
	} = $props();
</script>

<div class={["flex flex-col items-center gap-2 p-4", className]}>
	<p class="text-muted-foreground text-sm text-center">Something went wrong</p>
	<Button variant={buttonVariant} size="sm" onclick={() => copyError(error)}>
		Copy details
	</Button>
</div>
