export function SettingsPage(): JSX.Element {
  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>Acerca de NEPH.GG</h2>
      </div>

      <div className="about-card">
        <h3>¿Cómo funciona?</h3>
        <p>
          NEPH.GG se conecta a la <strong>API local del cliente de Riot</strong> que corre en
          tu propio PC (la misma técnica que usan herramientas como VALORANT-rank-yoinker).
          No necesita tu contraseña ni una API key oficial: solo lee los datos de la sesión
          que ya tienes abierta.
        </p>

        <h3>Funciones</h3>
        <ul>
          <li>Detección automática del estado del juego (menús, selección de agentes, partida).</li>
          <li>Rangos, RR, rango máximo y niveles de los 10 jugadores en vivo.</li>
          <li>Identifica a los jugadores en modo incógnito mostrando su agente.</li>
          <li>Detección de grupos (parties) mediante presencias.</li>
          <li>Historial de partidas con KDA, resultado y RR ganado/perdido.</li>
          <li>Perfil competitivo con evolución de RR.</li>
        </ul>

        <h3>Aviso</h3>
        <p className="muted">
          NEPH.GG no está afiliado a Riot Games ni respaldado por ellos. VALORANT y Riot
          Games son marcas registradas de Riot Games, Inc. Esta herramienta solo lee datos;
          no interactúa con el juego ni proporciona ventajas dentro de la partida.
        </p>

        <h3>Datos estáticos</h3>
        <p className="muted">
          Iconos de agentes, rangos y mapas proporcionados por{' '}
          <a href="https://valorant-api.com" target="_blank" rel="noreferrer">
            valorant-api.com
          </a>
          .
        </p>
      </div>
    </div>
  )
}
