# Webpack 4 Compatibility Setup

This project demonstrates how to configure `markstream-vue2` to work with Vue CLI (which uses Webpack 4 by default).

## The Problem

Many modern npm packages (like `@antv/infographic`, `measury`, `shiki`) use the `package.json` `exports` field to define subpath exports. However, **Webpack 4 does not support the `exports` field**, which was introduced in Webpack 5. Additionally, pnpm uses symlinks for dependency management, which can cause additional resolution issues in Webpack 4.

## Solution

The `vue.config.js` file contains the necessary configuration to work around these Webpack 4 limitations:

```js
const path = require('node:path')

module.exports = {
  transpileDependencies: [
    'markstream-vue2',
    'stream-markdown-parser',
    'stream-monaco',
    '@antv/infographic',
    'measury',
    'mermaid'
  ],
  configureWebpack: {
    resolve: {
      // Add pnpm store paths to module resolution
      modules: [
        'node_modules',
        path.resolve(__dirname, '../node_modules')
      ],
      alias: {
        // Webpack 4 doesn't support package.json exports field.
        // These aliases help resolve subpath exports.
        'measury/fonts/AlibabaPuHuiTi-Regular': path.resolve(__dirname, '../node_modules/.pnpm/measury@0.1.4/node_modules/measury/lib/fonts/AlibabaPuHuiTi-Regular.js'),
        '@antv/infographic/jsx-runtime': path.resolve(__dirname, '../node_modules/.pnpm/@antv+infographic@0.2.3/node_modules/@antv/infographic/esm/jsx-runtime.js'),
        '@antv/infographic/jsx-dev-runtime': path.resolve(__dirname, '../node_modules/.pnpm/@antv+infographic@0.2.3/node_modules/@antv/infographic/esm/jsx-dev-runtime.js'),
        '@mermaid-js/parser': path.resolve(__dirname, '../node_modules/.pnpm/@mermaid-js+parser@0.6.3/node_modules/@mermaid-js/parser')
      },
      symlinks: false
    }
  },
  chainWebpack: (config) => {
    // Disable eslint to avoid linting dist files
    config.module.rules.delete('eslint')
  }
}
```

## Key Points

1. **`transpileDependencies`**: Add packages that use ES2020+ syntax (like `??`, optional chaining) so Babel can transpile them for older browsers.

2. **`resolve.modules`**: Add the parent `node_modules` directory to the module search path since pnpm stores packages differently.

3. **`resolve.alias`**: Manually map subpath exports to their actual file locations since Webpack 4 can't resolve them through `package.json` exports.

4. **`resolve.symlinks: false`**: This helps Webpack resolve pnpm's symlink structure correctly.

## Recommended Approach

For production projects using Vue CLI, consider **upgrading to Webpack 5** or using **Vite** instead, as they have better support for modern npm package features. You can:

1. Upgrade to Vue CLI 5+ (which uses Webpack 5)
2. Migrate to Vite (which has native ESM support and better package resolution)

## Alternative: Use Webpack 5 Plugin

If you need to stay on Webpack 4, you can use the `exports-field` plugin to add support for the `package.json` exports field:

```bash
npm install --save-dev webpack-exports-field
```

Then add to your `vue.config.js`:

```js
const ExportsFieldPlugin = require('webpack-exports-field')

module.exports = {
  configureWebpack: {
    plugins: [
      new ExportsFieldPlugin()
    ]
  }
}
```

Note: This plugin may not cover all cases, so manual aliases may still be needed.
