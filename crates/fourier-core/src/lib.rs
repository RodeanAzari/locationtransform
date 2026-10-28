//! Fourier epicycle math, compiled to WebAssembly and called from the web worker.

use wasm_bindgen::prelude::*;

/// Toolchain spike: sums a `Float64Array` passed from JS.
///
/// Proves typed arrays cross the JS/WASM boundary. Replaced by the real API in milestone 1.
#[wasm_bindgen]
pub fn spike_sum(values: &[f64]) -> f64 {
    values.iter().sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spike_sum_adds_values() {
        assert_eq!(spike_sum(&[1.0, 2.0, 3.5]), 6.5);
    }
}
