//! Minimal complex number type used throughout the crate.

use std::ops::{Add, Mul, Sub};

/// A complex number `re + i·im`, also used as a 2D point `(x, y)`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Complex {
    pub re: f64,
    pub im: f64,
}

impl Complex {
    pub const ZERO: Complex = Complex::new(0.0, 0.0);

    pub const fn new(re: f64, im: f64) -> Self {
        Complex { re, im }
    }

    /// `r · e^{iθ}`.
    pub fn from_polar(r: f64, theta: f64) -> Self {
        Complex::new(r * theta.cos(), r * theta.sin())
    }

    /// Magnitude `|z|`.
    pub fn norm(self) -> f64 {
        self.re.hypot(self.im)
    }

    pub fn scale(self, s: f64) -> Self {
        Complex::new(self.re * s, self.im * s)
    }

    /// Squared Euclidean distance between two points.
    pub fn dist_sq(self, other: Complex) -> f64 {
        let d = self - other;
        d.re * d.re + d.im * d.im
    }
}

impl Add for Complex {
    type Output = Complex;
    fn add(self, rhs: Complex) -> Complex {
        Complex::new(self.re + rhs.re, self.im + rhs.im)
    }
}

impl Sub for Complex {
    type Output = Complex;
    fn sub(self, rhs: Complex) -> Complex {
        Complex::new(self.re - rhs.re, self.im - rhs.im)
    }
}

impl Mul for Complex {
    type Output = Complex;
    fn mul(self, rhs: Complex) -> Complex {
        Complex::new(
            self.re * rhs.re - self.im * rhs.im,
            self.re * rhs.im + self.im * rhs.re,
        )
    }
}
