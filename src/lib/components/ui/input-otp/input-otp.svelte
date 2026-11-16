<script lang="ts">
	import { PinInput as InputOTPPrimitive } from "bits-ui";

	import { cn } from "#lib/util/utils.ts";

	let {
		ref = $bindable(null),
		inputRef = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: InputOTPPrimitive.RootProps = $props();
</script>

<InputOTPPrimitive.Root
	bind:ref
	bind:inputRef
	bind:value
	data-slot="input-otp"
	spellcheck={false}
	class={cn(
		"cn-input-otp flex items-center gap-2 has-disabled:opacity-50",
		"disabled:cursor-not-allowed",
		className,
	)}
	{...restProps}
/>
