use std::collections::HashMap;

#[derive(Debug, PartialEq, Eq)]
pub enum ArgsError {
	MissingCommand,
	DanglingFlag(String),
	UnexpectedValue(String),
	MissingFlag(&'static str),
	NotANumber(&'static str),
}

impl std::fmt::Display for ArgsError {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Self::MissingCommand => f.write_str("missing command"),
			Self::DanglingFlag(flag) => write!(f, "{flag} needs a value"),
			Self::UnexpectedValue(value) => {
				write!(f, "unexpected argument {value:?}")
			}
			Self::MissingFlag(flag) => write!(f, "--{flag} is required"),
			Self::NotANumber(flag) => write!(f, "--{flag} must be a number"),
		}
	}
}

#[derive(Debug)]
pub struct Args {
	pub command: String,
	flags: HashMap<String, String>,
}

impl Args {
	pub fn parse(
		raw: impl IntoIterator<Item = String>,
	) -> Result<Self, ArgsError> {
		let mut raw = raw.into_iter();
		let command = raw.next().ok_or(ArgsError::MissingCommand)?;
		let mut flags = HashMap::new();
		while let Some(item) = raw.next() {
			let Some(name) = item.strip_prefix("--") else {
				return Err(ArgsError::UnexpectedValue(item));
			};
			let value = raw
				.next()
				.ok_or_else(|| ArgsError::DanglingFlag(item.clone()))?;
			flags.insert(name.to_owned(), value);
		}
		Ok(Self { command, flags })
	}

	pub fn text(&self, name: &'static str) -> Result<&str, ArgsError> {
		self.optional_text(name).ok_or(ArgsError::MissingFlag(name))
	}

	pub fn optional_text(&self, name: &'static str) -> Option<&str> {
		self.flags.get(name).map(String::as_str)
	}

	pub fn number(&self, name: &'static str) -> Result<u64, ArgsError> {
		self.optional_number(name)?
			.ok_or(ArgsError::MissingFlag(name))
	}

	pub fn optional_number(
		&self,
		name: &'static str,
	) -> Result<Option<u64>, ArgsError> {
		self.optional_text(name)
			.map(|value| value.parse().map_err(|_| ArgsError::NotANumber(name)))
			.transpose()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn parse(items: &[&str]) -> Result<Args, ArgsError> {
		Args::parse(items.iter().map(|item| (*item).to_owned()))
	}

	#[test]
	fn reads_the_command_and_its_flags() {
		let args =
			parse(&["send-text", "--as", "880215879", "--text", "hi"]).unwrap();
		assert_eq!(args.command, "send-text");
		assert_eq!(args.number("as"), Ok(880_215_879));
		assert_eq!(args.text("text"), Ok("hi"));
	}

	#[test]
	fn rejects_a_flag_without_a_value() {
		assert_eq!(
			parse(&["probe", "--as"]).unwrap_err(),
			ArgsError::DanglingFlag("--as".to_owned())
		);
	}

	#[test]
	fn rejects_a_bare_value() {
		assert_eq!(
			parse(&["probe", "880215879"]).unwrap_err(),
			ArgsError::UnexpectedValue("880215879".to_owned())
		);
	}

	#[test]
	fn reports_a_missing_or_non_numeric_flag() {
		let args = parse(&["probe", "--as", "me"]).unwrap();
		assert_eq!(args.number("as"), Err(ArgsError::NotANumber("as")));
		assert_eq!(args.number("peer"), Err(ArgsError::MissingFlag("peer")));
	}
}
