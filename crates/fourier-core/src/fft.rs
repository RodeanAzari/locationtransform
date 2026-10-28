//! Iterative radix-2 Cooley–Tukey FFT.
//!
//! Conventions: [`forward`] computes `X_k = Σ_j x_j e^{-2πi jk/M}` (unnormalized) and
//! [`inverse`] computes `x_j = Σ_k X_k e^{+2πi jk/M}` (also unnormalized), so
//! `inverse(forward(x)) = M·x`.

use std::f64::consts::TAU;

use crate::complex::Complex;

/// In-place forward DFT. `data.len()` must be a power of two.
pub fn forward(data: &mut [Complex]) {
    transform(data, -1.0);
}

/// In-place inverse DFT without the `1/M` factor. `data.len()` must be a power of two.
pub fn inverse(data: &mut [Complex]) {
    transform(data, 1.0);
}

/// Signed frequency of DFT bin `index` for length `m`, in `-m/2 ..= m/2 - 1`.
pub fn frequency(index: usize, m: usize) -> i32 {
    if index < m / 2 {
        index as i32
    } else {
        index as i32 - m as i32
    }
}

/// DFT bin holding signed frequency `k` for length `m`.
pub fn bin(k: i32, m: usize) -> usize {
    k.rem_euclid(m as i32) as usize
}

fn transform(data: &mut [Complex], sign: f64) {
    let n = data.len();
    assert!(n.is_power_of_two(), "FFT length must be a power of two");
    if n == 1 {
        return;
    }

    let bits = n.trailing_zeros();
    for i in 0..n {
        let j = i.reverse_bits() >> (usize::BITS - bits);
        if j > i {
            data.swap(i, j);
        }
    }

    // Twiddles are evaluated directly (not by recurrence) to keep rounding error at ~1 ulp.
    let twiddles: Vec<Complex> = (0..n / 2)
        .map(|j| Complex::from_polar(1.0, sign * TAU * j as f64 / n as f64))
        .collect();

    let mut len = 2;
    while len <= n {
        let half = len / 2;
        let stride = n / len;
        for start in (0..n).step_by(len) {
            for j in 0..half {
                let a = data[start + j];
                let b = data[start + j + half] * twiddles[j * stride];
                data[start + j] = a + b;
                data[start + j + half] = a - b;
            }
        }
        len *= 2;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::Rng;

    fn naive_dft(input: &[Complex]) -> Vec<Complex> {
        let m = input.len();
        (0..m)
            .map(|k| {
                input
                    .iter()
                    .enumerate()
                    .fold(Complex::ZERO, |acc, (j, &x)| {
                        let theta = -TAU * ((j * k) % m) as f64 / m as f64;
                        acc + x * Complex::from_polar(1.0, theta)
                    })
            })
            .collect()
    }

    #[test]
    fn matches_naive_dft_on_random_input() {
        let mut rng = Rng::new(42);
        for m in [1, 2, 4, 8, 64, 256, 1024] {
            let input = rng.points(m, -1.0, 1.0);
            let expected = naive_dft(&input);
            let mut actual = input.clone();
            forward(&mut actual);
            for (a, e) in actual.iter().zip(&expected) {
                assert!(a.dist_sq(*e).sqrt() < 1e-9, "m={m}: {a:?} vs {e:?}");
            }
        }
    }

    #[test]
    fn inverse_undoes_forward_up_to_scale() {
        let mut rng = Rng::new(7);
        let input = rng.points(512, -5.0, 5.0);
        let mut data = input.clone();
        forward(&mut data);
        inverse(&mut data);
        for (x, y) in input.iter().zip(&data) {
            assert!(x.dist_sq(y.scale(1.0 / 512.0)).sqrt() < 1e-12);
        }
    }

    #[test]
    fn frequency_and_bin_are_inverse() {
        let m = 16;
        for i in 0..m {
            assert_eq!(bin(frequency(i, m), m), i);
        }
        assert_eq!(frequency(8, 16), -8);
        assert_eq!(frequency(15, 16), -1);
    }
}
