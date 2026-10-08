<script lang="ts">
	import { MapPinIcon } from "phosphor-svelte";

	import Rich from "$lib/i18n/Rich.svelte";
</script>

<span>
	<Rich key="feedback.autoLocationToast.message">
		{#snippet menuIcon()}<MapPinIcon
				weight="fill"
				class="inline size-5 align-middle"
			/>{/snippet}
	</Rich>
</span>
