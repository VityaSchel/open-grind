<script lang="ts">
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";

	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import { softKeyboardVisibility } from "$lib/platform/android-native-bridge";
	import MessageTextInput from "./MessageTextInput.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

	let {
		label,
		allowReply,
		allowReaction,
		onsubmit,
	}: {
		label: string;
		allowReply: boolean;
		allowReaction: boolean;
		onsubmit: (text: string) => void;
	} = $props();

	const interactions = {
		onpointerdown: (event: PointerEvent) => event.stopPropagation(),
		onkeydown: (event: KeyboardEvent) => {
			if (event.key !== "Escape" && event.key !== "Tab")
				event.stopPropagation();
		},
	};

	let text = $state("");
	let available = $state(false);
	let reacted = $state(false);
	const react = $derived(allowReaction && text.trim() === "");
	const variant = $derived.by(() => {
		if (!react) return "ghost";
		return reacted ? "default" : "outline";
	});

	export function update({
		enabled,
		reactionSent = false,
		reset = false,
	}: {
		enabled: boolean;
		reactionSent?: boolean;
		reset?: boolean;
	}) {
		available = enabled;
		reacted = reactionSent;
		if (reset) text = "";
	}
</script>

<form
	class="mx-auto max-w-160 px-2 pb-2 text-foreground"
	onsubmit={(event) => {
		event.preventDefault();
		if (available && (react ? !reacted : text.trim()))
			onsubmit(text.trim());
	}}
>
	<div class="relative min-h-11 w-full rounded-composer bg-popover">
		{#if allowReply}
			<MessageTextInput
				{...interactions}
				padding="pr-12 pl-3"
				aria-label={label}
				placeholder="Write a reply..."
				disabled={!available}
				bind:value={text}
			/>
		{/if}
		<PrimaryComposerButton
			type="submit"
			{variant}
			class={[
				"right-1 bottom-1 size-9 rounded-full! p-0",
				{ "disabled:opacity-100": react && reacted },
			]}
			aria-label={react ? "React to album item with fire" : "Send reply"}
			disabled={!available || (react ? reacted : text.trim() === "")}
			onpointerdown={(event) => {
				if (softKeyboardVisibility() !== false) event.preventDefault();
			}}
		>
			{#snippet icon(props)}
				{#if react}
					<img src={fireEmoji} alt="" class="size-6" />
				{:else}
					<PaperPlaneRightIcon weight="fill" {...props} />
				{/if}
			{/snippet}
		</PrimaryComposerButton>
	</div>
</form>
