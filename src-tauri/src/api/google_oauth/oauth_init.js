(config) => {
	"use strict";

	const gis = window.__grindrGis;
	const ui = window.__grindrOauthUi;

	const HELPER_ORIGIN = "https://web.grindr.com";
	const GOOGLE_ORIGIN = "https://accounts.google.com";
	const RESULT_URL = `${HELPER_ORIGIN}/__open_grind_oauth__`;

	const reportToRust = (query) => {
		try {
			location.replace(
				`${RESULT_URL}?nonce=${encodeURIComponent(config.nonce)}&${query}`,
			);
		} catch {}
	};
	const reportToken = (token) =>
		reportToRust(`token=${encodeURIComponent(token)}`);
	const reportError = (message) =>
		reportToRust(`error=${encodeURIComponent(String(message))}`);

	const maskRequestedWithHeader = () => {
		const HEADER = "X-Requested-With";
		try {
			const open = XMLHttpRequest.prototype.open;
			XMLHttpRequest.prototype.open = function (...args) {
				const result = open.apply(this, args);
				try {
					this.setRequestHeader(HEADER, "");
				} catch {}
				return result;
			};
		} catch {}
		try {
			const nativeFetch = window.fetch;
			if (nativeFetch) {
				window.fetch = function (input, init) {
					try {
						const headers = new Headers();
						if (input && typeof input === "object" && input.headers) {
							input.headers.forEach((value, key) => headers.set(key, value));
						}
						if (init?.headers) {
							new Headers(init.headers).forEach((value, key) =>
								headers.set(key, value),
							);
						}
						headers.set(HEADER, "");
						init = { ...init, headers };
					} catch {}
					return nativeFetch.call(this, input, init);
				};
			}
		} catch {}
	};

	const matchAccessTokenInString = (text) => {
		const match = /access_token["'\s]*[=:]\s*["']?([^"'&\s\\)}\]]+)/i.exec(
			text,
		);
		return match ? decodeURIComponent(match[1]) : null;
	};

	const extractAccessToken = (data) => {
		let found = null;
		const walk = (value, depth) => {
			if (found || value == null || depth > 6) return;
			if (typeof value === "string") {
				if (!value.includes("access_token")) return;
				found = matchAccessTokenInString(value);
				if (found) return;
				try {
					walk(JSON.parse(value), depth + 1);
				} catch {}
				return;
			}
			if (typeof value === "object") {
				if (typeof value.access_token === "string") {
					found = value.access_token;
					return;
				}
				for (const key of Object.keys(value)) {
					walk(value[key], depth + 1);
					if (found) return;
				}
			}
		};

		if (typeof data === "string") {
			const direct = matchAccessTokenInString(data);
			if (direct) return direct;
			try {
				walk(JSON.parse(data), 0);
			} catch {
				walk(data, 0);
			}
		} else {
			walk(data, 0);
		}
		return found;
	};

	const captureTokenFromGoogleRelay = () => {
		let captured = false;
		const handle = (data) => {
			if (captured) return;
			const token = extractAccessToken(data);
			if (token) {
				captured = true;
				reportToken(token);
			}
		};

		const openerStub = {
			closed: false,
			focus: () => {},
			blur: () => {},
			close() {
				this.closed = true;
			},
			postMessage: (data) => handle(data),
		};

		try {
			window.opener = openerStub;
		} catch {}
		if (window.opener !== openerStub) {
			try {
				Object.defineProperty(window, "opener", {
					configurable: true,
					get: () => openerStub,
					set: () => {},
				});
			} catch {}
		}

		try {
			window.addEventListener(
				"message",
				(event) => {
					if (event.origin !== GOOGLE_ORIGIN) return;
					handle(event.data);
				},
				true,
			);
		} catch {}
	};

	let navigated = false;
	const navigateTop = (url) => {
		if (navigated || !url) return;
		url = String(url);
		if (!url || url === "about:blank") return;
		navigated = true;
		try {
			location.assign(url);
		} catch (error) {
			reportError(error);
		}
	};

	const installPopupPolyfill = () => {
		window.open = (url) => {
			navigateTop(url);
			const fakeLocation = { assign: navigateTop, replace: navigateTop };
			try {
				Object.defineProperty(fakeLocation, "href", {
					get: () => "",
					set: navigateTop,
				});
			} catch {}
			return {
				closed: false,
				focus: () => {},
				blur: () => {},
				close: () => {},
				postMessage: () => {},
				get location() {
					return fakeLocation;
				},
				set location(value) {
					navigateTop(value);
				},
			};
		};
	};

	const requestToken = async () => {
		try {
			ui.setPhase("signing-in");
			const token = await gis.requestAccessToken();
			reportToken(token);
		} catch (error) {
			reportError(error?.message || error);
		}
	};

	const injectStyles = () => {
		try {
			if (!config.css) return;
			const style = document.createElement("style");
			style.textContent = config.css;
			(document.head || document.documentElement).appendChild(style);
		} catch {}
	};

	const startGoogleSignIn = () => {
		try {
			window.stop();
		} catch {}
		installPopupPolyfill();
		try {
			document.documentElement.innerHTML =
				'<head><meta charset="utf-8" />' +
				'<meta name="viewport" content="width=device-width,initial-scale=1" />' +
				"<title>Sign in with Google</title></head><body></body>";
		} catch {}
		injectStyles();
		ui.mount();
		ui.setPhase("ready");
		const button = document.querySelector(".grindr-oauth-button");
		button?.addEventListener("click", requestToken);
	};

	maskRequestedWithHeader();
	if (location.origin === GOOGLE_ORIGIN) {
		captureTokenFromGoogleRelay();
	} else if (location.origin === HELPER_ORIGIN) {
		if (document.documentElement) {
			startGoogleSignIn();
		} else {
			// WebView2 runs this before the document is parsed, WebKit after
			// <html> exists: https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2#addscripttoexecuteondocumentcreated
			const observer = new MutationObserver(() => {
				if (!document.documentElement) return;
				observer.disconnect();
				startGoogleSignIn();
			});
			observer.observe(document, { childList: true });
		}
	}
}
