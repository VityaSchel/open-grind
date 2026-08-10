<script lang="ts" module>
	import { getContext, setContext } from "svelte";

	interface ComboboxContext {
		keyboardNav: boolean;
		setKeyboardNav: (value: boolean) => void;
	}

	export function setComboboxCtx(props: ComboboxContext) {
		setContext("combobox", props);
	}

	export function getComboboxCtx() {
		return getContext<ComboboxContext>("combobox");
	}
</script>

<script lang="ts">
	import { Combobox as ComboboxPrimitive } from "bits-ui";

	let {
		value = $bindable(),
		open = $bindable(false),
		onOpenChange,
		...restProps
	}: ComboboxPrimitive.RootProps = $props();

	let keyboardNav = $state(false);

	setComboboxCtx({
		get keyboardNav() {
			return keyboardNav;
		},
		setKeyboardNav: (next: boolean) => (keyboardNav = next),
	});
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<ComboboxPrimitive.Root
	bind:value={value as never}
	bind:open
	onOpenChange={(isOpen) => {
		if (!isOpen) keyboardNav = false;
		onOpenChange?.(isOpen);
	}}
	{...restProps}
/>
