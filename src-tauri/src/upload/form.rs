use grindr::Bytes;
use uuid::Uuid;

pub struct FormPart<'a> {
	pub name: &'a str,
	pub filename: &'a str,
	pub content_type: &'a str,
}

#[derive(Debug)]
pub struct Framing {
	pub content_type: String,
	pub head: Bytes,
	pub tail: Bytes,
}

impl Framing {
	pub fn new(part: &FormPart<'_>) -> Self {
		Self::with_boundary(part, &Uuid::new_v4().hyphenated().to_string())
	}

	fn with_boundary(part: &FormPart<'_>, boundary: &str) -> Self {
		let head = format!(
			"--{boundary}\r\nContent-Disposition: form-data; name={}; filename={}\r\nContent-Type: {}\r\n\r\n",
			quote(part.name),
			quote(part.filename),
			header_value(part.content_type),
		);
		Self {
			content_type: format!("multipart/form-data; boundary={boundary}"),
			head: Bytes::from(head),
			tail: Bytes::from(format!("\r\n--{boundary}--\r\n")),
		}
	}

	pub fn size(&self, content_len: u64) -> u64 {
		self.head.len() as u64 + content_len + self.tail.len() as u64
	}

	pub fn frame(&self, content: Bytes) -> Bytes {
		let mut body = Vec::with_capacity(
			self.head.len() + content.len() + self.tail.len(),
		);
		body.extend_from_slice(&self.head);
		body.extend_from_slice(&content);
		body.extend_from_slice(&self.tail);
		Bytes::from(body)
	}
}

fn header_value(value: &str) -> String {
	value.chars().filter(|ch| matches!(ch, ' '..='~')).collect()
}

fn quote(value: &str) -> String {
	let mut quoted = String::with_capacity(value.len() + 2);
	quoted.push('"');
	for ch in value.chars() {
		match ch {
			'\n' => quoted.push_str("%0A"),
			'\r' => quoted.push_str("%0D"),
			'"' => quoted.push_str("%22"),
			other => quoted.push(other),
		}
	}
	quoted.push('"');
	quoted
}

#[cfg(test)]
mod tests {
	use super::*;

	const BOUNDARY: &str = "0d7a8a6e-4a4e-4a7b-9d1a-2b3c4d5e6f70";

	fn content_part(content_type: &str) -> Framing {
		Framing::with_boundary(
			&FormPart {
				name: "content",
				filename: "",
				content_type,
			},
			BOUNDARY,
		)
	}

	#[test]
	fn frames_a_video_part_like_okhttp() {
		let framing = content_part("video/mp4");
		let expected = b"--0d7a8a6e-4a4e-4a7b-9d1a-2b3c4d5e6f70\r\n\
Content-Disposition: form-data; name=\"content\"; filename=\"\"\r\n\
Content-Type: video/mp4\r\n\
\r\n\
\r\n--0d7a8a6e-4a4e-4a7b-9d1a-2b3c4d5e6f70--\r\n";
		assert_eq!(
			framing.content_type,
			"multipart/form-data; boundary=0d7a8a6e-4a4e-4a7b-9d1a-2b3c4d5e6f70"
		);
		assert_eq!(framing.frame(Bytes::new()).as_ref(), expected);
		assert_eq!(framing.size(0), 172);
	}

	#[test]
	fn frames_a_photo_part_around_its_content() {
		let framing = content_part("image/jpeg");
		let framed = framing.frame(Bytes::from_static(b"\xFF\xD8\xFF"));
		assert_eq!(framing.size(0), 173);
		assert_eq!(framed.len(), 176);
		assert!(framed.starts_with(b"--0d7a8a6e"));
		assert!(
			framed.ends_with(b"--0d7a8a6e-4a4e-4a7b-9d1a-2b3c4d5e6f70--\r\n")
		);
		assert_eq!(
			&framed[framing.head.len()..framing.head.len() + 3],
			b"\xFF\xD8\xFF"
		);
	}

	#[test]
	fn escapes_quotes_and_line_breaks_in_names() {
		let framing = Framing::with_boundary(
			&FormPart {
				name: "a\"b",
				filename: "c\r\nd",
				content_type: "image/png",
			},
			BOUNDARY,
		);
		let head = std::str::from_utf8(&framing.head).unwrap();
		assert!(head.contains("name=\"a%22b\"; filename=\"c%0D%0Ad\""));
		assert!(!head.contains("Content-Length"));
	}

	#[test]
	fn a_line_break_in_the_content_type_cannot_add_a_header() {
		let framing = content_part(
			"image/png\r\nContent-Disposition: form-data; name=\"stolen\"",
		);
		let head = std::str::from_utf8(&framing.head).unwrap();
		assert_eq!(
			head.lines()
				.filter(|line| line.starts_with("Content-Disposition"))
				.count(),
			1
		);
		assert_eq!(head.matches("\r\n").count(), 4);
	}

	#[test]
	fn size_matches_the_framed_length() {
		let framing = content_part("video/mp4");
		let content = Bytes::from(vec![7u8; 1234]);
		assert_eq!(
			framing.size(content.len() as u64),
			framing.frame(content).len() as u64
		);
	}
}
