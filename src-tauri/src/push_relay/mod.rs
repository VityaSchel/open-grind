#[cfg(target_os = "android")]
mod android;
#[cfg(test)]
mod pins;

use std::fmt::Display;

use grindr::{GrindrClient, Method};
use serde::Serialize;

const REGISTER_PATH: &str = "/v3/gcm-push-tokens";
const UNREGISTER_PATH: &str = "/v3/push-tokens/";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Outcome {
	Done,
	Retry,
	Refused,
}

impl Outcome {
	const fn code(self) -> i32 {
		match self {
			Self::Done => 0,
			Self::Retry => 1,
			Self::Refused => 2,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Call {
	Register,
	Unregister,
}

impl Call {
	fn request(self, token: &str) -> Option<TokenRequest<'_>> {
		match self {
			Self::Register => {
				Registration::of(token).map(|registration| TokenRequest {
					method: Method::POST,
					path: REGISTER_PATH.to_owned(),
					body: Some(registration),
				})
			}
			Self::Unregister => Some(TokenRequest {
				method: Method::DELETE,
				path: unregister_path(token),
				body: None,
			}),
		}
	}

	fn settled_by(self, status: u16) -> Outcome {
		let succeeded = (200..300).contains(&status);
		let accepted = match self {
			Self::Register => succeeded,
			Self::Unregister => succeeded || status == 404,
		};
		if accepted {
			Outcome::Done
		} else {
			Outcome::Retry
		}
	}
}

#[derive(Debug, PartialEq, Eq)]
struct TokenRequest<'a> {
	method: Method,
	path: String,
	body: Option<Registration<'a>>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Registration<'a> {
	vendor_provided_identifier: &'a str,
	token: &'a str,
}

impl<'a> Registration<'a> {
	fn of(token: &'a str) -> Option<Self> {
		let printable = token.bytes().all(|byte| (0x21..=0x7E).contains(&byte));
		let (identifier, rest) = token.split_once(':')?;
		(printable && !identifier.is_empty() && !rest.is_empty()).then_some(
			Self {
				vendor_provided_identifier: identifier,
				token,
			},
		)
	}
}

fn unregister_path(token: &str) -> String {
	let encoded: String = token
		.bytes()
		.map(|byte| match byte {
			b'A'..=b'Z'
			| b'a'..=b'z'
			| b'0'..=b'9'
			| b'-'
			| b'_'
			| b'.'
			| b'!'
			| b'~'
			| b'*'
			| b'\''
			| b'('
			| b')' => char::from(byte).to_string(),
			_ => format!("%{byte:02X}"),
		})
		.collect();
	format!("{UNREGISTER_PATH}{encoded}")
}

enum Lookup<Client> {
	Found(Client),
	SignedOut,
	Unreadable,
}

impl<Client> Lookup<Client> {
	fn stored<ReadError: Display, BuildError: Display>(
		credentials: Result<Option<grindr::Credentials>, ReadError>,
		build: impl FnOnce(grindr::Credentials) -> Result<Client, BuildError>,
	) -> Self {
		match credentials {
			Ok(Some(credentials)) => match build(credentials) {
				Ok(client) => Self::Found(client),
				Err(e) => {
					tracing::warn!("[relay] no client: {e}");
					Self::Unreadable
				}
			},
			Ok(None) => Self::SignedOut,
			Err(e) => {
				tracing::warn!("[relay] the stored session is unreadable: {e}");
				Self::Unreadable
			}
		}
	}
}

impl Lookup<GrindrClient> {
	fn admitted(self, profile_id: &str) -> Result<GrindrClient, Outcome> {
		match self {
			Self::Found(client) => {
				let paired = signed_in_as(
					client.session_receiver().borrow().as_ref(),
					profile_id,
				);
				paired.then_some(client).ok_or(Outcome::Refused)
			}
			Self::SignedOut => Err(Outcome::Refused),
			Self::Unreadable => Err(Outcome::Retry),
		}
	}
}

fn signed_in_as(session: Option<&grindr::Session>, profile_id: &str) -> bool {
	!profile_id.is_empty()
		&& session.and_then(|session| session.credentials.profile_id.as_deref())
			== Some(profile_id)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn credentials(profile_id: Option<&str>) -> grindr::Credentials {
		grindr::Credentials {
			email: "user@example.com".to_owned(),
			profile_id: profile_id.map(str::to_owned),
			auth_token: "auth-token".to_owned(),
			kind: grindr::SessionKind::Email,
			third_party_user_id: None,
		}
	}

	fn session(profile_id: Option<&str>) -> grindr::Session {
		grindr::Session {
			credentials: credentials(profile_id),
			token: None,
		}
	}

	fn built(
		credentials: grindr::Credentials,
	) -> Result<GrindrClient, grindr::GrindrError> {
		GrindrClient::new(
			grindr::DeviceInfo::generate(),
			Some(grindr::Session {
				credentials,
				token: None,
			}),
		)
	}

	fn never_built(
		_credentials: grindr::Credentials,
	) -> Result<GrindrClient, String> {
		panic!("a client was built without a stored session")
	}

	#[test]
	fn the_result_codes_are_the_ones_relay_grindr_reads() {
		assert_eq!(Outcome::Done.code(), 0);
		assert_eq!(Outcome::Retry.code(), 1);
		assert_eq!(Outcome::Refused.code(), 2);
	}

	#[test]
	fn a_registration_succeeds_only_on_a_2xx_answer() {
		for status in [200, 201, 204, 299] {
			assert_eq!(Call::Register.settled_by(status), Outcome::Done);
		}
		for status in [0, 199, 300, 400, 401, 404, 429, 500] {
			assert_eq!(
				Call::Register.settled_by(status),
				Outcome::Retry,
				"{status} counted as registered"
			);
		}
	}

	#[test]
	fn a_token_grindr_no_longer_knows_counts_as_unregistered() {
		for status in [200, 204, 404] {
			assert_eq!(Call::Unregister.settled_by(status), Outcome::Done);
		}
		for status in [0, 400, 401, 403, 429, 500, 503] {
			assert_eq!(
				Call::Unregister.settled_by(status),
				Outcome::Retry,
				"{status} counted as unregistered"
			);
		}
	}

	#[test]
	fn a_registration_posts_the_firebase_installation_before_the_colon() {
		let token = "fEJ0SZYSQm-bC1Zq:APA91bHqR-3xY_0:extra";
		let request = Call::Register.request(token).unwrap();
		assert_eq!(request.method, Method::POST);
		assert_eq!(request.path, "/v3/gcm-push-tokens");
		assert_eq!(
			serde_json::to_value(request.body.unwrap()).unwrap(),
			serde_json::json!({
				"vendorProvidedIdentifier": "fEJ0SZYSQm-bC1Zq",
				"token": token,
			})
		);
	}

	#[test]
	fn an_unregistration_deletes_the_token_without_a_body() {
		let request = Call::Unregister.request("fid:APA91b").unwrap();
		assert_eq!(request.method, Method::DELETE);
		assert_eq!(request.path, "/v3/push-tokens/fid%3AAPA91b");
		assert_eq!(request.body, None);
	}

	#[test]
	fn a_token_that_is_not_a_grindr_registration_pair_is_not_registered() {
		for token in [
			"",
			"APA91bHqR3xY0",
			":APA91bHqR3xY0",
			"fEJ0SZYSQm:",
			"fEJ0SZYS Qm:APA91b",
			"fEJ0SZYSQm:APA91b\n",
			"fEJ0SZYSQm:APA91bé",
		] {
			assert_eq!(
				Call::Register.request(token),
				None,
				"{token:?} was accepted"
			);
		}
	}

	#[test]
	fn the_unregister_path_encodes_the_token_like_encode_uri_component() {
		assert_eq!(
			unregister_path("fid-1_a.b:APA91b~x*y'z(1)!"),
			"/v3/push-tokens/fid-1_a.b%3AAPA91b~x*y'z(1)!"
		);
		assert_eq!(
			unregister_path("a/b?c#d e%f+g&h"),
			"/v3/push-tokens/a%2Fb%3Fc%23d%20e%25f%2Bg%26h"
		);
		assert_eq!(unregister_path("é"), "/v3/push-tokens/%C3%A9");
	}

	#[test]
	fn only_the_paired_profile_may_register_or_unregister() {
		let signed_in = session(Some("42"));
		assert!(signed_in_as(Some(&signed_in), "42"));
		assert!(!signed_in_as(Some(&signed_in), "43"));
		assert!(!signed_in_as(Some(&signed_in), ""));
		assert!(!signed_in_as(Some(&session(None)), "42"));
		assert!(!signed_in_as(Some(&session(Some(""))), ""));
		assert!(!signed_in_as(None, "42"));
	}

	#[test]
	fn a_session_the_store_cannot_read_is_retried_rather_than_unpaired() {
		let lookup = Lookup::stored(Err("the keystore is busy"), never_built);
		assert_eq!(lookup.admitted("42").err(), Some(Outcome::Retry));
	}

	#[test]
	fn a_client_that_cannot_be_built_is_retried_rather_than_unpaired() {
		let lookup = Lookup::stored(
			Ok::<_, String>(Some(credentials(Some("42")))),
			|_| Err::<GrindrClient, _>("no TLS backend"),
		);
		assert_eq!(lookup.admitted("42").err(), Some(Outcome::Retry));
	}

	#[test]
	fn only_a_store_that_holds_no_session_counts_as_signed_out() {
		let lookup = Lookup::stored(Ok::<_, String>(None), never_built);
		assert_eq!(lookup.admitted("42").err(), Some(Outcome::Refused));
	}

	#[test]
	fn a_stored_session_is_used_only_for_the_paired_profile() {
		let paired = Lookup::stored(
			Ok::<_, String>(Some(credentials(Some("42")))),
			built,
		);
		assert!(paired.admitted("42").is_ok());
		let other = Lookup::stored(
			Ok::<_, String>(Some(credentials(Some("43")))),
			built,
		);
		assert_eq!(other.admitted("42").err(), Some(Outcome::Refused));
	}

	#[test]
	fn a_running_client_is_used_only_while_signed_in_as_the_paired_profile() {
		let signed_out =
			GrindrClient::new(grindr::DeviceInfo::generate(), None).unwrap();
		assert_eq!(
			Lookup::Found(signed_out).admitted("42").err(),
			Some(Outcome::Refused)
		);
		let signed_in = built(credentials(Some("42"))).unwrap();
		assert!(Lookup::Found(signed_in.clone()).admitted("42").is_ok());
		assert_eq!(
			Lookup::Found(signed_in).admitted("43").err(),
			Some(Outcome::Refused)
		);
	}
}
