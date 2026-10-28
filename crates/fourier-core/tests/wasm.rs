//! Smoke test of the JS-facing API, run inside a real WASM runtime via `wasm-pack test --node`.
#![cfg(target_arch = "wasm32")]

use fourier_core::{Options, analyze_ring};
use wasm_bindgen_test::wasm_bindgen_test;

#[wasm_bindgen_test]
fn analyze_ring_runs_in_wasm() {
    let square = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];
    let options = Options::new(10.0 * 2f64.sqrt(), 0.001, 256, 4096, 0.0005, 3, 16);
    let result = analyze_ring(&square, &options).unwrap();
    assert!(result.target_reached());
    assert_eq!(result.term_k().len(), result.n() as usize);
    assert_eq!(
        result.resampled_xy().len(),
        2 * result.sample_count() as usize
    );
}
