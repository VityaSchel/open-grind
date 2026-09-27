<script lang="ts">
	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();
</script>

<svg
	viewBox="0 0 256 256"
	aria-hidden="true"
	class={["fill-stone-400", className]}
>
	<circle cx="128" cy="95.97" r="72" />
	<path
		d="M128,224H32C25.84,224,22.04,217.36,25.08,212C40.31,185.67,63.78,166.79,91.17,157.84H164.83C192.22,166.79,215.69,185.67,230.92,212C233.96,217.36,230.16,224,224,224Z"
	/>
</svg>
