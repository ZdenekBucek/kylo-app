# Kylo – automatické testy

## Spuštění
- npm test – všechny testy
- npm run test:unit – datumy, výpočty, graf, formuláře, profil a kalendář
- npm run test:integration – API + simulovaný PostgreSQL a interakce obrazovek
- npm run test:security – přihlášení, role, ochrana endpointů
- npm run test:smoke – PWA manifest, načítání UI, syntaktická kontrola a SW
- npm run test:ci – syntaktická kontrola + kompletní test suite

## Nasazování
Vercel při každém buildu spustí syntax check a všechny testy.
Pokud test selže, nasazení se zastaví.

## Rozsah
- Unit testy používají izolované funkce skutečného frontendového JavaScriptu.
- Integrační testy volají skutečné API handlery a nahrazují Neon/Web Push kontrolovanými mocky.
- UI integrační testy simulují DOM události a testují reálný render Dashboardu, historie a kalendáře.
- Bezpečnostní testy ověřují přístupová práva a ochranu přihlašování.
- Smoke testy kontrolují manifest, načítání skriptů a service worker.

## Co zatím testy nepokrývají
- Skutečné PostgreSQL transakce na oddělené testovací databázi.
- End-to-end test v reálném Safari na iPhonu a skutečné doručení push notifikace.
- Automatický test obnovy databáze ze zálohy.
Tyto scénáře vyžadují izolované testovací prostředí nebo zařízení. Testy nikdy nezapisují do produkční databáze.
