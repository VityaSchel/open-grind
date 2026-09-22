const MAX_ERROR_NAME_CHARS: usize = 64;

pub fn error_name(detail: Option<&str>) -> Option<String> {
	detail
		.filter(|detail| {
			(1..=MAX_ERROR_NAME_CHARS).contains(&detail.len())
				&& detail
					.bytes()
					.all(|b| b.is_ascii_alphanumeric() || b == b'_')
		})
		.map(str::to_owned)
}

#[cfg(target_os = "android")]
pub fn classify<E>(
	error: tauri::plugin::mobile::PluginInvokeError,
	from_rejection: fn(Option<&str>, Option<&str>) -> E,
) -> E {
	match error {
		tauri::plugin::mobile::PluginInvokeError::InvokeRejected(response) => {
			from_rejection(
				response.message.as_deref(),
				response.code.as_deref(),
			)
		}
		_ => from_rejection(None, None),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn an_exception_or_sdk_error_name_is_kept() {
		let longest = "A".repeat(MAX_ERROR_NAME_CHARS);
		for name in [
			"IOException",
			"NETWORK_ERROR",
			"IllegalStateException",
			longest.as_str(),
		] {
			assert_eq!(error_name(Some(name)), Some(name.to_owned()));
		}
	}

	#[test]
	fn a_detail_that_is_not_an_error_name_is_dropped() {
		let too_long = "A".repeat(MAX_ERROR_NAME_CHARS + 1);
		for detail in [
			"",
			"0cAFcWeA-token.part",
			"has space",
			"Bearer:x",
			"a:b",
			"IOException\n",
			too_long.as_str(),
		] {
			assert_eq!(error_name(Some(detail)), None, "{detail:?} was kept");
		}
		assert_eq!(error_name(None), None);
	}
}
