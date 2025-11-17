# Deploying the docs (GitHub Pages / Netlify)

We provide a CI sample for GitHub Pages in `.github/workflows/deploy-docs.yml`. It builds the VitePress site and publishes `docs/.vitepress/dist` to `gh-pages`.

GitHub Pages notes:

- To host at `https://USERNAME.github.io/REPO/`, set `base: "/REPO/"` in `docs/.vitepress/config.ts`.
- The provided GitHub Action uses `peaceiris/actions-gh-pages` to publish. Set up a branch if your repo uses different publishing rules.

Netlify / Vercel:

- Set the build command to: `pnpm docs:build`
- Set the publish directory to: `docs/.vitepress/dist`

Netlify specifics:

- Engine: Node 18+ (Netlify uses `NODE_VERSION` from `netlify.toml` or set `NODE_VERSION` in site settings)
- Use `VITEPRESS_BASE=/` if your Netlify site is hosted at a root domain; otherwise add `VITEPRESS_BASE=/repo-name/` for sub-path deployments (e.g., GitHub Pages). You can set this as a Netlify environment variable in Site settings -> Build & deploy -> Environment.
- To keep the `playground/` site available for preview builds, configure a `[context.deploy-preview]` in `netlify.toml` with `command: pnpm run play:build` and `publish: playground/dist`.

Tricks:

- Use `docs:build` in your CI to catch build-time issues early
- Keep dev-only assets out of `docs/.vitepress/public` if they are large; instead store them in `public/` and reference by absolute path
