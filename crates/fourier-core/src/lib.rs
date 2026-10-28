//! Fourier epicycle math for Fourier Borders, compiled to WebAssembly.

use wasm_bindgen::prelude::*;

pub mod complex;
pub mod fft;
pub mod resample;
#[cfg(test)]
mod test_util;

/// Toolchain spike: sums a `Float64Array` passed from JS.
///
/// Proves typed arrays cross the JS/WASM boundary. Replaced by the real API in milestone 1.
#[wasm_bindgen]
pub fn spike_sum(values: &[f64]) -> f64 {
    values.iter().sum()
}
