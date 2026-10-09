# Kylo — Playwright E2E testy

## Spuštění na počítači
```bash
npm install
npx playwright install chromium webkit
npm run test:e2e
```

`npm run test:e2e:list` zobrazí scénáře bez spuštění prohlížeče.

## Pokrytí
- Přihlášení (správné a nesprávné údaje)
- Dashboard, graf hmotnosti a termíny
- Navigace Domů / Historie / Kalendář / Profil
- Přidání vážení a zobrazení v historii
- Detail záznamu a editační ovládací prvky
- Přechod mezi měsíci a výběr dne
- Nastavení upozornění a odkaz Tractive
- Základní kontrola překrývání názvu a data v historii

Každý scénář běží v desktopovém Chromiu, mobilním WebKitu s viewportem iPhone 16 Pro (402 × 874) a iPhone 16 Plus (430 × 932).

## Bezpečnost
Testy používají **lokální HTTP server** a **izolované mockované API**. Neodesílají změny do produkčního Neonu a nepotřebují skutečné uživatelské údaje.

## Automatizace
`.github/workflows/e2e.yml` je připraven pro GitHub Actions. Začne fungovat po uložení projektu do propojeného GitHub repozitáře. Produkční Vercel build nadále spouští 65 unit/integračních testů a navíc kontroluje, že Playwright scénáře lze načíst.

## Co není zatím ověřeno
E2E testy nebyly dosud skutečně spuštěny v prohlížeči v CI; nasazení na Vercel provádí pouze jejich kontrolu/discovery. WebKit v Linuxu simuluje mobilní Safari, ale nenahrazuje test na fyzickém iPhonu. Skutečné push notifikace a integrace s produkčním Neonem nejsou předmětem těchto izolovaných testů.
