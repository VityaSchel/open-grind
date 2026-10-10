<script lang="ts">
	import { page } from "$app/state";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import ExclamationMarkIcon from "phosphor-svelte/lib/ExclamationMarkIcon";

	import { promptCopyError } from "$lib/api/error-copy";
	import NotFound from "$lib/components/feedback/NotFound.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { t } from "$lib/i18n";
	import { cn } from "$lib/util/utils";

	const title = $derived(
		t(
			page.status === 404
				? "shell.error.pageNotFound"
				: "shell.error.title",
		),
	);
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>
<main class="flex min-h-dvh w-full p-8">
	{#if page.status === 404}
		<NotFound />
	{:else}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media variant="icon" class="mb-0">
					<ExclamationMarkIcon />
				</Empty.Media>
				<Empty.Title>{t("shell.error.title")}</Empty.Title>
				<Empty.Description
					>{t("shell.error.description")}</Empty.Description
				>
			</Empty.Header>
			<Empty.Content>
				<div class="flex gap-2">
					<Button href="/">
						{#if page.url.pathname === "/"}
							{t("common.actions.retry")}
						{:else}
							{t("shell.error.goHome")}
						{/if}
					</Button>
					<Button
						variant="outline"
						onclick={() =>
							void promptCopyError(page.error).catch(() => {})}
					>
						{t("common.actions.copyError")}
					</Button>
				</div>
			</Empty.Content>
			<Link
				href="https://git.opengrind.org/open-grind/open-grind/issues"
				class={cn(
					buttonVariants({ variant: "link", size: "sm" }),
					"text-muted-foreground",
				)}
			>
				{t("shell.error.reportIssue")}
				<ArrowUpRightIcon class="inline" />
			</Link>
		</Empty.Root>
	{/if}
</main>
