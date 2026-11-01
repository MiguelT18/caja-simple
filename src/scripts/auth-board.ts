// Escribe en la pizarra de acceso el saludo según la hora de quien entra, con su reloj y su zona horaria.

const greeting = document.querySelector<HTMLElement>("[data-board-greeting]");

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

if (greeting) greeting.textContent = getGreeting(new Date().getHours());
