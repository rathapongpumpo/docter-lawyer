# IBM Plex Sans Thai + IBM Plex Mono

- Files: `IBMPlexSansThai-{Regular,Medium,SemiBold,Bold}.woff2`, `IBMPlexMono-{Regular,Medium,SemiBold}.woff2`
- Source: Google Fonts (https://fonts.google.com/specimen/IBM+Plex+Sans+Thai, https://fonts.google.com/specimen/IBM+Plex+Mono),
  TTFs from fonts.gstatic.com downloaded 2026-10-01 and converted to WOFF2 with fontTools (glyphs unchanged)
- License: SIL Open Font License 1.1 — free to embed and redistribute; keep this file with the fonts.
- Used via `next/font/local` in `app/layout.tsx` (CSS variables `--font-plex-thai`, `--font-plex-mono` → Tailwind `font-sans`/`font-serif`/`font-mono`).
- The generated DOCX/PDF documents (AI service, `ai/app/docgen/fonts`) still use TH Sarabun New — that is the official-letter typeface, separate from the web UI.
