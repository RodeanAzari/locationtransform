//! Fourier series of a sampled closed curve, with terms ordered by amplitude.

use crate::complex::Complex;
use crate::fft;

/// One epicycle: coefficient `c` rotating at integer frequency `k`, i.e. `c · e^{ikt}`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Term {
    pub k: i32,
    pub c: Complex,
}

/// The Fourier coefficients of `M` uniformly sampled points of a closed curve, so that
/// `z(t) = c0 + Σ c_k e^{ikt}` passes through sample `j` at `t = 2πj/M`.
#[derive(Clone, Debug)]
pub struct Spectrum {
    /// Number of samples the spectrum was computed from.
    pub m: usize,
    /// The centre term (frequency 0).
    pub c0: Complex,
    /// All non-zero-frequency terms, largest amplitude first (ties: lower `|k|`, then lower `k`).
    pub terms: Vec<Term>,
}

impl Spectrum {
    /// Computes the spectrum of `samples` (length must be a power of two).
    pub fn from_samples(samples: &[Complex]) -> Self {
        let m = samples.len();
        let mut data = samples.to_vec();
        fft::forward(&mut data);
        let scale = 1.0 / m as f64;

        let mut terms: Vec<Term> = data
            .iter()
            .enumerate()
            .skip(1)
            .map(|(i, &c)| Term {
                k: fft::frequency(i, m),
                c: c.scale(scale),
            })
            .collect();
        terms.sort_by(|a, b| {
            b.c.norm()
                .total_cmp(&a.c.norm())
                .then(a.k.abs().cmp(&b.k.abs()))
                .then(a.k.cmp(&b.k))
        });

        Spectrum {
            m,
            c0: data[0].scale(scale),
            terms,
        }
    }

    /// Evaluates `c0` plus the `n` largest terms at the `M` sample parameters `t = 2πj/M`.
    pub fn reconstruct(&self, n: usize) -> Vec<Complex> {
        let mut data = vec![Complex::ZERO; self.m];
        data[0] = self.c0;
        for term in &self.terms[..n.min(self.terms.len())] {
            data[fft::bin(term.k, self.m)] = term.c;
        }
        fft::inverse(&mut data);
        data
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::Rng;
    use std::f64::consts::TAU;

    #[test]
    fn all_terms_reproduce_the_input() {
        let samples = Rng::new(3).points(256, -100.0, 100.0);
        let spectrum = Spectrum::from_samples(&samples);
        assert_eq!(spectrum.terms.len(), 255);
        let rebuilt = spectrum.reconstruct(255);
        for (a, b) in samples.iter().zip(&rebuilt) {
            assert!(a.dist_sq(*b).sqrt() < 1e-9);
        }
    }

    #[test]
    fn terms_are_sorted_by_amplitude() {
        let terms = Spectrum::from_samples(&Rng::new(9).points(128, -1.0, 1.0)).terms;
        assert!(terms.windows(2).all(|w| w[0].c.norm() >= w[1].c.norm()));
    }

    #[test]
    fn single_harmonic_is_recovered() {
        // z_j = 2 + 3i + 5·e^{-2it}: one term at k = -2.
        let m = 64;
        let samples: Vec<Complex> = (0..m)
            .map(|j| {
                let t = TAU * j as f64 / m as f64;
                Complex::new(2.0, 3.0) + Complex::from_polar(5.0, -2.0 * t)
            })
            .collect();
        let spectrum = Spectrum::from_samples(&samples);
        assert!(spectrum.c0.dist_sq(Complex::new(2.0, 3.0)).sqrt() < 1e-12);
        assert_eq!(spectrum.terms[0].k, -2);
        assert!((spectrum.terms[0].c.norm() - 5.0).abs() < 1e-12);
        assert!(spectrum.terms[1].c.norm() < 1e-12);
    }
}
