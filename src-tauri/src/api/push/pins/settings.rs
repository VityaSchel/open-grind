use std::collections::BTreeSet;

use super::{
	CATEGORIES, EVENTS, FAST_SOURCE, MODE, NOTIFIER, PLUGIN, TYPES_TS,
};
use crate::api::push::{Category, FastSource, PushMode, PushSignal};
use crate::pin_support::{braced_block, squashed};

#[test]
fn every_notification_mode_is_spelled_the_same_in_all_three_languages() {
	for mode in [PushMode::Slow, PushMode::Fast] {
		let wire = mode.wire();
		let kotlin = format!("{}(\"{wire}\")", {
			let mut name = wire.to_owned();
			name[..1].make_ascii_uppercase();
			name
		});
		assert!(
			squashed(MODE).contains(&squashed(&kotlin)),
			"PushMode.kt has no entry {kotlin}"
		);
		assert!(
			squashed(TYPES_TS).contains(&format!("\"{wire}\"")),
			"types.ts no longer offers the {wire} mode"
		);
	}
}

#[test]
fn every_fast_source_is_spelled_the_same_in_all_three_languages() {
	let rust: BTreeSet<String> =
		FastSource::ALL.into_iter().map(FastSource::wire).collect();
	let enum_body = squashed(braced_block(
		FAST_SOURCE,
		"FastSource.kt",
		"enum class FastSource",
	));
	let kotlin: BTreeSet<String> = enum_body
		.split_once(';')
		.map_or(enum_body.as_str(), |(entries, _)| entries)
		.split(',')
		.filter(|entry| !entry.is_empty())
		.map(|entry| {
			entry
				.split_once("(\"")
				.and_then(|(name, rest)| {
					let wire = rest.strip_suffix("\")")?;
					let mut expected = wire.to_owned();
					expected[..1].make_ascii_uppercase();
					(name == expected).then(|| wire.to_owned())
				})
				.unwrap_or_else(|| {
					panic!("FastSource.kt entry {entry} is not Name(\"name\")")
				})
		})
		.collect();
	assert_eq!(
		kotlin, rust,
		"FastSource.kt and the Rust FastSource offer different sources"
	);
	let types = squashed(TYPES_TS);
	let offered: BTreeSet<String> = types
		.split_once("exportconstfastSourceSchema=z.enum([")
		.and_then(|(_, rest)| rest.split_once("])"))
		.expect("types.ts no longer declares fastSourceSchema as a z.enum")
		.0
		.split(',')
		.filter(|wire| !wire.is_empty())
		.map(|wire| wire.trim_matches('"').to_owned())
		.collect();
	assert_eq!(
		offered, rust,
		"fastSourceSchema and the Rust FastSource offer different sources, so the frontend would refuse a configured source"
	);
}

#[test]
fn every_notification_category_is_spelled_the_same_in_both_languages() {
	let kotlin = squashed(CATEGORIES);
	let wires: Vec<&str> = kotlin
		.split("->\"")
		.skip(1)
		.filter_map(|rest| rest.split('"').next())
		.collect();
	assert!(!wires.is_empty(), "PushCategories.kt names no categories");
	for wire in wires {
		assert!(
			squashed(TYPES_TS).contains(&format!("\"{wire}\"")),
			"types.ts no longer offers the {wire} category"
		);
	}
}

#[test]
fn every_category_rust_names_is_one_the_frontend_offers() {
	for category in Category::ALL {
		let wire = category.name();
		assert_eq!(
			serde_json::from_value::<Category>(serde_json::json!(wire)).ok(),
			Some(category),
			"{wire} does not decode back to its own category"
		);
		assert!(
			squashed(TYPES_TS).contains(&format!("\"{wire}\"")),
			"types.ts no longer offers the {wire} category"
		);
	}
}

#[test]
fn every_push_signal_key_kotlin_sends_is_one_the_frontend_parses() {
	let signal = serde_json::to_value(PushSignal {
		deeplink_pending: false,
		token_changed: false,
	})
	.expect("a PushSignal serializes");
	let declared: BTreeSet<&str> = signal
		.as_object()
		.expect("a PushSignal is a JSON object")
		.keys()
		.map(String::as_str)
		.collect();
	let events = squashed(EVENTS);
	let sent: BTreeSet<&str> = events
		.split("put(\"")
		.skip(1)
		.filter_map(|call| call.split('"').next())
		.collect();
	assert_eq!(
		sent, declared,
		"PushEvents.kt sends other signal keys than PushSignal declares"
	);
	let types = squashed(TYPES_TS);
	let parsed: BTreeSet<&str> = types
		.split_once("exportconstpushSignalSchema=z.object({")
		.and_then(|(_, rest)| rest.split_once("})"))
		.expect("types.ts no longer declares pushSignalSchema as a z.object")
		.0
		.split(',')
		.filter(|field| !field.is_empty())
		.map(|field| {
			field.strip_suffix(":z.boolean()").unwrap_or_else(|| {
				panic!("pushSignalSchema field {field} is not a boolean")
			})
		})
		.collect();
	assert_eq!(
		parsed, sent,
		"PushEvents.kt and pushSignalSchema disagree, so safeParse would silently drop every tap deeplink and token rotation"
	);
}

#[test]
fn the_notification_switches_suppress_only_new_notifications_never_dismissals()
{
	let notifier = squashed(NOTIFIER);
	let notify = notifier
		.split_once("privatefunnotify(")
		.expect("PushNotifier declares no notify()")
		.1;
	let notify = notify.split_once("fun").map_or(notify, |(body, _)| body);
	for (guard, switch) in [
		(
			"if(!PushSettings.notificationsEnabled(context))return",
			"master switch",
		),
		(
			"if(!notificationsPermitted(context))return",
			"system permission",
		),
		(
			"if(!PushSettings.categoryEnabled(context,decision.kind))return",
			"category switch",
		),
	] {
		let consulted = guard
			.strip_prefix("if(!")
			.and_then(|call| call.split_once('('))
			.map(|(consulted, _)| format!("{consulted}("))
			.expect("a guard calls its switch");
		assert_eq!(
			notifier.matches(&consulted).count()
				- notifier.matches(&format!("fun{consulted}")).count(),
			1,
			"PushNotifier must consult the {switch} exactly once, in notify(); anywhere else, such as apply(), would also swallow the clear and unsend dismissals"
		);
		assert_eq!(
			notifier.matches(guard).count(),
			1,
			"PushNotifier must guard on the {switch} exactly once, in notify()"
		);
		assert!(
			notify.contains(guard),
			"the {switch} guard left notify(); in apply() it would also swallow the clear and unsend dismissals"
		);
	}
}

#[test]
fn the_master_switch_is_not_gated_behind_the_fcm_addon() {
	let plugin = squashed(PLUGIN);
	for command in ["notificationsEnabled", "setNotificationsEnabled"] {
		let body = plugin
			.split_once(&format!("fun{command}("))
			.unwrap_or_else(|| panic!("PushPlugin declares no {command}"))
			.1
			.split_once("@Command")
			.map_or_else(|| plugin.clone(), |(body, _)| body.to_owned());
		assert!(
			!body.contains("gated("),
			"{command} is behind the add-on gate, so slow mode could never turn notifications on or off"
		);
	}
}
