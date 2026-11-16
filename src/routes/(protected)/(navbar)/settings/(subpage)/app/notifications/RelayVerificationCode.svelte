<script lang="ts">
	import { REGEXP_ONLY_DIGITS } from "bits-ui";
	import { fade } from "svelte/transition";

	import * as InputOTP from "#lib/components/ui/input-otp/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		clearRelayCodeMismatch,
		submitRelayCode,
	} from "#lib/push/delivery.svelte.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import { slide } from "#lib/util/reduced-motion.ts";

	let { labelledBy }: { labelledBy: string } = $props();

	const CODE_LENGTH = 6;
	const GROUP_LENGTH = 3;
	const TRANSITION_MS = 200;

	const errorId = $props.id();

	let code = $state("");
	let input = $state<HTMLInputElement | null>(null);

	const mismatch = $derived(notificationSettings.codeMismatch);

	$effect(() => {
		if (!notificationSettings.committing) input?.focus();
	});

	function codeChanged(next: string): void {
		clearRelayCodeMismatch();
		if (next.length === CODE_LENGTH) void submitRelayCode(next);
	}
</script>

<div
	data-slot="relay-verification-code"
	class="flex flex-col items-center"
	aria-busy={notificationSettings.committing}
>
	<InputOTP.Root
		bind:value={code}
		bind:inputRef={input}
		maxlength={CODE_LENGTH}
		pattern={REGEXP_ONLY_DIGITS}
		inputmode="numeric"
		autocomplete="one-time-code"
		disabled={notificationSettings.committing}
		aria-labelledby={labelledBy}
		aria-invalid={mismatch}
		aria-describedby={mismatch ? errorId : undefined}
		onValueChange={codeChanged}
	>
		{#snippet children({ cells })}
			<InputOTP.Group>
				{#each cells.slice(0, GROUP_LENGTH) as cell, index (index)}
					<InputOTP.Slot {cell} aria-invalid={mismatch} />
				{/each}
			</InputOTP.Group>
			<InputOTP.Separator aria-hidden="true" />
			<InputOTP.Group>
				{#each cells.slice(GROUP_LENGTH) as cell, index (index)}
					<InputOTP.Slot {cell} aria-invalid={mismatch} />
				{/each}
			</InputOTP.Group>
		{/snippet}
	</InputOTP.Root>
	<div aria-live="polite" class="self-stretch">
		{#if mismatch}
			<p
				id={errorId}
				class="pt-2 text-center text-sm text-destructive"
				transition:slide={{ duration: TRANSITION_MS }}
			>
				<span transition:fade={{ duration: TRANSITION_MS }}>
					{t(
						"settings.notifications.fastConfig.relaySetup.incorrectCode",
					)}
				</span>
			</p>
		{/if}
	</div>
</div>
