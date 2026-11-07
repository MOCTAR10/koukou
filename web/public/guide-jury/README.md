# Guide jury (site statique)

Servi sur https://fermia.greenleaves.ga/guide-jury/ ; `/guide` y redirige (nginx + route `GuideRedirect` dans `src/App.tsx`).

Le contenu (index.html + img/) est GENERE hors depot par `node C:\dev\koukou\guide-jury\artifact\build.mjs`
(lance depuis C:\dev\koukou\guide-jury), puis copie ici. Ne pas editer a la main : regenerer et recopier.
Non precache par le service worker (globIgnores + navigateFallbackDenylist dans `vite.config.ts`).
Charge Tailwind (cdn.tailwindcss.com) et Inter (Google Fonts) : aucun CSP n'est defini cote nginx.
