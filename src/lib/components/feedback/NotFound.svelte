<script lang="ts">
	import { page } from "$app/state";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import QuestionMarkIcon from "phosphor-svelte/lib/QuestionMarkIcon";
	import { Tween } from "svelte/motion";

	import clippy from "$lib/assets/clippy.avif";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import Link from "$lib/components/ui/link/Link.svelte";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import { t } from "$lib/i18n";
	import { cn } from "$lib/util/utils";

	let flip = $state(false);
	const flipProgress = new Tween(0, { duration: 500 });
	let anchor: HTMLElement | null = $state(null);
</script>

<Empty.Root>
	<Empty.Header>
		<div
			class="no-touch-callout size-10 cursor-help rounded-full transition-transform select-none perspective-near hover:scale-105 motion-reduce:transition-none"
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
					"relative size-full rounded-full transition-transform duration-500 transform-3d *:absolute *:top-0 *:left-0 *:size-full *:backface-hidden motion-reduce:transition-none",
					{ "-rotate-y-180": flip },
				]}
			>
				<Empty.Media variant="icon" class="mb-0">
					<QuestionMarkIcon />
				</Empty.Media>

				<Tooltip.Provider>
					<img
						class="size-full rotate-y-180 rounded-full bg-neutral-200 select-none"
						src={clippy}
						alt={t("shell.notFound.clippy.a11y.image")}
						draggable="false"
					/>
					<Tooltip.Root open={flipProgress.current === 1}>
						<Tooltip.Content
							customAnchor={anchor}
							class="flex max-w-35 flex-col items-start rounded-sm bg-popover text-accent"
							arrowClasses="bg-popover ms-0.5"
						>
							<p>
								{t("shell.notFound.clippy.lost")}
								<br /><br />
								{t("shell.notFound.clippy.offer")}
							</p>
							<br />
							<p>{t("shell.notFound.clippy.promise")}</p>
							<ul class="list-clippy ps-3.5">
								<li>
									{t("shell.notFound.clippy.never.sellData")}
								</li>
								<li>
									{t(
										"shell.notFound.clippy.never.ageVerification",
									)}
								</li>
								<li>
									{t(
										"shell.notFound.clippy.never.exploitation",
									)}
								</li>
							</ul>
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			</div>
		</div>
		<Empty.Title>{t("shell.error.pageNotFound")}</Empty.Title>
		<Empty.Description>
			{t("shell.notFound.description")}
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex gap-2">
			<Button href="/">
				{#if page.url.pathname === "/"}
					{t("shell.error.refresh")}
				{:else}
					{t("shell.error.goHome")}
				{/if}
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
