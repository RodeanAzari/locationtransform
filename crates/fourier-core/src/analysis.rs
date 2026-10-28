//! Full per-ring pipeline: resample → FFT → sort terms → find N → error curve.

use std::fmt;

use wasm_bindgen::prelude::*;

use crate::complex::Complex;
use crate::find_n::find_n;
use crate::hausdorff::{PointGrid, directed};
use crate::resample::{perimeter, resample, sample_count};
use crate::series::{Spectrum, Term};

/// Tunables for [`analyze`]. Values come from the app's `config.ts`.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct Options {
    /// Bounding-box diagonal of the whole place (all kept rings), in input units (km).
    /// Errors are reported relative to this.
    #[wasm_bindgen(skip)]
    pub place_diagonal: f64,
    /// Target normalized Hausdorff error, e.g. `0.001` for 0.1%.
    #[wasm_bindgen(skip)]
    pub target: f64,
    /// Minimum resampled points per ring (power of two).
    #[wasm_bindgen(skip)]
    pub min_samples: u32,
    /// Maximum resampled points per ring (power of two).
    #[wasm_bindgen(skip)]
    pub max_samples: u32,
    /// Desired spacing between resampled points, as a fraction of `place_diagonal`.
    #[wasm_bindgen(skip)]
    pub sample_spacing: f64,
    /// How many term counts after N must also meet the target (guards against non-monotone error).
    #[wasm_bindgen(skip)]
    pub lookahead: u32,
    /// Approximate number of log-spaced points in the error curve.
    #[wasm_bindgen(skip)]
    pub curve_samples: u32,
}

#[wasm_bindgen]
impl Options {
    #[wasm_bindgen(constructor)]
    pub fn new(
        place_diagonal: f64,
        target: f64,
        min_samples: u32,
        max_samples: u32,
        sample_spacing: f64,
        lookahead: u32,
        curve_samples: u32,
    ) -> Options {
        Options {
            place_diagonal,
            target,
            min_samples,
            max_samples,
            sample_spacing,
            lookahead,
            curve_samples,
        }
    }
}

/// Why a ring could not be analyzed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalysisError {
    /// The coordinate array has odd length or fewer than three points.
    TooFewPoints,
    /// The ring has zero (or non-finite) perimeter.
    DegenerateRing,
    /// Options are out of range (non-positive diagonal/spacing, sample bounds not powers of two).
    InvalidOptions,
}

impl fmt::Display for AnalysisError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            AnalysisError::TooFewPoints => "ring needs an even-length array of at least 3 points",
            AnalysisError::DegenerateRing => "ring has zero or non-finite perimeter",
            AnalysisError::InvalidOptions => "invalid analysis options",
        })
    }
}

impl std::error::Error for AnalysisError {}

/// Result of analyzing one ring. All arrays are plain typed arrays on the JS side.
#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct RingAnalysis {
    resampled: Vec<Complex>,
    c0: Complex,
    terms: Vec<Term>,
    error: f64,
    target_reached: bool,
    curve: Vec<(usize, f64)>,
}

#[wasm_bindgen]
impl RingAnalysis {
    /// M, the number of resampled points.
    #[wasm_bindgen(getter, js_name = sampleCount)]
    pub fn sample_count(&self) -> u32 {
        self.resampled.len() as u32
    }

    /// The resampled true ring as interleaved `x0, y0, x1, y1, …` (the ghost outline).
    #[wasm_bindgen(getter, js_name = resampledXy)]
    pub fn resampled_xy(&self) -> Vec<f64> {
        self.resampled.iter().flat_map(|p| [p.re, p.im]).collect()
    }

    /// Real part of the centre coefficient c₀.
    #[wasm_bindgen(getter, js_name = c0Re)]
    pub fn c0_re(&self) -> f64 {
        self.c0.re
    }

    /// Imaginary part of the centre coefficient c₀.
    #[wasm_bindgen(getter, js_name = c0Im)]
    pub fn c0_im(&self) -> f64 {
        self.c0.im
    }

    /// N for this ring: the number of terms (excluding c₀) needed to reach the target, or the cap.
    #[wasm_bindgen(getter)]
    pub fn n(&self) -> u32 {
        self.terms.len() as u32
    }

