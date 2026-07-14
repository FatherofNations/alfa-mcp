# __PROJECT_TITLE__

Интерактивный прототип по Figma-макету. Создан из шаблона
[proto-forge](https://github.com/FatherofNations/proto-forge).

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # parity-QA (при запущенном сервере)
```

Дальнейшие шаги после скаффолда:

1. `install_fonts` — шрифты дизайн-системы → `public/fonts`, `styles/fonts.css`
2. `get_variable_defs` (Figma MCP) → `extract_tokens` → `styles/tokens.css`
3. Разбор макета и вёрстка — читать `proto://knowledge/figma-import`
   и `proto://knowledge/pixel-perfect`
4. Анимации — только канон: `proto://knowledge/animation-canon` / `add_animation`
5. Перед сдачей — `npm run verify` и чек-лист `get_checklist(stage: "qa")`

Handoff-документ: [HANDOFF.md](HANDOFF.md).
