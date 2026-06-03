<script lang="ts">
	import { page } from "$app/state";

	import { Button } from "$lib/components/ui/button";
	import { toggleVariants } from "$lib/components/ui/toggle";

	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<div class="flex w-full p-4 flex-1">
	<main class="max-w-120 w-full flex flex-col mx-auto gap-3 flex-1">
		<div class="flex items-center w-full *:flex-1">
			{#snippet tab(href: string, label: string)}
				<Button
					{href}
					class={[
						toggleVariants({ variant: "default" }),
						"text-muted-foreground",
						{
							"bg-popover": page.url.pathname === href,
						},
					]}
				>
					{label}
				</Button>
			{/snippet}
			{@render tab("/interest/views", "Views")}
			{@render tab("/interest/taps", "Taps")}
		</div>
		{@render children?.()}
	</main>
</div>
