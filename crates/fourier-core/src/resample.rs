//! Uniform arc-length resampling of closed rings.

use crate::complex::Complex;

/// Perimeter of a closed ring (the closing segment back to `ring[0]` is included).
pub fn perimeter(ring: &[Complex]) -> f64 {
    (0..ring.len())
        .map(|i| ring[i].dist_sq(ring[(i + 1) % ring.len()]).sqrt())
        .sum()
}

/// Number of resampled points: the power of two giving a spacing of at most `spacing`,
/// clamped to `min..=max` (both powers of two).
pub fn sample_count(perimeter: f64, spacing: f64, min: usize, max: usize) -> usize {
    let raw = (perimeter / spacing).ceil();
    if raw >= max as f64 {
        return max;
    }
    (raw as usize).max(1).next_power_of_two().clamp(min, max)
}

/// Resamples a closed ring to `m` points evenly spaced by arc length, starting at `ring[0]`.
///
/// A repeated closing vertex (as in GeoJSON) is harmless: it is a zero-length segment.
/// The ring must have a positive perimeter.
pub fn resample(ring: &[Complex], m: usize) -> Vec<Complex> {
    let n = ring.len();
    let segment_len = |i: usize| ring[i].dist_sq(ring[(i + 1) % n]).sqrt();
    let step = perimeter(ring) / m as f64;

    let mut out = Vec::with_capacity(m);
    let mut seg = 0;
    let mut seg_start = 0.0;
    let mut seg_len = segment_len(0);
    for j in 0..m {
        let s = j as f64 * step;
        while seg_start + seg_len < s && seg < n - 1 {
            seg_start += seg_len;
            seg += 1;
            seg_len = segment_len(seg);
        }
        let a = ring[seg];
        let b = ring[(seg + 1) % n];
        let t = if seg_len > 0.0 {
            ((s - seg_start) / seg_len).clamp(0.0, 1.0)
        } else {
            0.0
        };
        out.push(a + (b - a).scale(t));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit square with unevenly spaced extra vertices along its edges, closed GeoJSON-style.
    fn uneven_square() -> Vec<Complex> {
        [
            (0.0, 0.0),
            (0.1, 0.0),
            (0.15, 0.0),
            (1.0, 0.0),
            (1.0, 0.9),
            (1.0, 1.0),
            (0.3, 1.0),
            (0.0, 1.0),
            (0.0, 0.05),
            (0.0, 0.0),
        ]
        .iter()
        .map(|&(x, y)| Complex::new(x, y))
        .collect()
    }

    #[test]
    fn perimeter_of_unit_square() {
        assert!((perimeter(&uneven_square()) - 4.0).abs() < 1e-12);
    }

    #[test]
    fn resampled_points_are_evenly_spaced() {
        // Perimeter 4 with 64 samples puts a sample on every corner, so all chords equal the step.
        let points = resample(&uneven_square(), 64);
        assert_eq!(points.len(), 64);
        assert_eq!(points[0], Complex::ZERO);
        for i in 0..64 {
            let d = points[i].dist_sq(points[(i + 1) % 64]).sqrt();
            assert!((d - 1.0 / 16.0).abs() < 1e-12, "gap {i} is {d}");
        }
    }

    #[test]
    fn sample_count_is_a_clamped_power_of_two() {
        assert_eq!(sample_count(1000.0, 1.0, 256, 4096), 1024);
        assert_eq!(sample_count(10.0, 1.0, 256, 4096), 256);
        assert_eq!(sample_count(1e9, 1.0, 256, 4096), 4096);
    }
}
