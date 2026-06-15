# Social preview (Open Graph image)

Add a `1280×640` PNG as the repository's social preview
(GitHub → Settings → Social preview) and as the `og:image` on the docs site.

## Recommended composition

- **Background:** deep navy `#0b1020` (matches `docs/architecture.svg`).
- **Headline (top-left, ~64px, weight 800, #f8fafc):**
  "Never let a single failed remote take down your shell."
- **Subhead (~30px, #93a4c8):**
  "federation-resilience — retry · cache-bust · fallback · idle prefetch · telemetry for Module Federation."
- **Visual (right/center):** the primary lane from `docs/architecture.svg` —
  Host → ✗ → backoff+bust → ✗ → fallback → ♥ host alive. Use the same accent
  colors: blue `#3b82f6`, amber `#f59e0b`, red `#ef4444`, purple `#a855f7`,
  green `#22c55e`.
- **Footer chips (#c7d2fe):** `module-federation` · `micro-frontends` ·
  `loadRemote` · `error-recovery`.

## Meta tags

```html
<meta property="og:title" content="federation-resilience — never let a failed Module Federation remote crash your shell" />
<meta property="og:description" content="Retry, cache-busted dynamic-import recovery, deterministic fallback, idle prefetch, and telemetry hooks for Module Federation remotes. Framework-agnostic + React." />
<meta property="og:image" content="https://RomanFedytskyi.github.io/federation-resilience/og.png" />
<meta name="twitter:card" content="summary_large_image" />
```

## Generating the PNG

`docs/architecture.svg` is self-contained; render a static frame and compose the
headline over it (any vector tool, or `cairosvg architecture.svg -o frame.png`).
Export at exactly 1280×640.
