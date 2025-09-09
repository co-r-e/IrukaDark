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
