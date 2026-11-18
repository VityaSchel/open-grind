<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
	import DownloadSimpleIcon from "phosphor-svelte/lib/DownloadSimpleIcon";
	import FileArrowDownIcon from "phosphor-svelte/lib/FileArrowDownIcon";
	import KeyIcon from "phosphor-svelte/lib/KeyIcon";
	import ShareNetworkIcon from "phosphor-svelte/lib/ShareNetworkIcon";
	import { tick, untrack } from "svelte";
	import { prefersReducedMotion } from "svelte/motion";
	import { fade } from "svelte/transition";
	import type { Attachment } from "svelte/attachments";

	import { anchorToastsAbove } from "#lib/components/feedback/toast-anchor.ts";
	import PageIndicator from "#lib/components/shared/PageIndicator.svelte";
	import ScreenChromeCover from "#lib/components/shared/ScreenChromeCover.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Drawer from "#lib/components/ui/drawer/index.ts";
	import * as ResponsiveDialog from "#lib/components/ui/responsive-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { formatInteger } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		cancelRelaySetupFlow,
		closeFastModeConfig,
		confirmRelayConfigSaved,
		finishRelaySetup,
		saveRelayConfigFile,
		shareRelayConfigFile,
	} from "#lib/push/delivery.svelte.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import FastModeSourceOptions from "./FastModeSourceOptions.svelte";
	import RelaySetupScreen from "./RelaySetupScreen.svelte";
	import RelayVerificationCode from "./RelayVerificationCode.svelte";

	type Screen = "sources" | "config" | "waiting" | "verify" | "connected";

	type ConfigExport = "save" | "share";

	let { onCloseAutoFocus }: { onCloseAutoFocus: (event: Event) => void } =
		$props();

	const SCREEN_FADE_MS = 150;
	const GROW_MS = 300;
	const GROW_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
	const TOAST_GAP_PX = 12;
	const SETUP_STEPS = 3;
	const STEP_INDEX = {
		config: 0,
		waiting: 1,
		verify: 2,
		connected: 2,
	} as const satisfies Record<Exclude<Screen, "sources">, number>;

	const enterCodeId = $props.id();

	let exporting = $state<ConfigExport | null>(null);
	let sourceOptions = $state<ReturnType<typeof FastModeSourceOptions> | null>(
		null,
	);
	let verificationCode = $state<ReturnType<
		typeof RelayVerificationCode
	> | null>(null);
	let saveButton = $state<HTMLButtonElement | null>(null);
	let cancelButton = $state<HTMLButtonElement | null>(null);
	let continueButton = $state<HTMLButtonElement | null>(null);
	let focusedScreen: Screen | null = null;
	let surface: HTMLElement | null = null;

	const screen = $derived<Screen>(
		notificationSettings.relayStep ?? "sources",
	);
	const expanded = $derived(screen !== "sources");
	const step = $derived(
		screen === "sources" ? undefined : STEP_INDEX[screen],
	);
	const locked = $derived(
		exporting !== null || notificationSettings.committing,
	);

	$effect(() => {
		if (!notificationSettings.configDialogOpen) {
			focusedScreen = null;
			return;
		}
		const returning = focusedScreen !== null && focusedScreen !== "sources";
		focusedScreen = screen;
		void tick().then(() => focusScreen({ returning }));
	});

	$effect(() => {
		if (notificationSettings.configDialogOpen)
			return anchorToastsAbove(toastEdge);
	});

	export function focusAddonOption(): void {
		sourceOptions?.focusSetup("addon");
	}

	const followSurface: Attachment<HTMLElement> = (node) => {
		surface = node.closest<HTMLElement>('[role="dialog"]');
		return () => {
			surface = null;
		};
	};

	const growWithSetup: Attachment<HTMLElement> = (node) => {
		const drawer = node.closest<HTMLElement>(
			'[data-slot="drawer-content"]',
		);
		if (drawer === null) return;
		let height = drawer.offsetHeight;
		let wasExpanded = untrack(() => expanded);
		const resizes = new ResizeObserver(() => {
			const next = drawer.offsetHeight;
			const nowExpanded = expanded;
			if (
				nowExpanded !== wasExpanded &&
				next !== height &&
				!prefersReducedMotion.current
			)
				drawer.animate(
					[
						{ height: `${height}px`, easing: GROW_EASING },
						{ height: `${next}px` },
					],
					{ duration: GROW_MS },
				);
			wasExpanded = nowExpanded;
			height = next;
		});
		resizes.observe(drawer);
		return () => resizes.disconnect();
	};

	function toastEdge(): number | null {
		if (surface?.dataset.slot !== "drawer-content") return null;
		if (!expanded) return surfaceTop(surface) - TOAST_GAP_PX;
		const buttons = surface.querySelectorAll<HTMLElement>(
			'[data-slot="drawer-footer"] button',
		);
		if (buttons.length === 0) return null;
		const top = Math.min(
			...[...buttons].map((button) => button.getBoundingClientRect().top),
		);
		return top - TOAST_GAP_PX;
	}

	function surfaceTop(drawer: HTMLElement): number {
		const inset = Number.parseFloat(
			getComputedStyle(drawer, "::before").top,
		);
		return (
			drawer.getBoundingClientRect().top +
			(Number.isNaN(inset) ? 0 : inset)
		);
	}

	function focusSources(): void {
		if (!sourceOptions?.focusFirstSetup()) surface?.focus();
	}

	function focusScreen({ returning }: { returning: boolean }): void {
		if (!notificationSettings.configDialogOpen) return;
		switch (screen) {
			case "sources":
				if (returning) sourceOptions?.focusSetup("relay");
				else focusSources();
				return;
			case "config":
				saveButton?.focus();
				return;
			case "waiting":
				cancelButton?.focus();
				return;
			case "verify":
				verificationCode?.focus();
				return;
			case "connected":
				continueButton?.focus();
				return;
		}
	}

	function keepFocusForScreen(event: Event): void {
		event.preventDefault();
	}

	async function exportConfig(kind: ConfigExport): Promise<void> {
		exporting = kind;
		try {
			if (kind === "save") await saveRelayConfigFile();
			else await shareRelayConfigFile();
		} finally {
			exporting = null;
		}
	}
