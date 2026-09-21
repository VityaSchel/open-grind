pub fn hex(bytes: &[u8]) -> String {
	bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
	use super::hex;

	#[test]
	fn bytes_render_as_lowercase_pairs() {
		assert_eq!(hex(&[0x00, 0x0f, 0xa5, 0xff]), "000fa5ff");
		assert_eq!(hex(&[]), "");
	}
}
