use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::LazyLock;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use blake2::{Blake2b512, Digest};
use ed25519_dalek::{Signature, VerifyingKey};

use super::error::UpdateError;

const RELEASE_KEY: &str =
	"RWReleaseOpenGrindurRQcmR+NovOaU5IEU3LM5l6TcXJvOGYw2m4O+";

const PREHASHED: &[u8; 2] = b"ED";

fn reject(reason: &str) -> UpdateError {
	UpdateError::Signature(reason.to_owned())
}

static PINNED_KEY: LazyLock<Option<[u8; 32]>> =
	LazyLock::new(|| minisign_public_key(RELEASE_KEY));

pub fn verify_digest(
	signature: &str,
	digest: &[u8],
	expected_file: &str,
) -> Result<String, UpdateError> {
	let key = super::dev::release_key()
		.or(*PINNED_KEY)
		.ok_or_else(|| reject("the pinned release key is malformed"))?;
	verify_with(&key, signature, digest, expected_file)
}

#[derive(Clone, Default)]
pub struct Prehash {
	hasher: Blake2b512,
	hashed: u64,
}

impl Prehash {
	pub fn hashed(&self) -> u64 {
		self.hashed
	}

	pub fn update(&mut self, chunk: &[u8]) {
		self.hasher.update(chunk);
		self.hashed += chunk.len() as u64;
	}

	pub fn sync(
		&mut self,
		payload: &Path,
		upto: u64,
	) -> Result<(), UpdateError> {
		if self.hashed == upto {
			return Ok(());
		}
		self.hasher = Blake2b512::new();
		self.hashed = 0;
		if upto == 0 {
			return Ok(());
		}

		let mut file = File::open(payload)?;
		let mut buf = [0u8; 64 * 1024];
		while self.hashed < upto {
			let want = ((upto - self.hashed) as usize).min(buf.len());
			let read = file.read(&mut buf[..want])?;
			if read == 0 {
				return Err(reject("staged payload is shorter than it claims"));
			}
			self.update(&buf[..read]);
		}
		Ok(())
	}

	pub fn finish(&self) -> Vec<u8> {
		self.hasher.clone().finalize().to_vec()
	}
}

pub(super) fn minisign_public_key(published: &str) -> Option<[u8; 32]> {
	let bytes: [u8; 42] =
		STANDARD.decode(published.trim()).ok()?.try_into().ok()?;
	(&bytes[..2] == b"Ed").then(|| bytes[10..].try_into().expect("32 bytes"))
}

fn verify_with(
	key: &[u8; 32],
	signature: &str,
	digest: &[u8],
	expected_file: &str,
) -> Result<String, UpdateError> {
	let mut lines = signature.lines().skip(1);
	let line = lines
		.next()
		.ok_or_else(|| reject("signature has no signature line"))?;
	let blob = STANDARD
		.decode(line.trim())
		.map_err(|_| reject("signature line is not valid base64"))?;
	let blob: [u8; 74] = blob
		.try_into()
		.map_err(|_| reject("signature line has the wrong length"))?;
	if &blob[..2] != PREHASHED {
		return Err(reject("signature is not a prehashed Ed25519 signature"));
	}
	let trusted = lines
		.next()
		.and_then(|line| line.strip_prefix("trusted comment: "))
		.ok_or_else(|| reject("signature has no trusted comment"))?;
	let global: [u8; 64] = lines
		.next()
		.and_then(|line| STANDARD.decode(line.trim()).ok())
		.and_then(|bytes| bytes.try_into().ok())
		.ok_or_else(|| reject("signature has no global signature"))?;

	let verifying = VerifyingKey::from_bytes(key)
		.map_err(|_| reject("release key is not a valid Ed25519 point"))?;
	let signature =
		Signature::from_bytes(blob[10..].try_into().expect("64 bytes"));
	verifying
		.verify_strict(digest, &signature)
		.map_err(|_| reject("payload does not match the release signature"))?;

	let mut signed_comment = Vec::with_capacity(64 + trusted.len());
	signed_comment.extend_from_slice(&blob[10..]);
	signed_comment.extend_from_slice(trusted.as_bytes());
	verifying
		.verify_strict(&signed_comment, &Signature::from_bytes(&global))
		.map_err(|_| {
			reject("trusted comment does not match the release signature")
		})?;

	let named = trusted
		.split('\t')
		.find_map(|field| field.trim().strip_prefix("file:"))
		.ok_or_else(|| reject("signature does not name the file it signs"))?;
	if named != expected_file {
		return Err(reject("signature was made for a different file"));
	}
	Ok(hex(digest))
}

