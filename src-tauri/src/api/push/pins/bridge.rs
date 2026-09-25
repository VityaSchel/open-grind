use std::collections::BTreeSet;

use super::{BRIDGE, PLUGIN};
use crate::pin_support::{camel_case, squashed};

fn bridge_commands() -> BTreeSet<String> {
	let bridge = squashed(BRIDGE);
	["(app,\"", ">(\""]
		.into_iter()
		.flat_map(|opening| bridge.split(opening).skip(1))
		.filter_map(|call| call.split('"').next())
		.map(str::to_owned)
		.collect()
}

fn plugin_commands() -> BTreeSet<String> {
	squashed(PLUGIN)
		.split("@Command")
		.skip(1)
		.filter_map(|declaration| {
			declaration.split_once("fun")?.1.split('(').next()
		})
		.map(str::to_owned)
		.collect()
}

#[test]
fn every_command_the_bridge_sends_is_one_the_android_plugin_answers() {
	let bridge = bridge_commands();
	assert!(
		bridge.contains("dismissConversation")
			&& bridge.contains("watchPush")
			&& bridge.len() > 10,
		"the bridge commands were not parsed: {bridge:?}"
	);
	let plugin = plugin_commands();
	let missing: Vec<&String> = bridge.difference(&plugin).collect();
	assert!(
		missing.is_empty(),
		"push/android.rs sends {missing:?}, which PushPlugin.kt has no @Command for, so the call would reject at runtime"
	);
}

fn body(declaration: &str) -> &str {
	declaration
		.split_once('{')
		.and_then(|(_, rest)| rest.split_once('}'))
		.map_or("", |(inside, _)| inside)
}

fn sent_arguments() -> BTreeSet<String> {
	BRIDGE
		.split("#[derive(")
		.skip(1)
		.filter(|item| {
			item.split(")]")
				.next()
				.is_some_and(|d| d.contains("Serialize"))
		})
		.flat_map(|item| {
			let camel = item.split("struct").next().is_some_and(|attributes| {
				attributes.contains("rename_all = \"camelCase\"")
			});
			body(item)
				.lines()
				.filter_map(|line| line.split_once(':'))
				.map(move |(name, _)| match camel {
					true => camel_case(name.trim()),
					false => name.trim().to_owned(),
				})
		})
		.collect()
}

fn read_arguments() -> BTreeSet<String> {
	PLUGIN
		.split("@InvokeArg")
		.skip(1)
		.flat_map(|class| body(class).lines())
		.filter_map(|line| line.split_once("var ")?.1.split(':').next())
		.map(|name| name.trim().to_owned())
		.collect()
}

#[test]
fn every_argument_the_bridge_sends_is_named_as_the_android_plugin_reads_it() {
	let sent = sent_arguments();
	assert!(
		["conversationId", "dedupeKey", "onEvent", "category"]
			.iter()
			.all(|name| sent.contains(*name)),
		"the bridge arguments were not parsed: {sent:?}"
	);
	let read = read_arguments();
	let unread: Vec<&String> = sent.difference(&read).collect();
	assert!(
		unread.is_empty(),
		"push/android.rs sends {unread:?}, which no @InvokeArg class in PushPlugin.kt reads, so Android sees the argument as missing"
	);
}
