//! Deterministic random numbers for tests (no external dependency).

use crate::complex::Complex;

/// xorshift64* generator.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }

    /// Uniform in `[lo, hi)`.
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        let bits = self.0.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 11;
        lo + (hi - lo) * (bits as f64 / (1u64 << 53) as f64)
    }

    /// `n` points with both coordinates uniform in `[lo, hi)`.
    pub fn points(&mut self, n: usize, lo: f64, hi: f64) -> Vec<Complex> {
        (0..n)
            .map(|_| Complex::new(self.range(lo, hi), self.range(lo, hi)))
            .collect()
    }
}