    /// Frequencies of the first N terms, largest amplitude first.
    #[wasm_bindgen(getter, js_name = termK)]
    pub fn term_k(&self) -> Vec<i32> {
        self.terms.iter().map(|t| t.k).collect()
    }

    /// Real parts of the first N coefficients, in the same order as `termK`.
    #[wasm_bindgen(getter, js_name = termRe)]
    pub fn term_re(&self) -> Vec<f64> {
        self.terms.iter().map(|t| t.c.re).collect()
    }

    /// Imaginary parts of the first N coefficients, in the same order as `termK`.
    #[wasm_bindgen(getter, js_name = termIm)]
    pub fn term_im(&self) -> Vec<f64> {
        self.terms.iter().map(|t| t.c.im).collect()
    }

    /// Normalized Hausdorff error at N.
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> f64 {
        self.error
    }

    /// Whether the error at N meets the target (false only when N hit the cap).
    #[wasm_bindgen(getter, js_name = targetReached)]
    pub fn target_reached(&self) -> bool {
        self.target_reached
    }

    /// Term counts at which the error curve was sampled, ascending, from 1 to N.
    #[wasm_bindgen(getter, js_name = curveN)]
    pub fn curve_n(&self) -> Vec<u32> {
        self.curve.iter().map(|&(n, _)| n as u32).collect()
    }

    /// Normalized Hausdorff error at each `curveN` entry.
    #[wasm_bindgen(getter, js_name = curveError)]
    pub fn curve_error(&self) -> Vec<f64> {
        self.curve.iter().map(|&(_, e)| e).collect()
    }
}

/// Analyzes one projected ring given as interleaved `x, y` coordinates (km).
pub fn analyze(xy: &[f64], options: &Options) -> Result<RingAnalysis, AnalysisError> {
    let min_samples = options.min_samples as usize;
    let max_samples = options.max_samples as usize;
    let valid = options.place_diagonal > 0.0
        && options.sample_spacing > 0.0
        && min_samples >= 4
        && min_samples.is_power_of_two()
        && max_samples.is_power_of_two()
        && min_samples <= max_samples;
    if !valid {
        return Err(AnalysisError::InvalidOptions);
    }
    if !xy.len().is_multiple_of(2) || xy.len() < 6 {
        return Err(AnalysisError::TooFewPoints);
    }

    let ring: Vec<Complex> = xy
        .as_chunks::<2>()
        .0
        .iter()
        .map(|&[x, y]| Complex::new(x, y))
        .collect();
    let length = perimeter(&ring);
    if !(length.is_finite() && length > 0.0) {
        return Err(AnalysisError::DegenerateRing);
    }

    let spacing = options.sample_spacing * options.place_diagonal;
    let m = sample_count(length, spacing, min_samples, max_samples);
    let samples = resample(&ring, m);
    let spectrum = Spectrum::from_samples(&samples);
    let truth_grid = PointGrid::new(&samples);

    let cap = m / 2;
    let mut cache: Vec<Option<f64>> = vec![None; cap + 1];
    let mut error_at = |n: usize| {
        *cache[n].get_or_insert_with(|| {
            let recon = spectrum.reconstruct(n);
            let distance =
                directed(&recon, &truth_grid).max(directed(&samples, &PointGrid::new(&recon)));
            distance / options.place_diagonal
        })
    };

    let n = find_n(
        &mut error_at,
        options.target,
        options.lookahead as usize,
        cap,
    );
    let curve: Vec<(usize, f64)> = curve_ns(n, options.curve_samples as usize)
        .into_iter()
        .map(|k| (k, error_at(k)))
        .collect();
    let error = error_at(n);

    Ok(RingAnalysis {
        terms: spectrum.terms[..n].to_vec(),
        c0: spectrum.c0,
        error,
        target_reached: error <= options.target,
        curve,
        resampled: samples,
    })
}

