use std::ops::Range;

use super::{
	CONTRACT, FCM_REQUEST, NOTIFIER, PLUGIN, POLL, POLL_SERVICE, SCHEDULE,
};
use crate::pin_support::{braced_range, is_identifier, spaced_match, squashed};

const PLUGIN_FILE: &str = "PushPlugin.kt";

fn gated_bodies(source: &str) -> Vec<Range<usize>> {
	let mut bodies = Vec::new();
	let mut from = 0;
	while let Some(found) = spaced_match(&source[from..], "gated(invoke) {") {
		let start = from + found.start;
		let body = braced_range(&source[start..], PLUGIN_FILE, "gated(invoke)");
		bodies.push(start + body.start..start + body.end);
		from += found.end;
	}
	bodies
}

fn enclosing_function(source: &str, at: usize) -> &str {
	let name = source[..at]
		.rfind("fun ")
		.map(|declared| source[declared + "fun ".len()..].trim_start())
		.unwrap_or_else(|| {
			panic!("{PLUGIN_FILE} binds the FCM add-on outside any function")
		});
	&name[..name
		.find(|character| !is_identifier(character))
		.unwrap_or(name.len())]
}

fn calls(source: &str, function: &str) -> Vec<usize> {
	source
		.match_indices(&format!("{function}("))
		.map(|(at, _)| at)
		.filter(|&at| {
			!source[..at].ends_with(is_identifier)
				&& !source[..at].trim_end().ends_with("fun")
		})
		.collect()
}

fn bound_behind_gate(source: &str) -> bool {
	let gated = gated_bodies(source);
	let behind_gate = |at: usize| gated.iter().any(|body| body.contains(&at));
	source.match_indices("FcmRequest(").all(|(request, _)| {
		behind_gate(request) || {
			let callers = calls(source, enclosing_function(source, request));
			!callers.is_empty() && callers.into_iter().all(behind_gate)
		}
	})
}

#[test]
fn the_gate_pin_sees_a_binding_that_skips_the_gate() {
	let gated = "fun token(invoke: Invoke) = gated(invoke) { askAddon(invoke, 1) }\nprivate fun askAddon(invoke: Invoke, what: Int) {\n\tFcmRequest(activity, what) {}.send()\n}";
	let folded = "private fun askAddon(invoke: Invoke, what: Int) = gated(invoke) {\n\tFcmRequest(activity, what) {}.send()\n}\nfun token(invoke: Invoke) = askAddon(invoke, 1)";
	let skipped =
		format!("{gated}\nfun peek(invoke: Invoke) = askAddon(invoke, 3)");
	assert!(bound_behind_gate(gated));
	assert!(bound_behind_gate(folded));
	assert!(!bound_behind_gate(&skipped));
}

#[test]
fn the_fcm_addon_is_reached_only_through_the_shared_gate() {
	assert_eq!(
		PLUGIN.matches("FcmRequest(").count(),
		1,
		"{PLUGIN_FILE} should bind the FCM add-on from exactly one place"
	);
	for (file, source) in [
		("PushContract.kt", CONTRACT),
		("PushNotifier.kt", NOTIFIER),
		("PushPoll.kt", POLL),
		("PushPollService.kt", POLL_SERVICE),
		("PushSchedule.kt", SCHEDULE),
	] {
		assert!(
			!source.contains("FcmRequest("),
			"{file} binds the FCM add-on outside {PLUGIN_FILE}'s shared gate"
		);
	}
	assert!(
		bound_behind_gate(PLUGIN),
		"{PLUGIN_FILE} reaches FcmRequest outside gated(invoke) {{ … }}, so the add-on would be bound without the signature and enabled checks"
	);

	let plugin = squashed(PLUGIN);
	assert!(
		plugin.contains("importorg.opengrind.addon.AddonGate"),
		"PushPlugin.kt no longer uses the shared add-on gate"
	);
	assert!(
		plugin.contains(&squashed(
			"when (AddonLaunchCheck.decideService(activity, PushContract.bindIntent(), PushContract.ADDON_PACKAGE))"
		)),
		"PushPlugin.kt no longer checks the FCM add-on through AddonLaunchCheck before binding it"
	);
	assert!(
		squashed(FCM_REQUEST)
			.contains("context.bindService(PushContract.bindIntent(),"),
		"FcmRequest.kt binds a different intent than the one PushPlugin.kt's gate judges"
	);
	assert!(
		plugin.contains("AddonGate.Verdict.Launch->run()"),
		"PushPlugin.kt no longer runs the command once the gate lets the add-on launch"
	);
}
