<script lang="ts">
	import { ApiError } from "$lib/api/api-error";
	import { promptCopyError } from "$lib/api/error-copy";
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
	const message = $derived.by(() => {
		if (apiError?.kind === "RequestBlocked") {
			return "Grindr is blocking your requests";
		}
		if (apiError?.kind === "NetworkBlocked") {
			return "Something blocked the request before it reached Grindr";
		}
		if (!retryable) {
			return "Something went wrong";
		}
		if (apiError?.kind === "Http") {
			return "Couldn't reach the server";
		}
		return "The server ran into a problem";
	});
</script>

<div class={["flex flex-col items-center gap-2 p-4", className]}>
	<p class="text-center text-sm text-muted-foreground">{message}</p>
	<div class="flex gap-2">
		{#if onRetry && retryable}
			<Button
				variant={buttonVariant === "outline"
					? "default"
					: buttonVariant}
				size="sm"
				onclick={onRetry}
			>
				Retry
			</Button>
		{/if}
		<Button
			variant={buttonVariant}
			size="sm"
			onclick={() => void promptCopyError(error).catch(() => {})}
		>
			Copy details
		</Button>
	</div>
</div>
