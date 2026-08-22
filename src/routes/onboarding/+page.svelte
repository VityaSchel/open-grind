<script lang="ts">
	import { goto } from "$app/navigation";

	import { showErrorToast } from "$lib/api/error-toast";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Label } from "$lib/components/ui/label";
	import { setAutomaticUpdateChecks } from "$lib/updates";
	import { updatesSelfManaged } from "$lib/updates/capability.svelte";
	import icon from "../../../contrib/logo/open-grind.svg";

	let checkAutomatically = $state(true);
	let starting = $state(false);

	async function start() {
		starting = true;
		try {
			if (updatesSelfManaged()) {
				await setAutomaticUpdateChecks(checkAutomatically);
			}
			await setPreferences({ onboardingComplete: true });
			await goto("/");
		} catch (error) {
			starting = false;
			showErrorToast({ label: "Couldn't finish setup", error });
		}
	}
</script>

<svelte:head>
	<title>Welcome</title>
</svelte:head>

<main class="flex min-h-dvh flex-col px-8 pt-[calc(2rem+var(--safe-area-top))]">
	<div
		class="flex flex-1 flex-col items-center justify-center gap-6 text-center"
	>
		<img src={icon} alt="" class="size-28" />
		<div class="flex flex-col gap-1">
			<h1 class="font-heading text-3xl font-semibold tracking-tight">
				Open Grind
			</h1>
			<p class="text-xl text-muted-foreground">
				Unofficial Grindr client
			</p>
		</div>
		<p class="max-w-sm text-balance text-muted-foreground">
			Cross-platform, free, libre, ad-free, tracker-free, privacy-centered
			and community-driven
		</p>
	</div>

	<div
		class="sticky bottom-0 flex shrink-0 flex-col items-center gap-2 bg-background pt-2 pb-[calc(2rem+var(--safe-area-bottom))]"
	>
		{#if updatesSelfManaged()}
			<Label class="flex items-center rounded-xl p-2 pb-3">
				<Checkbox bind:checked={checkAutomatically} />
				Check updates automatically
			</Label>
		{/if}
		<Button
			size="lg"
			class="w-full max-w-100"
			disabled={starting}
			onclick={start}
		>
			Get started
		</Button>
	</div>
</main>
