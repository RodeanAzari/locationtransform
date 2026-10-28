//! Fourier epicycle math for Fourier Borders, compiled to WebAssembly.
//!
//! Per ring: arc-length [`resample`] → [`fft`] → amplitude-sorted [`series::Spectrum`] →
//! [`find_n`] guided by the grid-accelerated [`hausdorff`] distance. The JS-facing entry
//! point is [`analyze_ring`]; the boundary contract is documented in `README.md`.

use wasm_bindgen::prelude::*;

mod analysis;
pub mod complex;
pub mod fft;
pub mod find_n;
pub mod hausdorff;
pub mod resample;
pub mod series;
#[cfg(test)]
mod test_util;

pub use analysis::{AnalysisError, Options, RingAnalysis, analyze};

/// Analyzes one projected ring (`xy` = interleaved x, y in km). Throws on invalid input.
#[wasm_bindgen(js_name = analyzeRing)]
pub fn analyze_ring(xy: &[f64], options: &Options) -> Result<RingAnalysis, JsError> {
    Ok(analyze(xy, options)?)
}
