import { SearchForm } from './components/SearchForm'

export default function HomePage(): JSX.Element {
  return (
    <>
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Perfiles web en desarrollo
        </div>
        <h1>
          Tu historial de VALORANT,
          <br />
          <em>para siempre.</em>
        </h1>
        <p className="hero-sub">
          Riot solo guarda tus últimas partidas. NEPH.GG las acumula todas: rangos,
          evolución de RR y estadísticas que crecen contigo, partida a partida.
        </p>
        <SearchForm />
      </section>

      <section className="features" id="features">
        <div className="feature-card">
          <div className="feature-tag">App de escritorio</div>
          <h3>Partida en vivo</h3>
          <p>
            Rangos, RR, picos históricos y grupos de los 10 jugadores mientras juegas.
            Datos que ninguna web puede darte, directo del cliente del juego.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-tag">Web</div>
          <h3>Historial ilimitado</h3>
          <p>
            Cada partida queda guardada. Gráficas de RR por meses, winrate por mapa y
            agente, y estadísticas que van más allá de las últimas 20 partidas.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-tag">Perfiles</div>
          <h3>Comparte tu perfil</h3>
          <p>
            Un enlace público con tu rango, tus stats y tu progreso. Busca a cualquier
            jugador por su Riot ID y mira cómo va.
          </p>
        </div>
      </section>

      <section className="app-section" id="app">
        <h2>La app de escritorio</h2>
        <p>
          NEPH.GG para Windows detecta tus partidas automáticamente y muestra la
          información de todos los jugadores en tiempo real. Sin contraseñas, sin
          configurar nada: ábrela y juega.
        </p>
        <a
          className="btn"
          href="https://github.com/slvdrfrs/neph"
          target="_blank"
          rel="noreferrer"
        >
          Ver en GitHub
        </a>
      </section>
    </>
  )
}
