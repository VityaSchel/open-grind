<script lang="ts">
	let {
		isOut,
		class: className,
	}: { isOut: boolean; class?: import("svelte/elements").ClassValue } =
		$props();
</script>

<svg
	viewBox="0 0 11 20"
	width="12"
	height="22"
	aria-hidden="true"
	preserveAspectRatio="xMidYMax meet"
	class={[
		"absolute bottom-0",
		{
			"right-full translate-x-[0.5px]": !isOut,
			"left-full translate-x-[-0.5px] -scale-x-100": isOut,
		},
		className,
	]}
>
	<g transform="translate(11 -13)" fill-rule="evenodd">
		<path
			d="M-6 16h6v17c-.193-2.84-.876-5.767-2.05-8.782-.904-2.325-2.446-4.485-4.625-6.48A1 1 0 01-6 16z"
			transform="matrix(1 0 0 -1 0 49)"
		/>
	</g>
</svg>
