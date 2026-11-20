<script lang="ts">
	import { Combobox } from "bits-ui";
	import type { KeyboardEventHandler } from "svelte/elements";

	import { getPlaces } from "#lib/api/browse/location.ts";
	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import { buttonVariants } from "#lib/components/ui/button/index.ts";
	import { Input } from "#lib/components/ui/input/index.ts";
	import Spinner from "#lib/components/ui/spinner/spinner.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import { cn } from "#lib/util/utils.ts";

	let {
		onpick,
		clearsLocateButton = false,
	}: {
		onpick: (place: { lat: number; lon: number }) => void;
		clearsLocateButton?: boolean;
	} = $props();

	const resultsId = $props.id();
	const CLOSE_AFTER_BLUR_MS = 200;
	const caretKeys = new Set(["Home", "End"]);
	const highlightKeys = new Set([
		"ArrowDown",
		"ArrowUp",
		"PageDown",
		"PageUp",
	]);

	let query = $state("");
	let showResults = $state(false);
	let highlightShown = $state(false);
	let input = $state<HTMLInputElement | null>(null);
	let panel = $state<HTMLElement | null>(null);
	let listbox = $state<HTMLElement | null>(null);
	let pickedByPointer = false;
	let tabbingFromPanel = false;

	const places = $derived.by(async () => {
		const trimmed = query.trim();
		if (!trimmed) return;
		const response = await getPlaces({ query: trimmed });
		return response.places.toSorted((a, b) => b.importance - a.importance);
	});

	function closeResults() {
		showResults = false;
		highlightShown = false;
	}

	async function pick(index: string) {
		const place = (await places)?.[Number(index)];
		if (!place) return;
		onpick({ lat: place.lat, lon: place.lon });
		closeResults();
		if (pickedByPointer) input?.blur();
	}

	function handleFieldKey({
		event,
		forwardToList,
	}: {
		event: KeyboardEvent & { currentTarget: HTMLInputElement };
		forwardToList: KeyboardEventHandler<HTMLInputElement>;
	}) {
		pickedByPointer = false;
		if (caretKeys.has(event.key)) return;
		if (event.key === "Tab" && listbox === null) return;
		if (event.key === "Enter" && !highlightShown) return;
		if (highlightKeys.has(event.key)) {
			const revealsCurrentHighlight =
				event.key === "ArrowDown" && showResults && !highlightShown;
			highlightShown = true;
			if (revealsCurrentHighlight) {
				event.preventDefault();
				return;
			}
		}
		forwardToList(event);
	}

	function closeUnlessKeyboardFocusMovesIntoPanel() {
		setTimeout(() => {
			const focused = document.activeElement;
			const keyboardFocusInPanel =
				focused instanceof HTMLElement &&
				focused !== panel &&
				(panel?.contains(focused) ?? false) &&
				focused.matches(":focus-visible");
			if (!keyboardFocusInPanel) closeResults();
		}, CLOSE_AFTER_BLUR_MS);
	}

	function closeWhenTabLeavesPanel(event: FocusEvent) {
		const target = event.relatedTarget;
		const staysInSearch =
			target instanceof Node &&
			(target === input || (panel?.contains(target) ?? false));
		if (tabbingFromPanel && !staysInSearch) closeResults();
		tabbingFromPanel = false;
	}

	dismissOnBackGesture({ active: () => showResults, dismiss: closeResults });
</script>

<Combobox.Root
	type="single"
	bind:value={() => "", (index: string) => void pick(index)}
	bind:open={
		() => showResults,
		(open: boolean) => {
			if (open && query.length > 0) {
				showResults = true;
			} else {
				closeResults();
			}
		}
	}
>
	<div
		class={[
			"absolute bottom-4 z-1010 w-full p-2",
			{ "max-w-[calc(100%-2.5rem)]": clearsLocateButton },
		]}
	>
		<Combobox.Input
			id="search-place"
			type="search"
			placeholder={t("browse.locationChooser.searchPlaceholder")}
			maxlength={100}
			oninput={(event) => {
				query = event.currentTarget.value;
				highlightShown = false;
				if (query.length > 0) {
					showResults = true;
				} else {
					closeResults();
				}
			}}
			onfocus={() => {
				if (query.trim()) showResults = true;
			}}
			onblur={closeUnlessKeyboardFocusMovesIntoPanel}
		>
			{#snippet child({ props })}
				<Input
					{...props}
					bind:ref={input}
					value={query}
					aria-activedescendant={highlightShown
						? (props["aria-activedescendant"] as string | undefined)
						: undefined}
					aria-controls={showResults
						? (listbox ?? panel)?.id || undefined
						: undefined}
					onkeydown={(event) =>
						handleFieldKey({
							event,
							forwardToList:
								props.onkeydown as KeyboardEventHandler<HTMLInputElement>,
						})}
					class="bg-popover-foreground text-background shadow-md"
				/>
			{/snippet}
		</Combobox.Input>
	</div>
	<Combobox.ContentStatic
		bind:ref={panel}
		class="absolute top-0 left-0 z-1000 size-full p-1"
		onpointermove={() => {
			highlightShown = false;
		}}
		onkeydown={(event) => {
			tabbingFromPanel = event.key === "Tab";
		}}
		onfocusout={closeWhenTabLeavesPanel}
		onEscapeKeydown={() => {
			if (panel?.contains(document.activeElement)) input?.focus();
		}}
	>
		{#snippet child({ props })}
			<div {...props} role={null}>
				<Combobox.Viewport
					class="flex flex-col rounded-md bg-popover-foreground px-1 py-3 text-popover shadow-md backdrop-filter-(--bd-panel)"
				>
					{#await places}
						<Spinner class="m-auto size-8" />
					{:then response}
						<div
							bind:this={listbox}
							id={resultsId}
							role="listbox"
							aria-label={t(
								"browse.locationChooser.a11y.results",
							)}
							class="flex flex-1 flex-col gap-2"
						>
							{#each response ?? [] as place, index (`${place.lat},${place.lon},${place.name}`)}
								<Combobox.Item
									value={String(index)}
									label={place.name}
									onpointerup={() => {
										pickedByPointer = true;
									}}
									class={cn(
										buttonVariants({ variant: "link" }),
										"flex h-auto cursor-pointer flex-col items-start justify-start gap-0 text-left text-current",
										{
											"data-highlighted:focus-ring data-highlighted:-outline-offset-2":
												highlightShown,
										},
									)}
								>
									<span
										class="line-clamp-1 block max-w-full truncate"
										translate="no"
									>
										{place.name}
									</span>
									<span
										class="line-clamp-1 block max-w-full truncate text-sm text-popover/40"
										translate="no"
									>
										{place.address}
									</span>
								</Combobox.Item>
							{/each}
						</div>
					{:catch error}
						<ApiErrorDisplay
							{error}
							buttonVariant="secondary"
							class="m-auto"
						/>
					{/await}
				</Combobox.Viewport>
			</div>
		{/snippet}
	</Combobox.ContentStatic>
</Combobox.Root>
