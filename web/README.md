# NEPH.GG — Web

Perfiles públicos de VALORANT. Next.js (App Router) con la misma temática dark
minimalista que la app de escritorio.

## Desarrollo

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Sin configurar nada funciona en **modo demo** (datos de ejemplo en los perfiles).

## Datos reales (HenrikDev API)

1. Pide una API key gratis en el Discord de HenrikDev (https://docs.henrikdev.xyz).
2. Copia `.env.example` a `.env.local` y pon la key en `HENRIK_API_KEY`.
3. Reinicia el dev server. Los perfiles (`/player/Nombre-TAG`) mostrarán datos reales.

## Estructura

```
app/
  page.tsx                Landing (hero, buscador, características)
  player/[riotId]/        Perfil público de un jugador
  components/SearchForm   Buscador Nombre#TAG
lib/
  henrik.ts               Capa de datos (HenrikDev API + modo demo)
  types.ts                Tipos compartidos de la web
```

## Fases siguientes

- **Supabase**: guardar cada perfil/partida consultada → historial ilimitado,
  refresco on-demand + cron con prioridades (la web lee siempre de la DB).
- **Deploy**: Vercel (`vercel --prod` desde `web/`), dominio neph.gg.
- **Gráficas**: evolución de RR, winrate por mapa/agente.
