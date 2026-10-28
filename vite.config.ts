import { defineConfig } from 'vite';

// Public base path. Production is served from a subdomain root ("/"); set BASE_PATH
// (e.g. "/locationtransform/") to build for a subpath.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  worker: { format: 'es' },
});
