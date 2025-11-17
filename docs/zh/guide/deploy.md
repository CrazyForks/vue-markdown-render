# 部署文档

示例 GitHub Actions workflow: `.github/workflows/deploy-docs.yml` 已经包含基本的自动部署到 GitHub Pages 的配置。请参考该文件并配置分支/仓库设置。

Netlify / Vercel：

- Build command: `pnpm docs:build`
- Publish dir: `docs/.vitepress/dist`

如果需要自定义 `base` 路径（例如在 `USERNAME/REPO` 下托管），请在 `docs/.vitepress/config.ts` 中设置 `base` 参数。
