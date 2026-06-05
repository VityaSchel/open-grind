<script lang="ts">
	import { ApiError } from "$lib/api/api-error";
	import { copyError } from "$lib/api/error";
	import { Button } from "$lib/components/ui/button";

	let {
		error,
		onRetry,
		class: className,
		buttonVariant = "outline",
	}: {
		error: unknown;
		onRetry?: () => void;
		class?: import("svelte/elements").ClassValue;
		buttonVariant?: import("$lib/components/ui/button").ButtonVariant;
	} = $props();

	const apiError = $derived(error instanceof ApiError ? error : null);
	const retryable = $derived(apiError?.retryable ?? false);
	const message = $derived(
		!retryable
			? "Something went wrong"
			: apiError?.kind === "Http"
				? "Couldn't reach the server"
				: "The server ran into a problem",
	);
</script>

<div class={["flex flex-col items-center gap-2 p-4", className]}>
	<p class="text-muted-foreground text-sm text-center">{message}</p>
	<div class="flex gap-2">
		{#if onRetry && retryable}
			<Button
				variant={buttonVariant === "outline" ? "default" : buttonVariant}
				size="sm"
				onclick={onRetry}
			>
				Retry
			</Button>
		{/if}
		<Button variant={buttonVariant} size="sm" onclick={() => copyError(error)}>
			Copy details
		</Button>
	</div>
</div>
