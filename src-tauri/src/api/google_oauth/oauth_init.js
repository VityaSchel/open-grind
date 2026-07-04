(() => {
	"use strict";

	const HELPER_ORIGIN = "https://web.grindr.com";
	const GOOGLE_ORIGIN = "https://accounts.google.com";
	const RESULT_URL = `${HELPER_ORIGIN}/__open_grind_oauth__`;

	const reportToRust = (query) => {
		try {
			location.replace(`${RESULT_URL}?${query}`);
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

	const captureTokenFromGoogleRelay = () => {
		let captured = false;
		const handle = (data) => {
			if (captured) return;
			const token = window.__grindrGis.extractAccessToken(data);
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
			window.__grindrOauthUi.setPhase("signing-in");
			const token = await window.__grindrGis.requestAccessToken();
			reportToken(token);
		} catch (error) {
			reportError(error?.message || error);
		}
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
		const button = window.__grindrOauthUi.mount();
		window.__grindrOauthUi.setPhase("ready");
		button?.addEventListener("click", requestToken);
	};

	maskRequestedWithHeader();
	if (location.origin === GOOGLE_ORIGIN) {
		captureTokenFromGoogleRelay();
	} else if (location.origin === HELPER_ORIGIN) {
		startGoogleSignIn();
	}
})();
