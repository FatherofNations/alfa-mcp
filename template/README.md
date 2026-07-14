# __PROJECT_TITLE__

Интерактивный прототип по Figma-макету. Создан из шаблона
[proto-forge](https://github.com/FatherofNations/proto-forge).

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # parity-QA (при запущенном сервере)
```

Дальнейшие шаги после скаффолда (шрифты дизайн-системы уже установлены):

1. `get_variable_defs` (Figma MCP) → `extract_tokens` → `styles/tokens.css`
2. Разбор макета — читать `proto://knowledge/figma-import`
   и `proto://knowledge/pixel-perfect`
3. Ассеты: один батч `download_assets` (Figma MCP) в `public/assets/figma`
   → сразу `process_assets`
4. Анимации — только канон: `proto://knowledge/animation-canon` / `add_animation`
5. Перед сдачей — `npm run verify` и чек-лист `get_checklist(stage: "qa")`

Handoff-документ: [HANDOFF.md](HANDOFF.md).
