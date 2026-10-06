<script lang="ts">
	import { ApiError, apiErrorMessage } from "$lib/api/api-error";
	import { promptCopyError } from "$lib/api/error-copy";
	import { Button } from "$lib/components/ui/button";
	import { t } from "$lib/i18n";

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
	const kindMessage = $derived(
		apiError?.kind ? apiErrorMessage(apiError.kind) : undefined,
	);
	const fallbackMessage = $derived(
		t(
			retryable
				? "feedback.apiErrorDisplay.retryableFailure"
				: "feedback.apiErrorDisplay.unknownFailure",
		),
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
				{t("common.actions.retry")}
			</Button>
		{/if}
		<Button
			variant={buttonVariant}
			size="sm"
			onclick={() => void promptCopyError(error).catch(() => {})}
		>
			{t("feedback.actions.copyDetails")}
		</Button>
	</div>
</div>
