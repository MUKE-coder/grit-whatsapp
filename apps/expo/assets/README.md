# App icons

These four files are placeholders, drawn at scaffold time from this project's
accent colour. Replace them before you ship.

| File                 | What it is                                   | Size      |
| -------------------- | -------------------------------------------- | --------- |
| `icon.png`           | The home screen icon, iOS and Android        | 1024x1024 |
| `adaptive-icon.png`  | The Android foreground layer                 | 1024x1024 |
| `splash.png`         | The launch screen                            | 1024x1024 |
| `favicon.png`        | The browser tab, for `expo start --web`      | 48x48 up  |

Their names and the colours behind them are set in `app.json`. The sign-in and
sign-up screens do not use these files: they draw this project's initial from
`lib/brand.ts`, which reads the name out of `app.json`.
