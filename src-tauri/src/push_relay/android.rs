use grindr::GrindrClient;
use jni::objects::{JClass, JString};
use jni::sys::jint;
use jni::JNIEnv;

use super::{Call, Lookup, Outcome};
use crate::state;
use crate::storage::{self, AuthStorage, DeviceStorage, StorageBackend};

#[no_mangle]
pub extern "system" fn Java_org_opengrind_push_RelayGrindr_nativeRegister<
	'local,
>(
	mut env: JNIEnv<'local>,
	_class: JClass<'local>,
	token: JString<'local>,
	profile_id: JString<'local>,
) -> jint {
	answer(&mut env, Call::Register, &token, &profile_id)
}

#[no_mangle]
pub extern "system" fn Java_org_opengrind_push_RelayGrindr_nativeUnregister<
	'local,
>(
	mut env: JNIEnv<'local>,
	_class: JClass<'local>,
	token: JString<'local>,
	profile_id: JString<'local>,
) -> jint {
	answer(&mut env, Call::Unregister, &token, &profile_id)
}

fn answer(
	env: &mut JNIEnv,
	call: Call,
	token: &JString,
	profile_id: &JString,
) -> jint {
	let (Some(token), Some(profile_id)) =
		(text(env, token), text(env, profile_id))
	else {
		tracing::warn!("[relay] {call:?} arguments unreadable");
		return Outcome::Retry.code();
	};
	std::panic::catch_unwind(|| settled(call, &token, &profile_id))
		.unwrap_or_else(|_| {
			tracing::error!("[relay] {call:?} panicked");
			Outcome::Retry
		})
		.code()
}

fn text(env: &mut JNIEnv, string: &JString) -> Option<String> {
	env.get_string(string).ok().map(String::from)
}

fn lookup() -> Lookup<GrindrClient> {
	if let Some(running) = state::shared() {
		return Lookup::Found(running);
	}
	if storage::init_keyring() == StorageBackend::Unavailable {
		return Lookup::Unreadable;
	}
	Lookup::stored(AuthStorage::get_credentials(), |credentials| {
		GrindrClient::new(
			DeviceStorage::load_or_create(),
			Some(grindr::Session {
				credentials,
				token: None,
			}),
		)
		.map(|built| state::share(|| built))
	})
}

fn settled(call: Call, token: &str, profile_id: &str) -> Outcome {
	let client = match lookup().admitted(profile_id) {
		Ok(client) => client,
		Err(outcome) => return outcome,
	};
	let runtime = tokio::runtime::Builder::new_current_thread()
		.enable_all()
		.build();
	match runtime {
		Ok(runtime) => runtime.block_on(send(&client, call, token)),
		Err(e) => {
			tracing::warn!("[relay] no runtime: {e}");
			Outcome::Retry
		}
	}
}

async fn send(client: &GrindrClient, call: Call, token: &str) -> Outcome {
	let Some(planned) = call.request(token) else {
		tracing::warn!("[relay] the token is not a registration pair");
		return Outcome::Retry;
	};
	let mut request = client.request(planned.method, &planned.path);
	if let Some(body) = &planned.body {
		request = request.json(body);
	}
	match request.send().await {
		Ok(response) => {
			let outcome = call.settled_by(response.status);
			if outcome != Outcome::Done {
				tracing::warn!("[relay] {call:?} answered {}", response.status);
			}
			outcome
		}
		Err(_) => {
			tracing::warn!("[relay] {call:?} did not reach Grindr");
			Outcome::Retry
		}
	}
}