</script>

{#snippet cancelRelaySetupButton()}
	<Button
		bind:ref={cancelButton}
		variant="outline"
		size="lg"
		onclick={() => void cancelRelaySetupFlow()}
	>
		{t("common.actions.cancel")}
	</Button>
{/snippet}

<ResponsiveDialog.Root
	bind:open={
		() => notificationSettings.configDialogOpen,
		(next) => {
			if (!next) void closeFastModeConfig();
		}
	}
	dismissible={!expanded}
	repositionInputs={false}
>
	{#snippet children({ desktop })}
		<ResponsiveDialog.Content
			class="flex flex-col"
			drawerClass={[
				"mx-auto max-w-160",
				{ "h-(--screen-safe)": expanded },
			]}
			dialogClass={["gap-4", { "min-h-128": expanded }]}
			dialogProps={{
				onOpenAutoFocus: keepFocusForScreen,
				onCloseAutoFocus,
			}}
			drawerProps={{
				handle: null,
				onOpenAutoFocus: keepFocusForScreen,
				onCloseAutoFocus,
			}}
		>
			<ScreenChromeCover />
			{#if !expanded && !desktop}
				<Drawer.Handle />
			{/if}
			<ResponsiveDialog.Header drawerClass="pb-2">
				{#if step !== undefined}
					<PageIndicator
						count={SETUP_STEPS}
						position={step}
						orientation="horizontal"
						tone="accent"
						shape="pill"
						label={t(
							"settings.notifications.fastConfig.relaySetup.a11y.step",
							{
								current: formatInteger(step + 1),
								total: formatInteger(SETUP_STEPS),
							},
						)}
						class="mx-auto"
					/>
				{:else}
					<ResponsiveDialog.Title>
						{t("settings.notifications.fastConfig.title")}
					</ResponsiveDialog.Title>
				{/if}
			</ResponsiveDialog.Header>
			<div
				role="status"
				class="sr-only"
				{@attach followSurface}
				{@attach growWithSetup}
			>
				{#if screen === "waiting"}
					{t("settings.notifications.fastConfig.relaySetup.waiting")}
					{t(
						"settings.notifications.fastConfig.relaySetup.waitingHint",
					)}
				{/if}
			</div>
			{#key screen}
				<div
					data-slot="fast-mode-config-screen"
					class={[
						"flex min-h-0 flex-1 flex-col",
						{ "gap-6": desktop },
					]}
					in:fade={{ duration: SCREEN_FADE_MS }}
				>
					{#if screen === "sources"}
						<ResponsiveDialog.Body drawerClass="px-4 pt-2 pb-4">
							<FastModeSourceOptions
								bind:this={sourceOptions}
								onSetupGone={focusSources}
							/>
						</ResponsiveDialog.Body>
					{:else}
						<ResponsiveDialog.Body
							class="flex flex-1 flex-col"
							drawerClass="px-4"
						>
							{#if screen === "config"}
								<RelaySetupScreen>
									{#snippet icon()}
										<FileArrowDownIcon
											weight="fill"
											class="size-10"
											aria-hidden="true"
										/>
									{/snippet}
									{#snippet title()}
										{t(
											"settings.notifications.fastConfig.relaySetup.saveConfigTitle",
										)}
									{/snippet}
									{#snippet description()}
										{t(
											"settings.notifications.fastConfig.relaySetup.saveConfig",
											{
												button: t(
													"common.actions.continue",
												),
											},
										)}
									{/snippet}
									<fieldset
										disabled={locked}
										class="mt-8 grid w-full max-w-xs grid-cols-2 gap-2.5"
									>
										<Button
											bind:ref={saveButton}
											variant="secondary"
											size="lg"
											aria-busy={exporting === "save"}
											onclick={() =>
												void exportConfig("save")}
										>
											{#if exporting === "save"}
												<Spinner aria-hidden="true" />
											{:else}
												<DownloadSimpleIcon
													aria-hidden="true"
												/>
											{/if}
											{t("common.actions.save")}
										</Button>
										<Button
											variant="secondary"
											size="lg"
											aria-busy={exporting === "share"}
											onclick={() =>
												void exportConfig("share")}
										>
											{#if exporting === "share"}
												<Spinner aria-hidden="true" />
											{:else}
												<ShareNetworkIcon
													aria-hidden="true"
												/>
											{/if}
											{t("common.actions.share")}
										</Button>
									</fieldset>
								</RelaySetupScreen>
							{:else if screen === "waiting"}
								<RelaySetupScreen>
									{#snippet icon()}
										<Spinner
											aria-hidden="true"
											class="size-10"
										/>
									{/snippet}
									{#snippet title()}
										{t(
											"settings.notifications.fastConfig.relaySetup.waiting",
										)}
									{/snippet}
									{#snippet description()}
										{t(
											"settings.notifications.fastConfig.relaySetup.waitingHint",
										)}
									{/snippet}
								</RelaySetupScreen>
							{:else if screen === "verify"}
								<RelaySetupScreen>
									{#snippet icon()}
										{#if notificationSettings.committing}
											<Spinner
												aria-hidden="true"
												class="size-10"
											/>
										{:else}
											<KeyIcon
												weight="fill"
												class="size-10"
												aria-hidden="true"
											/>
										{/if}
									{/snippet}
									{#snippet title()}
										<span id={enterCodeId}>
											{t(
												"settings.notifications.fastConfig.relaySetup.enterCode",
											)}
										</span>
									{/snippet}
									{#snippet description()}
										{t(
											"settings.notifications.fastConfig.relaySetup.findCode",
										)}
									{/snippet}
									<div class="mt-8 self-stretch">
										<RelayVerificationCode
											bind:this={verificationCode}
											labelledBy={enterCodeId}
										/>
									</div>
								</RelaySetupScreen>
							{:else if screen === "connected"}
								<RelaySetupScreen success>
									{#snippet icon()}
										<CheckCircleIcon
											weight="fill"
											class="size-10"
											aria-hidden="true"
										/>
									{/snippet}
									{#snippet title()}
										{t(
											"settings.notifications.fastConfig.relaySetup.connected",
										)}
									{/snippet}
									{#snippet description()}
										{t(
											"settings.notifications.fastConfig.relaySetup.connectedHint",
										)}
									{/snippet}
								</RelaySetupScreen>
							{/if}
						</ResponsiveDialog.Body>
						<ResponsiveDialog.Footer drawerClass="flex-col-reverse">
							{#if screen === "config"}
								<fieldset disabled={locked} class="contents">
									{@render cancelRelaySetupButton()}
									<Button
										size="lg"
										onclick={confirmRelayConfigSaved}
									>
										{t("common.actions.continue")}
									</Button>
								</fieldset>
							{:else if screen === "waiting"}
								{@render cancelRelaySetupButton()}
							{:else if screen === "verify"}
								<fieldset disabled={locked} class="contents">
									{@render cancelRelaySetupButton()}
								</fieldset>
							{:else if screen === "connected"}
								<Button
									bind:ref={continueButton}
									size="lg"
									onclick={finishRelaySetup}
								>
									{t("common.actions.continue")}
								</Button>
							{/if}
						</ResponsiveDialog.Footer>
					{/if}
				</div>
			{/key}
		</ResponsiveDialog.Content>
	{/snippet}
</ResponsiveDialog.Root>
