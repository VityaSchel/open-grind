<script lang="ts">
	import { formatClockTime } from "$lib/i18n/format";
	import { getMessageContext } from "./context";

	const { timestamp } = $derived(getMessageContext()());
</script>

{formatClockTime(timestamp)}
