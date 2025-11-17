# Deploying the docs (GitHub Pages / Netlify)

We provide a CI sample for GitHub Pages in `.github/workflows/deploy-docs.yml`. It builds the VitePress site and publishes `docs/.vitepress/dist` to `gh-pages`.

GitHub Pages notes:

- To host at `https://USERNAME.github.io/REPO/`, set `base: "/REPO/"` in `docs/.vitepress/config.ts`.
- The provided GitHub Action uses `peaceiris/actions-gh-pages` to publish. Set up a branch if your repo uses different publishing rules.

Netlify / Vercel:

- Set the build command to: `pnpm docs:build`
- Set the publish directory to: `docs/.vitepress/dist`

Tricks:

- Use `docs:build` in your CI to catch build-time issues early
- Keep dev-only assets out of `docs/.vitepress/public` if they are large; instead store them in `public/` and reference by absolute path
