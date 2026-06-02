<script lang="ts">
	import { hivStatuses, type HivStatusId } from "$lib/model/profile";
	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let {
		hivStatus,
	}: {
		hivStatus: HivStatusId | null;
	} = $props();
</script>

{#if hivStatus !== null}
	<ProfileField>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			viewBox="0 0 24 24"
			class="shrink-0"
		>
			<!-- Icon from Sharp free icons by Streamline - https://creativecommons.org/licenses/by/4.0/ -->
			<g fill="none" stroke="currentColor" stroke-width="1.5">
				<path
					d="M7.306 4.023a6.36 6.36 0 0 0 0 8.992l1.505 1.504l-4.265 4.266l2.991 2.99l4.265-4.264l4.251 4.25l3.001-3l-4.25-4.251l1.494-1.495a6.358 6.358 0 0 0-8.992-8.992Z"
				/>
				<path
					d="M10.283 6.988a2.13 2.13 0 0 0 0 3.014l1.507 1.507l1.507-1.507a2.13 2.13 0 1 0-3.014-3.014Zm1.507 4.52l3.214 3.214m-6.207-.22l3.213 3.214"
				/>
			</g>
		</svg>
		<ProfileValueLabel label="HIV Status">
			{hivStatuses[hivStatus]}
		</ProfileValueLabel>
	</ProfileField>
{/if}
