<script lang="ts">
	import { writeText } from "@tauri-apps/plugin-clipboard-manager";
	import { page } from "$app/state";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import ExclamationMarkIcon from "phosphor-svelte/lib/ExclamationMarkIcon";
	import { toast } from "svelte-sonner";

	import NotFound from "$lib/components/feedback/NotFound.svelte";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { cn } from "$lib/util/utils";

	const title = $derived.by(() => {
		switch (page.status) {
			case 404:
				return "Page not found";
			default:
				return "Unexpected Error";
		}
	});
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
				<Empty.Title>Unexpected Error</Empty.Title>
				<Empty.Description
					>An unexpected error has occurred.</Empty.Description
				>
			</Empty.Header>
			<Empty.Content>
				<div class="flex gap-2">
					<Button href="/">
						{#if page.url.pathname === "/"}
							Refresh
						{:else}
							Go to home page
						{/if}
					</Button>
					<Button
						variant="outline"
						onclick={() => {
							writeText(
								page.error?.message ||
									"No error message available",
							).catch((error) => console.error(error));
							toast.success("Error message copied to clipboard");
						}}
					>
						Copy error
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
				Report an issue <ArrowUpRightIcon class="inline" />
			</Link>
		</Empty.Root>
	{/if}
</main>
