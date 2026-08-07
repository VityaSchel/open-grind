use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use grindr::MediaFetcher;

pub struct Target {
	pub url: String,
	pub fetcher: MediaFetcher,
}

/// The tag is a base64url character so that `convertFileSrc`, which percent-
/// encodes the whole path, still emits none — wry's android scheme rewrite is a
/// naive string replace over the url.
fn tagged_fetcher(tag: char) -> Option<MediaFetcher> {
	match tag {
		'i' => Some(MediaFetcher::ImageLoader),
		'v' => Some(MediaFetcher::MediaPlayer),
		_ => None,
	}
}

pub fn decode_target(path: &str) -> Option<Target> {
	let tagged = path.strip_prefix('/')?;
	let (tag, encoded) = tagged.split_at_checked(1)?;
	let fetcher = tagged_fetcher(tag.chars().next()?)?;
	let decoded = URL_SAFE_NO_PAD.decode(encoded).ok()?;
	let url = String::from_utf8(decoded).ok()?;
	url.starts_with("https://")
		.then_some(Target { url, fetcher })
}

pub fn host_of(url: &str) -> &str {
	url.split_once("://")
		.map(|(_, rest)| rest.split('/').next().unwrap_or(rest))
		.unwrap_or("unknown")
}

#[cfg(test)]
mod tests {
	use super::*;

	fn encoded(url: &str) -> String {
		format!("/i{}", URL_SAFE_NO_PAD.encode(url))
	}

	#[test]
	fn an_encoded_https_url_round_trips() {
		let url = "https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1&Signature=x/y+z";

		assert_eq!(decode_target(&encoded(url)).unwrap().url, url);
	}

	#[test]
	fn anything_that_is_not_an_https_url_decodes_to_nothing() {
		for url in [
			"http://cdns.grindr.com/x",
			"file:///etc/passwd",
			"ogmedia://localhost/loop",
			"",
		] {
			assert!(decode_target(&encoded(url)).is_none(), "{url}");
		}
		assert!(decode_target("/inot base64!").is_none());
		assert!(decode_target("no leading slash").is_none());
		assert!(decode_target("/").is_none());
	}

	#[test]
	fn the_encoding_never_contains_a_character_the_url_form_rewrites() {
		let encoded = encoded(
			"https://cdns.grindr.com/images/thumb/320x320/ff?a=b&c=d/e+f",
		);

		assert!(!encoded.contains("://"), "{encoded}");
		assert!(!encoded.contains('%'), "{encoded}");
	}

	#[test]
	fn the_tag_picks_the_stack_and_an_unknown_tag_is_refused() {
		let payload = URL_SAFE_NO_PAD.encode("https://cdns.grindr.com/x");

		assert_eq!(
			decode_target(&format!("/i{payload}")).unwrap().fetcher,
			MediaFetcher::ImageLoader
		);
		assert_eq!(
			decode_target(&format!("/v{payload}")).unwrap().fetcher,
			MediaFetcher::MediaPlayer
		);
		assert!(decode_target(&format!("/x{payload}")).is_none());
		assert!(decode_target(&format!("/{payload}")).is_none());
	}

	#[test]
	fn a_host_carries_none_of_the_signed_query() {
		let host = host_of(
			"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Signature=secret",
		);

		assert_eq!(host, "d3lyqctnm3b6pb.cloudfront.net");
	}
}
