<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";

	let { message, onRetry }: { message: string; onRetry: () => void } =
		$props();
</script>

<div data-slot="sticker-error" class="flex flex-col items-center gap-2 p-4">
	<p class="text-center text-sm text-muted-foreground">{message}</p>
	<Button size="sm" onclick={onRetry}>{t("common.actions.retry")}</Button>
</div>
