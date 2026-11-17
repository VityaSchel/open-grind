use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PagePoint {
	pub x: f64,
	pub y: f64,
}

#[cfg(test)]
mod tests {
	use super::*;

	const PAGE_POINT: &str = include_str!("../../src/lib/util/page-point.ts");

	#[test]
	fn the_point_reads_the_shape_the_page_declares() {
		assert!(PAGE_POINT
			.contains("export type PagePoint = { x: number; y: number };"));
		assert_eq!(
			serde_json::from_str::<Option<PagePoint>>(r#"{"x":201,"y":451}"#)
				.unwrap(),
			Some(PagePoint { x: 201.0, y: 451.0 })
		);
		assert_eq!(
			serde_json::from_str::<Option<PagePoint>>("null").unwrap(),
			None
		);
	}
}
