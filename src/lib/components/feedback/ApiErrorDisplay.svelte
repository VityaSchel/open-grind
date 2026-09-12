<script lang="ts">
	import {
		ApiError,
		type ApiErrorKind,
		blockedAndStaleMessages,
	} from "$lib/api/api-error";
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

	const kindMessages: Partial<Record<ApiErrorKind, string>> = {
		...blockedAndStaleMessages,
		Connect: "Couldn't connect to Grindr",
		Http: "Couldn't reach the server",
	};

	const apiError = $derived(error instanceof ApiError ? error : null);
	const retryable = $derived(apiError?.retryable ?? false);
	const kindMessage = $derived(
		apiError?.kind ? kindMessages[apiError.kind] : undefined,
	);
	const fallbackMessage = $derived(
		retryable ? "The server ran into a problem" : "Something went wrong",
	);
	const message = $derived(kindMessage ?? fallbackMessage);
</script>

<div class={["flex flex-col items-center gap-2 p-4", className]}>
	<p class="text-center text-sm text-muted-foreground">{message}</p>
	<div class="flex gap-2">
		{#if onRetry}
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
