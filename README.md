# NEPH.GG

Tracker de escritorio para **VALORANT** con interfaz profesional, inspirado en Blitz / tracker.gg.
Usa la **API local del cliente de Riot** (la misma técnica que
[VALORANT-rank-yoinker](https://github.com/zayKenyon/VALORANT-rank-yoinker)), así que **no
necesita API key oficial** ni tu contraseña: lee la sesión que ya tienes abierta en tu PC.

## Funciones

- 🎮 **Detección automática** del estado del juego: menús → selección de agentes → en partida.
- ⚔ **Partida en vivo**: rango actual, RR, rango máximo histórico y nivel de los 10 jugadores.
- 🕵️ **Revela nombres ocultos** (modo incógnito) de aliados y rivales.
- 👥 **Detección de grupos (parties)** con puntos de color por grupo.
- 🕘 **Historial de partidas**: mapa, modo, KDA, resultado, duración y RR ganado/perdido.
- 📈 **Perfil competitivo**: rango, RR, rango máximo y evolución de RR de las últimas partidas.
- 🌎 Detección automática de región/shard e interfaz en español.

## Requisitos

- Windows con VALORANT instalado.
- Node.js 18+ (solo para desarrollo).

## Desarrollo

```bash
npm install
npm run dev        # abre la app con hot-reload
```

## Compilar el instalador

```bash
npm run dist       # genera instalador NSIS y .exe portable en dist/
```

## Arquitectura

```
src/
  main/            Proceso principal de Electron
    riot/
      lockfile.ts      Lee el lockfile del Riot Client (puerto + contraseña)
      localClient.ts   API local (tokens, presencias)
      remoteClient.ts  Servidores pd/glz/shared (MMR, partidas, nombres)
      region.ts        Detección de región desde ShooterGame.log
      staticData.ts    Agentes/rangos/mapas desde valorant-api.com (es-ES)
      service.ts       Orquestador: sondeo, caché y ensamblado de datos
  preload/         Puente seguro (contextBridge) entre main y renderer
  renderer/        Interfaz React (Live, Historial, Perfil, Acerca de)
  shared/          Tipos TypeScript compartidos
```

## Aviso

ValTrack no está afiliado a Riot Games. VALORANT es una marca de Riot Games, Inc.
La herramienta solo **lee** datos de tu sesión local; no interactúa con el juego.
Como cualquier herramienta de este tipo, úsala bajo tu propia responsabilidad.
