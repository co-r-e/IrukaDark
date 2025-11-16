# Code Style and Formatting

This project uses Prettier and ESLint for consistent code style.

- Run `npm run format` to format JS/HTML/CSS/JSON/MD files.
- Run `npm run format:check` in CI or locally to verify formatting.
- Run `npm run lint` for static checks; `npm run lint:fix` to auto‑fix.

If dependencies are not installed yet:

```
npm i -D prettier eslint eslint-config-prettier eslint-plugin-import
```

Editor settings are defined by `.editorconfig`.

## UI Design Guidelines

### Button Hover Effects

**禁止事項:**

- ボタンのホバーエフェクトで「ふわっと浮かび上がるエフェクト」を実装しないこと
  - `transform: translateY()`を使った垂直移動
  - `box-shadow`を強調した3D浮き上がり効果
  - その他、ボタンが画面から浮き上がるような視覚効果

**推奨される代替手法:**

- 色の変更（`background-color`, `color`）
- 透明度の変更（`opacity`）
- ボーダーの変更（`border-color`）
- カーソルの変更（`cursor: pointer`）
- スケールの微調整（必要な場合のみ、`transform: scale(1.02)`程度）
