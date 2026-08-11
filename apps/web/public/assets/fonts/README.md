# Self-hosted type

Three faces, two superfamilies, latin subset only. Both families are SIL Open
Font License 1.1 — the licence text is beside the files.

| File | Upstream package | Axes / weight |
| --- | --- | --- |
| `fraunces-variable-latin-v5.woff2` | `@fontsource-variable/fraunces` → `files/fraunces-latin-full-normal.woff2` | `wght` 100–900, `opsz` 9–144, `SOFT` 0–100, `WONK` 0–1 |
| `ibm-plex-sans-variable-latin-v5.woff2` | `@fontsource-variable/ibm-plex-sans` → `files/ibm-plex-sans-latin-wght-normal.woff2` | `wght` 100–700 |
| `ibm-plex-mono-{400,500,600}-latin-v5.woff2` | `@fontsource/ibm-plex-mono` → `files/ibm-plex-mono-latin-{400,500,600}-normal.woff2` | static; IBM Plex Mono has no variable build |

## Why the files are copied rather than `@import`ed

The `@font-face` block lives in `src/styles/globals.css` and points at these
paths. Importing the packages' own CSS instead would work, but it puts the
files through Vite's asset pipeline, which hashes their names — and a hashed
name cannot be written into a `<link rel="preload">` in `index.html` at
authoring time. Preload is the whole point: without it the browser does not
discover the font until it has parsed the stylesheet, which is a visible flash
of the fallback stack on every cold load.

`/assets/` is also the one path already excluded from the SPA rewrite and
already carrying an immutable cache header, so these get both for free. The
`-v5` suffix is the version stamp that makes "immutable" safe: a new cut of a
face is a new filename, never a new body for an old one.

## Only latin ships

The packages carry cyrillic, greek, vietnamese and latin-ext as well. The
portal is English-only and the previous set of faces was shipping every subset
of every weight — about a megabyte of glyphs nobody in this product renders.

## Replacing a file

Reinstall the package, copy the file listed above under a bumped `-vN` name,
update `globals.css` and the two `<link rel="preload">` tags in `index.html`,
and delete the old file. The three npm packages stay in `package.json` as the
provenance of these bytes.
