//! Discrete Hausdorff distance with a uniform-grid nearest-neighbour index.

use crate::complex::Complex;

/// A uniform grid over a point set for fast nearest-neighbour queries.
///
/// Cell size is chosen so cells hold about one point each on average; queries scan rings of
/// cells outward and stop once no unvisited cell can contain a closer point.
pub struct PointGrid {
    origin: Complex,
    cell: f64,
    cols: usize,
    rows: usize,
    /// `points[starts[c]..starts[c + 1]]` are the points in cell `c` (row-major).
    starts: Vec<usize>,
    points: Vec<Complex>,
}

impl PointGrid {
    /// Builds a grid over `points` (must be non-empty).
    pub fn new(points: &[Complex]) -> Self {
        let (mut min, mut max) = (points[0], points[0]);
        for p in points {
            min = Complex::new(min.re.min(p.re), min.im.min(p.im));
            max = Complex::new(max.re.max(p.re), max.im.max(p.im));
        }
        let (width, height) = (max.re - min.re, max.im - min.im);
        let n = points.len() as f64;
        // The second bound keeps the grid at most ~n cells per axis for very thin point sets.
        let mut cell = (width * height / n).sqrt().max(width.max(height) / n);
        if cell <= 0.0 {
            cell = 1.0;
        }
        let cols = (width / cell) as usize + 1;
        let rows = (height / cell) as usize + 1;

        let mut grid = PointGrid {
            origin: min,
            cell,
            cols,
            rows,
            starts: vec![0; cols * rows + 1],
            points: vec![Complex::ZERO; points.len()],
        };
        let cell_ids: Vec<usize> = points.iter().map(|&p| grid.cell_id(p)).collect();
        for &c in &cell_ids {
            grid.starts[c + 1] += 1;
        }
        for c in 0..cols * rows {
            grid.starts[c + 1] += grid.starts[c];
        }
        let mut next = grid.starts.clone();
        for (&p, &c) in points.iter().zip(&cell_ids) {
            grid.points[next[c]] = p;
            next[c] += 1;
        }
        grid
    }

    /// Cell coordinates of `p`, clamped to the grid.
    fn cell_xy(&self, p: Complex) -> (usize, usize) {
        let clamp = |v: f64, len: usize| (v.max(0.0) as usize).min(len - 1);
        (
            clamp((p.re - self.origin.re) / self.cell, self.cols),
            clamp((p.im - self.origin.im) / self.cell, self.rows),
        )
    }

    fn cell_id(&self, p: Complex) -> usize {
        let (x, y) = self.cell_xy(p);
        y * self.cols + x
    }

    /// Distance from `p` to the nearest point in the grid.
    pub fn nearest_distance(&self, p: Complex) -> f64 {
        let (cx, cy) = self.cell_xy(p);
        let (cx, cy) = (cx as isize, cy as isize);
        let mut best = f64::INFINITY;
        for r in 0..=self.cols.max(self.rows) as isize {
            for dy in -r..=r {
                if dy.abs() == r {
                    for dx in -r..=r {
                        best = best.min(self.cell_nearest_sq(cx + dx, cy + dy, p));
                    }
                } else {
                    best = best.min(self.cell_nearest_sq(cx - r, cy + dy, p));
                    best = best.min(self.cell_nearest_sq(cx + r, cy + dy, p));
                }
            }
            // Any cell in ring r + 1 or beyond is at least r cells away from p.
            let reach = r as f64 * self.cell;
            if best <= reach * reach {
                break;
            }
        }
        best.sqrt()
    }

    /// Smallest squared distance from `p` to a point in cell `(x, y)`; infinity if the cell is
    /// empty or outside the grid.
    fn cell_nearest_sq(&self, x: isize, y: isize, p: Complex) -> f64 {
        if x < 0 || y < 0 || x >= self.cols as isize || y >= self.rows as isize {
            return f64::INFINITY;
        }
        let c = y as usize * self.cols + x as usize;
        self.points[self.starts[c]..self.starts[c + 1]]
            .iter()
            .map(|&q| p.dist_sq(q))
            .fold(f64::INFINITY, f64::min)
    }
}

/// Directed Hausdorff distance `max_{a ∈ from} min_{b ∈ to} |a − b|`.
pub fn directed(from: &[Complex], to: &PointGrid) -> f64 {
    from.iter()
        .map(|&p| to.nearest_distance(p))
        .fold(0.0, f64::max)
}

/// Symmetric discrete Hausdorff distance between two non-empty point sets.
pub fn hausdorff(a: &[Complex], b: &[Complex]) -> f64 {
    directed(a, &PointGrid::new(b)).max(directed(b, &PointGrid::new(a)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_util::Rng;

    fn pts(xy: &[(f64, f64)]) -> Vec<Complex> {
        xy.iter().map(|&(x, y)| Complex::new(x, y)).collect()
    }

    fn brute_force(a: &[Complex], b: &[Complex]) -> f64 {
        let directed = |from: &[Complex], to: &[Complex]| {
            from.iter()
                .map(|p| {
                    to.iter()
                        .map(|q| p.dist_sq(*q))
                        .fold(f64::INFINITY, f64::min)
                })
                .fold(0.0, f64::max)
                .sqrt()
        };
        directed(a, b).max(directed(b, a))
    }

    #[test]
    fn known_values() {
        assert_eq!(hausdorff(&pts(&[(0.0, 0.0)]), &pts(&[(3.0, 4.0)])), 5.0);
        // Directed distances differ (1 vs 0); the symmetric one is their max.
        let a = pts(&[(0.0, 0.0), (1.0, 0.0)]);
        let b = pts(&[(0.0, 0.0)]);
        assert_eq!(hausdorff(&a, &b), 1.0);
        assert_eq!(directed(&b, &PointGrid::new(&a)), 0.0);
        // Concentric squares of side 2 and 4: matching corners are √2 apart.
        let inner = pts(&[(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)]);
        let outer = pts(&[(-2.0, -2.0), (2.0, -2.0), (2.0, 2.0), (-2.0, 2.0)]);
        assert!((hausdorff(&inner, &outer) - 2f64.sqrt()).abs() < 1e-12);
    }

    #[test]
    fn is_symmetric() {
        let mut rng = Rng::new(5);
        let a = rng.points(300, 0.0, 10.0);
        let b = rng.points(200, -2.0, 8.0);
        assert_eq!(hausdorff(&a, &b), hausdorff(&b, &a));
    }

    #[test]
    fn grid_matches_brute_force() {
        let mut rng = Rng::new(11);
        for round in 0..20 {
            let n = 1 + round * 20;
            // Wide, flat clouds stress the grid's non-square cells.
            let a: Vec<Complex> = rng
                .points(n, -50.0, 50.0)
                .into_iter()
                .map(|p| Complex::new(p.re, p.im * 0.1))
                .collect();
            let b = rng.points(n / 2 + 1, -80.0, 20.0);
            assert!((hausdorff(&a, &b) - brute_force(&a, &b)).abs() < 1e-12);
        }
    }

    #[test]
    fn handles_degenerate_point_sets() {
        let line = pts(&[(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0)]);
        let same = pts(&[(1.0, 1.0), (1.0, 1.0)]);
        assert!((hausdorff(&line, &same) - brute_force(&line, &same)).abs() < 1e-12);
    }
}