fn hex(bytes: &[u8]) -> String {
	bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
pub fn verify_detached(
	signature: &str,
	payload: &Path,
	expected_file: &str,
) -> Result<String, UpdateError> {
	verify_digest(signature, &prehash(payload)?, expected_file)
}

pub fn payload_digest(payload: &Path) -> Result<String, UpdateError> {
	Ok(hex(&prehash(payload)?))
}

fn prehash(payload: &Path) -> Result<Vec<u8>, UpdateError> {
	let mut digest = Prehash::default();
	digest.sync(payload, std::fs::metadata(payload)?.len())?;
	Ok(digest.finish())
}

#[cfg(test)]
mod tests {
	use std::io::Write;

	use super::*;

	fn published_keys(doc: &str) -> Vec<&str> {
		doc.split(|c: char| c.is_whitespace() || c == ';' || c == '`')
			.filter(|token| token.starts_with("RW") && token.len() == 56)
			.collect()
	}

	#[test]
	fn every_documented_copy_of_the_release_key_matches_the_pin() {
		for (name, doc) in [
			("KEYS.md", include_str!("../../../../KEYS.md")),
			("BUILDING.md", include_str!("../../../../BUILDING.md")),
		] {
			let keys = published_keys(doc);
			assert!(!keys.is_empty(), "{name} publishes no minisign key");
			for key in keys {
				assert_eq!(key, RELEASE_KEY, "stale release key in {name}");
			}
		}
	}

	#[test]
	fn the_pinned_key_is_a_usable_ed25519_point() {
		let key = minisign_public_key(RELEASE_KEY).expect("a minisign key");
		assert!(VerifyingKey::from_bytes(&key).is_ok());
	}

	#[test]
	fn anything_that_is_not_a_42_byte_minisign_key_is_refused() {
		for value in ["", "not base64!", "aGVsbG8=", "RWRelease"] {
			assert!(minisign_public_key(value).is_none(), "accepted {value}");
		}
	}

	fn payload(bytes: &[u8]) -> std::path::PathBuf {
		let path = std::env::temp_dir().join(format!(
			"open-grind-verify-{}-{:?}",
			std::process::id(),
			std::thread::current().id()
		));
		let mut file = File::create(&path).unwrap();
		file.write_all(bytes).unwrap();
		path
	}

	const FIXTURE_KEY: [u8; 32] = [
		0x19, 0x04, 0xf9, 0xf8, 0xf7, 0x2b, 0x13, 0x7a, 0x57, 0xb9, 0x08, 0x9d,
		0xa1, 0xd3, 0x70, 0xcd, 0x52, 0x72, 0x5e, 0x3a, 0x36, 0x2c, 0x0d, 0xcd,
		0x17, 0x9f, 0x32, 0xfd, 0xa7, 0x25, 0x6e, 0x04,
	];
	const FIXTURE_SIG: &str = concat!(
        "untrusted comment: signature from minisign secret key\n",
        "RUSLj9c4YDP7Naa4D9oGc3q7ZYcdVRqD6P9jleWmkQpuPrRpsS2eTTkNNBkSjROggzLWWB9hYuIAN57EqlaOIxOMymvPgnlOcgY=\n",
        "trusted comment: timestamp:1785228644\tfile:small.bin\thashed\n",
        "BHscI+DKdBb/JhEfGGub+qV/6lL8eZ11cEt03OcDh7cPha6eRiOOdFLzpGw2veL4XO5Oj6MkvGKUb/jmXchwBQ==\n",
    );
	const FIXTURE_PAYLOAD: &[u8] = b"open grind minisign fixture payload\n";

	const LARGE_FIXTURE_SIG: &str = concat!(
        "untrusted comment: signature from minisign secret key\n",
        "RUSLj9c4YDP7NR5SZ2ikhI7mPxFiuPRVCQE0fknx7ayRq/yd29HTbsdu+35fwXVfLHjC+XzWg8dy+3Xi3br2QaOrX8tpvtXY+As=\n",
        "trusted comment: timestamp:1785228644\tfile:large.bin\thashed\n",
        "leeLN7smLujB51XfNUxnS+zUDXFd3JrfA6c00Os36W6U4fns7LccITySwmHVnIv5rHYFUZW3em9bW01qxU+ZCA==\n",
    );

	fn large_fixture_payload() -> Vec<u8> {
		(0..200_000u32)
			.map(|i| ((i * 7 + 13) % 251) as u8)
			.collect()
	}

	#[test]
	fn verifies_a_real_minisign_signature() {
		verify_with(
			&FIXTURE_KEY,
			FIXTURE_SIG,
			&prehash(&payload(FIXTURE_PAYLOAD)).unwrap(),
			"small.bin",
		)
		.expect("genuine minisign signature must verify");
	}

	#[test]
	fn digests_a_payload_larger_than_one_read() {
		let large = large_fixture_payload();
		verify_with(
			&FIXTURE_KEY,
			LARGE_FIXTURE_SIG,
			&prehash(&payload(&large)).unwrap(),
			"large.bin",
		)
		.expect("a multi-chunk payload must digest the same as minisign does");

		let mut tampered = large;
		let last = tampered.len() - 1;
		tampered[last] ^= 1;
		verify_with(
			&FIXTURE_KEY,
			LARGE_FIXTURE_SIG,
			&prehash(&payload(&tampered)).unwrap(),
			"large.bin",
		)
		.expect_err("a flipped byte in the last chunk must fail");
	}

	#[test]
	fn rejects_a_tampered_payload() {
		let mut tampered = FIXTURE_PAYLOAD.to_vec();
		tampered[0] ^= 1;
		let error = verify_with(
			&FIXTURE_KEY,
			FIXTURE_SIG,
			&prehash(&payload(&tampered)).unwrap(),
			"small.bin",
		)
		.unwrap_err();
		match error {
			UpdateError::Signature(reason) => {
				assert!(reason.contains("does not match"))
			}
			other => panic!("unexpected error: {other:?}"),
		}
	}

	#[test]
	fn rejects_a_signature_made_by_any_other_key() {
		let error = verify_detached(
			FIXTURE_SIG,
			&payload(FIXTURE_PAYLOAD),
			"small.bin",
		)
		.unwrap_err();
		match error {
			UpdateError::Signature(reason) => {
				assert!(reason.contains("does not match"))
			}
			other => panic!("unexpected error: {other:?}"),
		}
	}

	#[test]
	fn rejects_a_genuine_signature_for_a_different_file() {
		let error = verify_with(
			&FIXTURE_KEY,
			FIXTURE_SIG,
			&prehash(&payload(FIXTURE_PAYLOAD)).unwrap(),
			"open-grind-v9.9.9-android.apk",
		)
		.unwrap_err();
		match error {
			UpdateError::Signature(reason) => {
				assert!(reason.contains("different file"), "{reason}")
			}
			other => panic!("unexpected error: {other:?}"),
		}
	}

	#[test]
	fn rejects_an_edited_trusted_comment() {
		let renamed = FIXTURE_SIG.replacen("file:small.bin", "file:other", 1);
		let error = verify_with(
			&FIXTURE_KEY,
			&renamed,
			&prehash(&payload(FIXTURE_PAYLOAD)).unwrap(),
			"other",
		)
		.unwrap_err();
		match error {
			UpdateError::Signature(reason) => {
				assert!(reason.contains("trusted comment"), "{reason}")
			}
			other => panic!("unexpected error: {other:?}"),
		}
	}

	#[test]
	fn rejects_a_signature_with_the_global_signature_stripped() {
		let two_lines: Vec<&str> = FIXTURE_SIG.lines().take(2).collect();
		let error = verify_with(
			&FIXTURE_KEY,
			&two_lines.join("\n"),
			&prehash(&payload(FIXTURE_PAYLOAD)).unwrap(),
			"small.bin",
		)
		.unwrap_err();
		assert!(matches!(error, UpdateError::Signature(_)), "{error:?}");
	}

	#[test]
	fn rejects_the_legacy_whole_file_algorithm() {
		let mut blob = STANDARD
			.decode(FIXTURE_SIG.lines().nth(1).unwrap())
			.unwrap();
		blob[..2].copy_from_slice(b"Ed");
		let downgraded = FIXTURE_SIG.replacen(
			FIXTURE_SIG.lines().nth(1).unwrap(),
			&STANDARD.encode(&blob),
			1,
		);

		let error = verify_with(
			&FIXTURE_KEY,
			&downgraded,
			&prehash(&payload(FIXTURE_PAYLOAD)).unwrap(),
			"small.bin",
		)
		.unwrap_err();
		match error {
			UpdateError::Signature(reason) => {
				assert!(reason.contains("prehashed"))
			}
			other => panic!("unexpected error: {other:?}"),
		}
	}

	#[test]
	fn rejects_anything_that_is_not_a_signature() {
		for text in
			["", "not a signature", "untrusted comment: x\nnot base64!\n"]
		{
			let error = verify_detached(text, &payload(b"x"), "x").unwrap_err();
			assert!(
				matches!(error, UpdateError::Signature(_)),
				"accepted {text}"
			);
		}
	}
}
