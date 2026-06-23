<script lang="ts">
	import cookieEmoji from "$lib/assets/emojis/cookie/72px.png";
	import demonEmoji from "$lib/assets/emojis/demon/72px.png";
	import fireEmoji from "$lib/assets/emojis/fire/72px.png";
	import { TapType, tapTypes } from "$lib/model/interest/taps";

	let {
		tapType,
	}: {
		tapType: TapType;
	} = $props();

	const emojis = {
		[TapType.Friendly]: cookieEmoji,
		[TapType.Hot]: fireEmoji,
		[TapType.Looking]: demonEmoji,
	};
</script>

<img
	src={emojis[tapType]}
	alt={`${tapTypes[tapType]} emoji`}
	width="24"
	height="24"
	class="shrink-0"
	draggable="false"
/>
