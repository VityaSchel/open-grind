<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { format, isSameYear } from "date-fns";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import {
		accountStatusState,
		dismissAccountStatus,
		showAccountRestriction,
		showAccountStatus,
	} from "$lib/api/account-status-state.svelte";
	import {
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
	import {
		ageVerificationArticleUrl,
		BAN_APPEAL_URL,
		bannedProfilesArticleUrl,
	} from "$lib/util/grindr-help";
	import {
		banOffersAppeal,
		banSubReasonLabel,
		timedBanOffersAppeal,
	} from "./ban-sub-reasons";

	type Content = {
		title: string;
		description: string;
		learnMoreHref?: string;
		appealHref?: string;
		verifyAgeHref?: string;
		details?: unknown;
		closeLabel: "Sign out" | "OK";
		signsOut: boolean;
	};

	const signOutEnding = { closeLabel: "Sign out", signsOut: true } as const;

	const status = $derived(accountStatusState.status);

	function withReason(sentence: string, reason: string | null | undefined) {
		return reason ? `${sentence} (${reason})` : sentence;
	}

	function formatEnd(endsAt: number) {
		return format(
			endsAt,
			isSameYear(endsAt, Date.now())
				? "MMM d, H:mm"
				: "MMM d, yyyy, H:mm",
		);
	}

	const content = $derived.by((): Content => {
		if (status?.kind === "banned") {
			const { info } = status;
			if (info.code === 31) {
				return {
					title: "Network blocked",
					description:
						"This network was blocked by Grindr. Switch it or turn off your VPN, then sign in again.",
					closeLabel: "OK",
					signsOut: true,
				};
			}
			if (info.code === 28) {
				return {
					title: "Security check failed",
					description:
						"Couldn't pass Grindr security check. Please sign out and try again.",
					details: info,
					...signOutEnding,
				};
			}
			if (info.code === 35) {
				return {
					title: "Age restricted",
					description:
						"Grindr requires your account to complete an age verification check. Please complete it in the official app, then sign in again.",
					verifyAgeHref: ageVerificationArticleUrl(),
					...signOutEnding,
				};
			}
			return {
				title: "Account banned",
				description: `${withReason("Grindr banned this account", banSubReasonLabel(info.subReason))}.`,
				learnMoreHref: bannedProfilesArticleUrl(),
				appealHref: banOffersAppeal(info.subReason)
					? BAN_APPEAL_URL
					: undefined,
				details: info,
				...signOutEnding,
			};
		}
		if (status?.kind === "restriction") {
			const { restriction } = status;
			if (restriction.kind === "ageVerification") {
				return {
					title: "Age verification required",
					description:
						"Grindr requires you to verify your age before continuing. Complete it in the official Grindr app, then sign in again. Open Grind does not bypass age verification.",
					...signOutEnding,
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
					appealHref: timedBanOffersAppeal(restriction.subReason)
						? BAN_APPEAL_URL
						: undefined,
					...signOutEnding,
				};
			}
			return {
				title: "Account restricted",
				description:
					"Your account is currently restricted and can't be used. Check the official Grindr app for details.",
				...signOutEnding,
			};
		}
		if (status?.kind === "phoneVerificationRequired") {
			return {
				title: "Phone verification required",
				description:
					"Verify your phone number in the official Grindr app, then sign in again.",
				details: status.error,
				closeLabel: "OK",
				signsOut: false,
			};
		}
		return { title: "", description: "", ...signOutEnding };
	});

	onMount(() => {
		const unlistenBanned = listen("auth:banned", (event) => {
			const parsed = banInfoSchema.safeParse(event.payload);
			if (!parsed.success) return;
			showAccountStatus({ kind: "banned", info: parsed.data });
		});
		const unlistenRestriction = listen("auth:restriction", (event) => {
			const parsed = restrictionSchema.safeParse(event.payload);
			if (!parsed.success) return;
			showAccountRestriction(parsed.data);
		});

		void callMethod("account_restriction")
			.then(showAccountRestriction)
			.catch(() => {});

		return () => {
			void unlistenBanned.then((fn) => fn());
			void unlistenRestriction.then((fn) => fn());
		};
	});

	let signingOut = $state(false);

	const dismissible = $derived(!content.signsOut && !signingOut);

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

	async function close() {
		if (!content.signsOut) {
			dismissAccountStatus();
			return;
		}
		signingOut = true;
		try {
			await signOut();
		} finally {
			signingOut = false;
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
		escapeKeydownBehavior={dismissible ? "close" : "ignore"}
		interactOutsideBehavior="ignore"
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
			<fieldset disabled={signingOut} class="contents">
				{#if content.details !== undefined}
					<Button variant="ghost" onclick={copyDetails}>
						Copy details
					</Button>
				{/if}
				{#if content.appealHref}
					<Link
						href={content.appealHref}
						class={buttonVariants({ variant: "outline" })}
					>
						Appeal <ArrowUpRightIcon />
					</Link>
				{/if}
				{#if content.verifyAgeHref}
					<Link
						href={content.verifyAgeHref}
						class={buttonVariants({ variant: "outline" })}
					>
						Verify age <ArrowUpRightIcon />
					</Link>
				{/if}
				<Button onclick={close} aria-busy={signingOut}>
					{#if signingOut}
						<Spinner aria-hidden="true" />
					{/if}
					{content.closeLabel}
				</Button>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
