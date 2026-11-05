# Beat Uploader

Windows app on Electron. Code comments and source strings are in Russian.

## After every update

The owner asked for every update to be recorded on GitHub:

1. Raise `version` in `package.json`.
2. Add the changes to both `CHANGELOG.md` and `CHANGELOG.ru.md`, in plain words for a non-programmer.
3. If features changed, update both `README.md` and `README.ru.md`.
4. Commit and push.
5. Build the installer and create a GitHub Release named after the version, with the notes in both languages and `Beat Uploader Setup.exe` attached.

## Rules

- New interface text goes in Russian in the code, with its English translation in `src/shared/i18n.js`. `npm test` fails if a translation is missing.
- Never commit secrets. Keys and channel access live only in `%APPDATA%\beat-uploader`.
- `npm run dist` fails on paths with Cyrillic characters, because NSIS cannot read them. Copy `src`, `build`, `node_modules`, `package.json` and `package-lock.json` to a Latin-only path and build there.
- `site/` is the public home page and privacy policy that Google requires for production mode. Do not delete the deployed Cloudflare Worker. Update the policy if the app starts sending data somewhere new.
