// Injected into the OAuth webview at document start (see web.rs)

(() => {
	"use strict";

	const HELPER_ORIGIN = "https://web.grindr.com";
	const GOOGLE_ORIGIN = "https://accounts.google.com";
	const RESULT_URL = `${HELPER_ORIGIN}/__open_grind_oauth__`;
	const CLIENT_ID =
		"1036042917246-htcnf9mm3qnis86l47ngp0a9ncqsll7j.apps.googleusercontent.com";

	const reportToRust = (query) => {
		try {
			location.replace(`${RESULT_URL}?${query}`);
		} catch {}
	};
	const reportToken = (token) =>
		reportToRust(`token=${encodeURIComponent(token)}`);
	const reportError = (message) =>
		reportToRust(`error=${encodeURIComponent(String(message))}`);

	// GIS relays the token in varying shapes (raw string, JSON, nested object).
	const extractAccessToken = (data) => {
		const fromString = (text) => {
			const match = /access_token["'\s]*[=:]\s*["']?([^"'&\s\\)}\]]+)/i.exec(text);
			return match ? decodeURIComponent(match[1]) : null;
		};

		let found = null;
		const walk = (value, depth) => {
			if (found || value == null || depth > 6) return;
			if (typeof value === "string") {
				if (!value.includes("access_token")) return;
				found = fromString(value);
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
			const direct = fromString(data);
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

	// Android WebView adds `X-Requested-With`, which marks the page as an embedded
	// app webview to Google; blank it on every XHR/fetch.
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

	// On accounts.google.com: GIS posts the token to `window.opener`
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
			window.addEventListener("message", (event) => handle(event.data), true);
		} catch {}
	};

	const renderShell = (innerHtml) => {
		try {
			document.documentElement.innerHTML = `
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width,initial-scale=1" />
					<title>Sign in with Google</title>
				</head>
				<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1e1e1e;color:#ddd;font:14px -apple-system,system-ui,sans-serif">
					${innerHtml}
				</body>`;
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

	const loadGisSdk = async () => {
		const ready = () => window.google?.accounts?.oauth2;
		if (ready()) return;
		await new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "https://accounts.google.com/gsi/client";
			script.async = true;
			script.onload = resolve;
			script.onerror = () => reject(new Error("GIS SDK failed to load"));
			(document.head || document.documentElement).appendChild(script);
		});
		for (let attempt = 0; attempt < 100; attempt++) {
			if (ready()) return;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new Error("GIS SDK initialize failed");
	};

	const requestToken = async () => {
		try {
			renderShell("<div>Connecting to Google...</div>");
			await loadGisSdk();
			const tokenClient = window.google.accounts.oauth2.initTokenClient({
				client_id: CLIENT_ID,
				scope: "email profile",
				callback: (response) => {
					if (response?.access_token) reportToken(response.access_token);
				},
				error_callback: (error) =>
					reportError(`token client error: ${JSON.stringify(error || {})}`),
			});
			tokenClient.requestAccessToken({ prompt: "select_account" });
		} catch (error) {
			reportError(error?.message || error);
		}
	};

	// Put the flow behind a tap so GIS has the user gesture it
	// needs, then start the token request.
	const startGoogleSignIn = () => {
		try {
			window.stop();
		} catch {}
		installPopupPolyfill();
		renderShell(`
			<div style="max-width:92%;text-align:center">
				<p style="font-size:16px;margin:0 0 16px">Sign in with Google</p>
				<button id="og-continue" style="appearance:none;border:0;border-radius:8px;padding:12px 22px;font-size:15px;background:#3b82f6;color:#fff">
					Continue
				</button>
			</div>`);
		document.getElementById("og-continue")?.addEventListener("click", requestToken);
	};

	maskRequestedWithHeader();
	if (location.origin === GOOGLE_ORIGIN) {
		captureTokenFromGoogleRelay();
	} else if (location.origin === HELPER_ORIGIN) {
		startGoogleSignIn();
	}
})();
