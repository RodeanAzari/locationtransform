/** Landing-page About section: how it works, the accuracy metric, data, and limitations. */
import { config } from '../config';

export function aboutSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'about';
  section.setAttribute('aria-labelledby', 'about-heading');
  const target = `${config.accuracyTarget * 100}%`;
  section.innerHTML = `
    <h2 id="about-heading">How it works</h2>
    <p>
      Any closed curve, including a country’s border, can be written as a <strong>Fourier series</strong>:
      a sum of arrows that each spin at a constant speed. Placed tip to tail, the arrows sweep out
      circles called <strong>epicycles</strong>, and the tip of the last one traces the border:
    </p>
    <p class="formula">z(t) = c<sub>0</sub> + Σ<sub>k</sub> c<sub>k</sub> e<sup>ikt</sup></p>
    <p>
      Each coefficient c<sub>k</sub> is one arrow: its length is the circle’s radius, its angle is the
      starting position, and k is how many turns it makes per trip around the border. The coefficients
      come from a Fast Fourier Transform of the border, sampled at evenly spaced points. They are
      added largest first, so a handful of circles already gives the rough shape and the slider shows
      the details arriving.
    </p>

    <h2>How accuracy is measured</h2>
    <p>
      The error is the <strong>Hausdorff distance</strong>: the furthest any point of the drawing is from
      the true border, or any point of the border is from the drawing. It is shown as a percentage of the
      place’s size (the diagonal of its bounding box), so a 1 km wobble counts for more in Luxembourg
      than in Russia. <strong>N</strong> is the fewest terms that bring the error to ${target} or less.
    </p>
    <p>
      Coastlines have no true length (the finer you measure, the longer they get), so “accurate” is
      always relative to a particular map. Here the ground truth is the simplified boundary data
      described below.
    </p>

    <h2>Data</h2>
    <ul>
      <li>
        Countries, states and provinces: <a href="https://www.naturalearthdata.com/">Natural Earth</a>
        1:10m (public domain), lightly simplified.
      </li>
      <li>
        Cities and towns: <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>
        (ODbL), found with <a href="https://photon.komoot.io/">Photon / komoot</a> and fetched from
        <a href="https://nominatim.org/">Nominatim</a>.
      </li>
      <li>Places are drawn with an equal-area projection centred on the place itself.</li>
    </ul>

    <h2>Limitations</h2>
    <ul>
      <li>Only outer borders are drawn: holes and enclaves are ignored (South Africa is drawn without the gap for Lesotho).</li>
      <li>
        Small islands (under ${config.islandMinAreaFraction * 100}% of the total area, or beyond the
        ${config.maxRings} largest pieces) are not drawn; the page says how many were left out.
      </li>
      <li>Many towns and villages are mapped in OpenStreetMap as a single point, so they have no border to draw.</li>
      <li>Islands that straddle the 180° meridian are split in the source data and drawn as two pieces.</li>
    </ul>`;
  return section;
}

/** Landing-page footer: source link and data credits. */
export function landingFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'attribution';
  footer.innerHTML = `
    Data: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain) ·
    © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL) ·
    Search by <a href="https://photon.komoot.io/">Photon / komoot</a>`;
  return footer;
}

/** "View source on GitHub" button. */
export function githubButton(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'github-button';
  link.href = config.githubUrl;
  link.rel = 'noopener';
  link.innerHTML = `
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    View source on GitHub`;
  return link;
}
