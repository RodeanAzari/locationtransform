//! Choosing the number of Fourier terms needed to reach an accuracy target.

/// Returns the smallest term count `n` in `1..=cap` such that `error(n)` and the following
/// `lookahead` values are all `<= target`, or `cap` if `error(cap)` misses the target.
///
/// The error is not strictly monotone in `n`, so a binary search (which assumes it is) only
/// finds a candidate; the result is then stepped forward past any later values that bounce
/// back above the target.
pub fn find_n(
    mut error: impl FnMut(usize) -> f64,
    target: f64,
    lookahead: usize,
    cap: usize,
) -> usize {
    if error(cap) > target {
        return cap;
    }
    let (mut lo, mut hi) = (1, cap);
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if error(mid) <= target {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    let mut n = lo;
    loop {
        let end = (n + lookahead).min(cap);
        match (n..=end).find(|&j| error(j) > target) {
            None => return n,
            Some(bad) => n = bad + 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monotone_errors() {
        let errors = |n: usize| 1.0 / n as f64;
        assert_eq!(find_n(errors, 0.1, 3, 100), 10);
        assert_eq!(find_n(errors, 1.0, 3, 100), 1);
    }

    #[test]
    fn steps_past_a_later_bump() {
        // Under target from 10 on, except a bump at 12.
        let errors = |n: usize| if n == 12 { 0.5 } else { 1.0 / n as f64 };
        assert_eq!(find_n(errors, 0.1, 3, 100), 13);
        // With no lookahead the bump at 12 is never examined.
        assert_eq!(find_n(errors, 0.1, 0, 100), 10);
    }

    #[test]
    fn unreachable_target_returns_cap() {
        assert_eq!(find_n(|n| 1.0 / n as f64, 0.001, 3, 50), 50);
    }

    #[test]
    fn lookahead_is_clamped_to_cap() {
        assert_eq!(find_n(|n| 1.0 / n as f64, 0.1, 5, 10), 10);
    }
}
