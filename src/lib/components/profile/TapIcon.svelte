<script lang="ts">
	import cookieEmoji from "$lib/assets/emojis/cookie/72px.png";
	import demonEmoji from "$lib/assets/emojis/demon/72px.png";
	import fireEmoji from "$lib/assets/emojis/fire/72px.png";
	import { type MessageKey, t } from "$lib/i18n";
	import { TapType } from "$lib/model/interest/taps";

	let { tapType }: { tapType: TapType } = $props();

	const emojis = {
		[TapType.Friendly]: cookieEmoji,
		[TapType.Hot]: fireEmoji,
		[TapType.Looking]: demonEmoji,
	};

	const altKeys = {
		[TapType.Friendly]: "profile.tap.a11y.icon.friendly",
		[TapType.Hot]: "profile.tap.a11y.icon.hot",
		[TapType.Looking]: "profile.tap.a11y.icon.looking",
	} as const satisfies Record<TapType, MessageKey>;
</script>

<img
	src={emojis[tapType]}
	alt={t(altKeys[tapType])}
	width="24"
	height="24"
	class="shrink-0"
	draggable="false"
/>
