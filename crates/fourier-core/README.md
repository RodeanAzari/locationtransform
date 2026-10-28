# fourier-core

The math half of Fourier Borders, in Rust, compiled to WebAssembly with `wasm-pack --target web` and called from the app's web worker.

Given one projected ring of a place's border, it:

1. **Resamples** the ring uniformly by arc length to M points (M a power of two, scaled with perimeter).
2. Runs a radix-2 **FFT** to get coefficients c_k for k = −M/2 … M/2−1, so that z(t) = c₀ + Σ c_k e^{ikt}.
3. **Sorts** the non-zero-frequency terms by amplitude, largest first.
4. **Finds N**, the smallest term count whose reconstruction is within the target **normalized Hausdorff distance** of the resampled ring. This uses a binary search, then steps forward with a lookahead because the error isn't strictly monotone. N is capped at M/2.
5. Samples the **error curve** (log-spaced term counts from 1 to N) for the slider readout.

## JS ↔ WASM boundary

Only typed arrays and numbers cross the boundary.

```ts
import init, { Options, analyzeRing } from 'fourier-core';

await init();
const options = new Options(
  placeDiagonal, // km, bounding-box diagonal of the whole place (all kept rings)
  target,        // normalized Hausdorff target, e.g. 0.001
  minSamples,    // power of two, e.g. 256
  maxSamples,    // power of two, e.g. 4096
  sampleSpacing, // resample spacing as a fraction of placeDiagonal, e.g. 0.0005
  lookahead,     // term counts after N that must also meet the target, e.g. 3
  curveSamples,  // approximate number of error-curve samples, e.g. 48
);
const ring = analyzeRing(xy /* Float64Array: x0, y0, x1, y1, … in km */, options);
```

`analyzeRing` throws if the ring has fewer than 3 points, has zero perimeter, or the options are out of range.

| `RingAnalysis` getter | Type | Meaning |
| --- | --- | --- |
| `sampleCount` | `number` | M |
| `resampledXy` | `Float64Array` (2M) | The resampled true ring, used for the ghost outline |
| `c0Re`, `c0Im` | `number` | Centre coefficient c₀ |
| `n` | `number` | N for this ring (terms excluding c₀) |
| `termK` | `Int32Array` (N) | Frequencies, largest amplitude first |
| `termRe`, `termIm` | `Float64Array` (N) | Coefficients, same order as `termK` |
| `error` | `number` | Normalized Hausdorff error at N |
| `targetReached` | `boolean` | `false` only if N hit the cap of M/2 |
| `curveN` | `Uint32Array` | Term counts where the error was sampled: ascending, 1 … N, including 1, 3, 10, 50 |
| `curveError` | `Float64Array` | Normalized error at each `curveN` |

Each getter returns a fresh copy. `Options` and `RingAnalysis` live in WASM memory, so call `.free()` on them when you're done (or use `using` with `Symbol.dispose`).

Coordinates go in already projected. Projection, the antimeridian fix, island filtering and ring orientation are handled on the TypeScript side.

## Accuracy metric

The error is the symmetric discrete Hausdorff distance between the reconstruction (evaluated at the M sample parameters) and the resampled ring, divided by `placeDiagonal`. Normalizing by the whole place's size, not each ring's, keeps tiny islands from demanding huge term counts.

Nearest-neighbour lookups use a uniform grid with about one point per cell, so each error evaluation is O(M log M) for the inverse FFT plus roughly O(M) for the Hausdorff distance. A 4096-sample ring is analyzed in about 50 ms natively.

## Development

```sh
cargo test                                     # native unit tests
wasm-pack test --node crates/fourier-core      # WASM smoke test
wasm-pack build crates/fourier-core --target web --release
```

There are no dependencies besides `wasm-bindgen`. The FFT is a hand-written radix-2 Cooley–Tukey, tested against a naive DFT.
