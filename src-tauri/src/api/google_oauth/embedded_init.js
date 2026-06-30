// Injected into the EmbeddedSetup webview at document start (Android; see
// embedded.rs). Provides the `window.mm` bridge the page expects, plus a top bar
// (Cancel button + status-bar inset) and back-gesture handling — the bare webview
// has no chrome, so otherwise the page sits under the status bar with no way out.
//
// Insets and the back gesture come from MainActivity.kt, which exposes
// `window.__AndroidInsets` / `window.__reapplyInsets` and routes the system back
// button through `window.__AndroidOnBackGesture`. `__ANDROID_ID__` is substituted
// by embedded.rs.

(() => {
	"use strict";

	// Tauri injects this into every frame. Only operate in the top EmbeddedSetup
	// document — not in Google's reCAPTCHA / bscframe sub-iframes, where injecting
	// our bar + body padding breaks the captcha widget's rendering.
	if (window.top !== window.self) return;

	const ANDROID_ID = "__ANDROID_ID__";
	const CANCEL_URL = "https://accounts.google.com/__open_grind_cancel__";

	const bridgeValue = (name) => {
		switch (name) {
			case "getAndroidId":
				return ANDROID_ID;
			case "getBuildVersionSdk":
				return "34";
			case "getPlayServicesVersionCode":
				return "240913000";
			case "getAllowedDomains":
				return "[]";
			case "getDeviceDataVersionInfo":
				return "";
			case "getAccountManagementType":
				return "0";
			case "isUserOwner":
				return true;
			case "hasTelephony":
				return false;
			default:
				return "";
		}
	};

	try {
		window.mm = new Proxy(
			{},
			{
				get: (_target, prop) => {
					if (typeof prop !== "string") return undefined;
					// We can't compute a real DroidGuard token. The page dims and waits
					// ~30s for window.setDgResult(); reply immediately with an empty
					// result so it proceeds without the stall (the timeout fallback also
					// proceeds without DroidGuard — this just skips the wait).
					if (prop === "getDroidGuardResult") {
						return () => {
							setTimeout(() => {
								try {
									window.setDgResult("");
								} catch {}
							}, 0);
							return "";
						};
					}
					return () => bridgeValue(prop);
				},
			},
		);
	} catch {}

	const topInset = () => {
		try {
			const value = window.__AndroidInsets?.top();
			if (typeof value === "number" && value > 0) return value;
		} catch {}
		return 0;
	};

	const applyInset = () => {
		const root = document.documentElement.style;
		root.setProperty("--og-inset-top", `${topInset()}px`);
	};
	// MainActivity calls this whenever the system insets change.
	window.__reapplyInsets = applyInset;

	const installChrome = () => {
		if (!document.getElementById("og-chrome-style")) {
			const style = document.createElement("style");
			style.id = "og-chrome-style";
			style.textContent = `
				body { padding-top: calc(var(--og-inset-top, 0px) + 48px) !important; }
				#og-chrome {
					position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
					box-sizing: border-box;
					height: calc(var(--og-inset-top, 0px) + 48px);
					padding-top: var(--og-inset-top, 0px);
					display: flex; align-items: center; gap: 4px;
					background: #fff; border-bottom: 1px solid #dadce0;
					color: #1a73e8; font: 500 15px system-ui, -apple-system, sans-serif;
				}
				#og-chrome button {
					appearance: none; border: 0; background: transparent; color: inherit;
					font-size: 20px; line-height: 1; padding: 10px 14px;
				}`;
			(document.head || document.documentElement).appendChild(style);
		}

		if (!document.getElementById("og-chrome")) {
			const bar = document.createElement("div");
			bar.id = "og-chrome";
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.textContent = "✕";
			cancel.setAttribute("aria-label", "Cancel");
			cancel.addEventListener("click", () => {
				location.href = CANCEL_URL;
			});
			const label = document.createElement("span");
			label.textContent = "Sign in with Google";
			bar.append(cancel, label);
			document.documentElement.appendChild(bar);
		}

		applyInset();
	};

	// System back navigates within the Google flow (e.g. password -> email);
	// returning false keeps the app open. Leaving the flow entirely is the Cancel
	// button's job.
	window.__AndroidOnBackGesture = () => {
		try {
			window.history.back();
		} catch {}
		return false;
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", installChrome);
	} else {
		installChrome();
	}
	// Re-assert after the page swaps out its DOM mid-flow.
	setTimeout(installChrome, 600);
	setTimeout(installChrome, 1800);
})();
