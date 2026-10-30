// Escribe en la pizarra de acceso la fecha y la hora de quien entra, con su reloj y su zona horaria.

const greeting = document.querySelector<HTMLElement>("[data-board-greeting]");
const day = document.querySelector<HTMLElement>("[data-board-day]");
const date = document.querySelector<HTMLElement>("[data-board-date]");
const time = document.querySelector<HTMLTimeElement>("[data-board-time]");

const weekdayMonth = new Intl.DateTimeFormat("es", { weekday: "long", month: "long" });
const clock = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function render() {
  const now = new Date();
  const parts = weekdayMonth.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";

  if (greeting) greeting.textContent = getGreeting(now.getHours());
  if (day) day.textContent = String(now.getDate());
  if (date) date.textContent = `${weekday} · ${month}`;
  if (time) {
    time.textContent = clock.format(now);
    time.dateTime = now.toISOString();
  }
}

render();

// Se actualiza justo al cambiar de minuto, y desde ahí cada minuto.
setTimeout(() => {
  render();
  setInterval(render, 60_000);
}, 60_000 - (Date.now() % 60_000));
