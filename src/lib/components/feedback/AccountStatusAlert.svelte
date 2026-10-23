<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { format, isSameYear } from "date-fns";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import {
		accountStatusState,
		dismissAccountStatus,
		noticeAccountStatusError,
		showAccountRestriction,
		showAccountStatus,
	} from "$lib/api/account-status-state.svelte";
	import {
		asAccountStatusError,
		banInfoSchema,
		callMethod,
		restrictionSchema,
	} from "$lib/api/methods";
	import { signOut } from "$lib/api/sign-out";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { updatesSelfManaged } from "$lib/updates/capability.svelte";
	import { checkForUpdatesNow } from "$lib/updates/update-checks";
	import { now } from "$lib/util/clock";
	import { BAN_APPEAL_URL, grindrHelpUrl } from "$lib/util/grindr-help";
	import {
		banOffersAppeal,
		banSubReasonLabel,
		timedBanOffersAppeal,
	} from "./ban-sub-reasons";

	type ExternalAction = { label: string; href: string };

	type Content = {
		title: string;
		description: string;
		learnMoreHref?: string;
		externalAction?: ExternalAction;
		details?: unknown;
		closeLabel?: string;
		checksForUpdates?: boolean;
	};

	const DOWNLOAD_PAGE_URL = "https://opengrind.org/guides/download";

	const appeal: ExternalAction = { label: "Appeal", href: BAN_APPEAL_URL };

	const status = $derived(accountStatusState.status);

	const signsOut = $derived(
		status?.kind === "banned" || status?.kind === "restriction",
	);

	function withReason(sentence: string, reason: string | null) {
		return reason ? `${sentence} (${reason})` : sentence;
	}

	function formatEnd(endsAt: number) {
		return format(
			endsAt,
			isSameYear(endsAt, now()) ? "MMM d, H:mm" : "MMM d, yyyy, H:mm",
		);
	}

	const content = $derived.by((): Content => {
		if (status?.kind === "banned") {
			const { info } = status;
			if (info.kind === "network") {
				return {
					title: "Network blocked",
					description:
						"This network was blocked by Grindr. Switch it or turn off your VPN, then sign in again.",
					closeLabel: "OK",
				};
			}
			if (info.kind === "device") {
				return {
					title: "Security check failed",
					description:
						"Couldn't pass Grindr security check. Please sign out and try again.",
					details: info,
				};
			}
			if (info.kind === "underage" && info.code === 35) {
				return {
					title: "Age restricted",
					description:
						"Grindr requires your account to complete an age verification check. Please complete it in the official app, then sign in again.",
					externalAction: {
						label: "Verify age",
						href: grindrHelpUrl("ageVerification"),
					},
				};
			}
			return {
				title: "Account banned",
				description: `${withReason("Grindr banned this account", banSubReasonLabel(info.subReason))}.`,
				learnMoreHref: grindrHelpUrl("bannedProfiles"),
				externalAction: banOffersAppeal(info.subReason)
					? appeal
					: undefined,
				details: info,
			};
		}
		if (status?.kind === "restriction") {
			const { restriction } = status;
			if (restriction.kind === "ageVerification") {
				return {
					title: "Age verification required",
					description:
						"Grindr requires you to verify your age before continuing. Complete it in the official Grindr app, then sign in again. Open Grind does not bypass age verification.",
				};
			}
			if (restriction.kind === "timedBan") {
				const sentence = withReason(
					"Grindr suspended this account",
					banSubReasonLabel(restriction.subReason),
				);
				return {
					title: "Account suspended",
					description: restriction.endsAt
						? `${sentence} until ${formatEnd(restriction.endsAt)}.`
						: `${sentence}.`,
					externalAction: timedBanOffersAppeal(restriction.subReason)
						? appeal
						: undefined,
				};
			}
			return {
				title: "Account restricted",
				description:
					"Your account is currently restricted and can't be used. Check the official Grindr app for details.",
			};
		}
		if (status?.kind === "unsupportedVersion") {
			return {
				title: "Update Open Grind",
				description:
					"Grindr no longer supports this version of Open Grind.",
				details: status.error,
				checksForUpdates: true,
			};
		}
		if (status?.kind === "phoneVerificationRequired") {
			return {
				title: "Phone verification required",
				description:
					"Verify your phone number in the official Grindr app, then sign in again.",
				details: status.error,
				closeLabel: "OK",
			};
		}
		return { title: "", description: "" };
	});

	const closeLabel = $derived(
		content.closeLabel ?? (signsOut ? "Sign out" : undefined),
	);

	onMount(() => {
		const unlisteners = [
			listen("auth:banned", (event) => {
				const parsed = banInfoSchema.safeParse(event.payload);
				if (!parsed.success) return;
				showAccountStatus({ kind: "banned", info: parsed.data });
			}),
			listen("auth:restriction", (event) => {
				const parsed = restrictionSchema.safeParse(event.payload);
				if (!parsed.success) return;
				showAccountRestriction(parsed.data);
			}),
			listen("auth:unsupported-version", (event) => {
				const error = asAccountStatusError(event.payload);
				if (error) noticeAccountStatusError(error);
			}),
		];

		void callMethod("account_restriction")
			.then(showAccountRestriction)
			.catch(() => {});

		return () => {
			for (const unlisten of unlisteners) {
				void unlisten.then((fn) => fn());
			}
		};
	});

	let running: false | "signOut" | "checkForUpdates" = $state(false);

	const dismissible = $derived(!signsOut && running === false);

	const dismissBehavior = $derived(dismissible ? "close" : "ignore");

	dismissOnBackGesture({
		active: () => accountStatusState.open,
		dismiss: () => {
			if (dismissible) dismissAccountStatus();
		},
	});

	async function copyDetails() {
		try {
			const clipboard =
				await import("@tauri-apps/plugin-clipboard-manager");
			await clipboard.writeText(JSON.stringify(content.details, null, 2));
			toast.success("Details copied to clipboard");
		} catch (error) {
			console.error(error);
		}
	}

	async function checkForUpdates() {
		running = "checkForUpdates";
		try {
			await checkForUpdatesNow({
				selfManaged: true,
				addonAvailable: false,
			});
		} finally {
			running = false;
		}
	}

	async function close() {
		if (!signsOut) {
			dismissAccountStatus();
			return;
		}
		running = "signOut";
		try {
			await signOut();
		} finally {
			running = false;
			accountStatusState.open = false;
		}
	}