/// Term counts for the error curve: the slider snap points (1, 3, 10, 50, N) plus about
/// `count` log-spaced values in `1..=n`, deduplicated and ascending.
fn curve_ns(n: usize, count: usize) -> Vec<usize> {
    let mut ns: Vec<usize> = [1, 3, 10, 50, n].into_iter().filter(|&k| k <= n).collect();
    let log_n = (n as f64).ln();
    let steps = count.saturating_sub(1).max(1) as f64;
    for i in 0..count {
        let k = (log_n * i as f64 / steps).exp().round() as usize;
        ns.push(k.clamp(1, n));
    }
    ns.sort_unstable();
    ns.dedup();
    ns
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::TAU;

    fn options(place_diagonal: f64) -> Options {
        Options::new(place_diagonal, 0.001, 256, 4096, 0.0005, 3, 32)
    }

    fn flatten(points: &[(f64, f64)]) -> Vec<f64> {
        points.iter().flat_map(|&(x, y)| [x, y]).collect()
    }

    fn circle(radius: f64, vertices: usize) -> Vec<f64> {
        let points: Vec<(f64, f64)> = (0..vertices)
            .map(|i| {
                let t = TAU * i as f64 / vertices as f64;
                (500.0 + radius * t.cos(), -200.0 + radius * t.sin())
            })
            .collect();
        flatten(&points)
    }

    fn square(side: f64) -> Vec<f64> {
        flatten(&[
            (0.0, 0.0),
            (side, 0.0),
            (side, side),
            (0.0, side),
            (0.0, 0.0),
        ])
    }

    #[test]
    fn circle_needs_exactly_one_term() {
        let result = analyze(&circle(100.0, 2000), &options(200.0 * 2f64.sqrt())).unwrap();
        assert_eq!(result.n(), 1);
        assert!(result.target_reached());
        assert!(result.error() <= 0.001);
        assert_eq!(result.term_k(), vec![1]); // counter-clockwise ring → positive frequency
    }

    #[test]
    fn square_needs_many_more_terms() {
        let result = analyze(&square(100.0), &options(100.0 * 2f64.sqrt())).unwrap();
        assert!(
            result.n() > 50,
            "square converged suspiciously fast: N = {}",
            result.n()
        );
        assert!(result.target_reached());
        // Gibbs: one term is a circle, far from the corners.
        assert!(result.curve_error()[0] > 0.05);
    }

    #[test]
    fn error_at_n_is_within_target_and_curve_ends_at_n() {
        let result = analyze(&square(100.0), &options(100.0 * 2f64.sqrt())).unwrap();
        let ns = result.curve_n();
        assert_eq!(ns[0], 1);
        assert_eq!(*ns.last().unwrap(), result.n());
        assert_eq!(*result.curve_error().last().unwrap(), result.error());
        assert!(ns.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn unreachable_target_reports_cap_honestly() {
        let mut opts = options(100.0 * 2f64.sqrt());
        opts.target = 0.0;
        let result = analyze(&square(100.0), &opts).unwrap();
        assert_eq!(result.n() as usize, result.sample_count() as usize / 2);
        assert!(!result.target_reached());
        assert!(result.error() > 0.0);
    }

    #[test]
    fn sample_count_scales_with_perimeter_relative_to_place() {
        // Same ring, but as a small island of a much larger place: fewer samples.
        let alone = analyze(&square(100.0), &options(141.0)).unwrap();
        let island = analyze(&square(100.0), &options(100_000.0)).unwrap();
        assert!(island.sample_count() < alone.sample_count());
        assert_eq!(island.sample_count(), 256);
    }

    #[test]
    fn rejects_bad_input() {
        let opts = options(1.0);
        assert_eq!(
            analyze(&[0.0, 0.0, 1.0], &opts).unwrap_err(),
            AnalysisError::TooFewPoints
        );
        assert_eq!(
            analyze(&[0.0; 8], &opts).unwrap_err(),
            AnalysisError::DegenerateRing
        );
        let mut bad = opts;
        bad.max_samples = 1000;
        assert_eq!(
            analyze(&square(1.0), &bad).unwrap_err(),
            AnalysisError::InvalidOptions
        );
    }

    #[test]
    fn curve_ns_includes_snap_points() {
        assert_eq!(curve_ns(1, 8), vec![1]);
        let ns = curve_ns(200, 8);
        for snap in [1, 3, 10, 50, 200] {
            assert!(ns.contains(&snap));
        }
    }
}
