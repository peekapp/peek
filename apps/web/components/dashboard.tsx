import { demoScreen, type ScreenEvent } from "../lib/demo-screen";

function Owner({ owner }: { owner: ScreenEvent["owner"] }) {
  return (
    <span className={`owner owner--${owner.color}`}>
      <i aria-hidden="true" />
      {owner.name}
    </span>
  );
}

export function Dashboard() {
  const { meeting, events } = demoScreen;
  const [minutes, seconds] = meeting.countdown.split(":");

  return (
    <main className="dashboard">
      <header className="screen-header">
        <div className="brand">
          {/* Local vector: no image transformation is needed. */}
          <img src="/peek-mark.svg" alt="" width={28} height={33} />
          <span>peek</span>
        </div>
        <div className="clock">
          <span>{demoScreen.date}</span>
          <strong>{demoScreen.time}</strong>
        </div>
      </header>
      <section className="feed" aria-label="Актуальные события">
        <article className="hero">
          <div className="hero-meta">
            <Owner owner={meeting.owner} />
            <span className="meeting-time">{meeting.time}</span>
          </div>
          <div className="timer">
            <span>До встречи</span>
            <strong>
              {minutes}
              <span>:</span>
              {seconds}
            </strong>
          </div>
          <div className="hero-title">
            <h1>{meeting.title}</h1>
            <span className="source">{meeting.location}</span>
          </div>
        </article>
        <div className="secondary">
          {events.map((event) => (
            <article
              className={`event${event.remaining ? " event--today" : ""}`}
              key={event.id}
            >
              <div className="event-meta">
                <Owner owner={event.owner} />
                <span className="due">{event.due}</span>
              </div>
              <h2>{event.title}</h2>
              {event.remaining ? (
                <span className="remaining">{event.remaining}</span>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <footer className="screen-footer">
        Демо · время и события зафиксированы
      </footer>
    </main>
  );
}
