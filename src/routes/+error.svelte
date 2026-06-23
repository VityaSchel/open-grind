<script lang="ts">
	import { writeText } from "@tauri-apps/plugin-clipboard-manager";
	import { page } from "$app/state";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import ExclamationMarkIcon from "phosphor-svelte/lib/ExclamationMarkIcon";
	import QuestionMarkIcon from "phosphor-svelte/lib/QuestionMarkIcon";
	import { toast } from "svelte-sonner";
	import { Tween } from "svelte/motion";

	import clippy from "$lib/assets/clippy.avif";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import Link from "$lib/components/ui/link/Link.svelte";
	import * as Tooltip from "$lib/components/ui/tooltip";

	let flip = $state(false);
	let flipProgress = new Tween(0, { duration: 500 });
	let anchor: HTMLElement | null = $state(null);

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
<main class="w-full min-h-dvh flex p-8">
	<Empty.Root>
		<Empty.Header>
			{#if page.status === 404}
				<div
					class="perspective-near size-10 cursor-help hover:scale-105 transition-transform rounded-full no-touch-callout select-none"
					onpointerdown={() => {
						flip = true;
						flipProgress.target = 1;
						window.addEventListener(
							"pointerup",
							() => {
								flip = false;
								flipProgress.target = 0;
							},
							{ once: true },
						);
					}}
					role="button"
					tabindex="-1"
					bind:this={anchor}
				>
					<div
						class={[
							"transform-3d relative transition-transform duration-500 rounded-full size-full *:backface-hidden *:absolute *:top-0 *:left-0 *:size-full",
							{
								"-rotate-y-180": flip,
							},
						]}
					>
						<Empty.Media variant="icon" class="mb-0">
							<QuestionMarkIcon />
						</Empty.Media>

						<Tooltip.Provider>
							<img
								class="rotate-y-180 size-full rounded-full bg-neutral-200 select-none"
								src={clippy}
								alt="Clippy"
								draggable="false"
							/>
							<Tooltip.Root open={flipProgress.current === 1}>
								<Tooltip.Content
									customAnchor={anchor}
									class="bg-popover text-accent rounded-sm max-w-35 flex flex-col items-start"
									arrowClasses="bg-popover ms-0.5"
								>
									<p>
										It looks like you're a little lost.
										<br /><br />
										Would you like help?
									</p>
									<br />
									<p>Don't worry, Clippy would never</p>
									<ul class="list-clippy ps-3.5">
										<li>Sell your information</li>
										<li>Add AI age verification</li>
										<li>Exploit troubled queers</li>
									</ul>
								</Tooltip.Content>
							</Tooltip.Root>
						</Tooltip.Provider>
					</div>
				</div>
			{:else}
				<Empty.Media variant="icon" class="mb-0">
					<ExclamationMarkIcon />
				</Empty.Media>
			{/if}
			<Empty.Title>
				{title}
			</Empty.Title>
			<Empty.Description>
				{#if page.status === 404}
					The page you are looking for does not exist.
				{:else}
					An unexpected error has occurred.
				{/if}
			</Empty.Description>
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
				{#if page.status !== 404}
					<Button
						variant="outline"
						onclick={() => {
							writeText(
								page.error?.message || "No error message available",
							).catch((error) => console.error(error));
							toast.success("Error message copied to clipboard");
						}}
					>
						Copy error
					</Button>
				{/if}
			</div>
		</Empty.Content>
		<Button variant="link" class="text-muted-foreground" size="sm">
			<Link
				href="https://git.opengrind.org/open-grind/open-grind/issues"
			>
				Report an issue <ArrowUpRightIcon class="inline" />
			</Link>
		</Button>
	</Empty.Root>
</main>

<style>
	.no-touch-callout {
		-webkit-touch-callout: none;
	}
	.list-clippy {
		list-style: disc;
		list-style-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAAXNSR0IArs4c6QAAAGpJREFUGJVNj9ENw0AIQ991pbcTnemyk2eiH1ySWkJC2ML24sDaTSRcgJDvAvgAULtRYnjg7hG420gSOLwIBNy9sJr7UDWKZOaxIMiQVWIJCngLXn/vCJltnQpj4xDxWORa601dzf+PU/MHsYYuASTKpQUAAAAASUVORK5CYII=");
		image-rendering: pixelated;
	}
</style>
