mod geometry;
#[cfg(target_os = "ios")]
pub mod ios;

#[cfg(target_os = "ios")]
pub use ios::{install, reseed};