</script>

<AlertDialog.Root
	bind:open={
		() => accountStatusState.open,
		(next) => {
			if (!next && dismissible) dismissAccountStatus();
		}
	}
>
	<AlertDialog.Content
		escapeKeydownBehavior={dismissBehavior}
		interactOutsideBehavior={dismissBehavior}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>{content.title}</AlertDialog.Title>
			<AlertDialog.Description>
				{content.description}
				{#if content.learnMoreHref}
					<Link href={content.learnMoreHref} class="underline">
						Learn more
					</Link>
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={running !== false} class="contents">
				{#if content.details !== undefined}
					<Button variant="ghost" onclick={copyDetails}>
						Copy details
					</Button>
				{/if}
				{#if content.externalAction}
					<Link
						href={content.externalAction.href}
						class={buttonVariants({ variant: "outline" })}
					>
						{content.externalAction.label}
						<ArrowUpRightIcon />
					</Link>
				{/if}
				{#if content.checksForUpdates}
					{#if updatesSelfManaged()}
						<Button
							onclick={checkForUpdates}
							aria-busy={running === "checkForUpdates"}
						>
							{#if running === "checkForUpdates"}
								<Spinner aria-hidden="true" />
							{/if}
							Check for updates
						</Button>
					{:else}
						<Link href={DOWNLOAD_PAGE_URL} class={buttonVariants()}>
							Check for updates <ArrowUpRightIcon />
						</Link>
					{/if}
				{/if}
				{#if closeLabel}
					<Button onclick={close} aria-busy={running === "signOut"}>
						{#if running === "signOut"}
							<Spinner aria-hidden="true" />
						{/if}
						{closeLabel}
					</Button>
				{/if}
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
