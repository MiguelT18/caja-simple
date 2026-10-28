// Validación en el navegador de los formularios de acceso.
// Los mensajes de cada campo vienen de sus atributos data-*:
//   data-required-message  → campo vacío
//   data-minlength-message → menos caracteres que `minlength`
//   data-match / data-match-message → debe coincidir con el campo de ese `name`

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONNECTED_MESSAGE = "La autenticación aún no está conectada. Pronto podrás ingresar.";

const notice = document.querySelector<HTMLElement>("[data-auth-notice]");

function showNotice(message: string) {
  if (notice) notice.textContent = message;
}

function getError(input: HTMLInputElement, form: HTMLFormElement): string {
  const value = input.value.trim();

  if (!value) return input.dataset.requiredMessage ?? "Completa este campo";

  if (input.type === "email" && !EMAIL_PATTERN.test(value)) {
    return "Ingresa un correo válido, por ejemplo nombre@correo.com";
  }

  if (input.minLength > 0 && input.value.length < input.minLength) {
    return input.dataset.minlengthMessage ?? `Debe tener al menos ${input.minLength} caracteres`;
  }

  if (input.dataset.match) {
    const other = form.elements.namedItem(input.dataset.match) as HTMLInputElement | null;
    if (other && input.value !== other.value) {
      return input.dataset.matchMessage ?? "Los valores no coinciden";
    }
  }

  return "";
}

function validate(input: HTMLInputElement, form: HTMLFormElement): boolean {
  const error = getError(input, form);
  const errorElement = document.getElementById(`${input.id}-error`);

  if (error) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  if (errorElement) errorElement.textContent = error;

  return !error;
}

document.querySelectorAll<HTMLFormElement>("form[data-auth-form]").forEach((form) => {
  const inputs = [...form.querySelectorAll<HTMLInputElement>("input.input")];

  inputs.forEach((input) => {
    // Al salir de un campo solo se valida si ya tiene algo escrito, para no marcar error antes de tiempo.
    input.addEventListener("blur", () => {
      if (input.value) validate(input, form);
    });

    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") validate(input, form);

      // Si cambia la contraseña, se revisa de nuevo el campo que debe coincidir con ella.
      inputs
        .filter((other) => other.dataset.match === input.name && other.value)
        .forEach((other) => validate(other, form));
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const invalid = inputs.filter((input) => !validate(input, form));
    if (invalid.length > 0) {
      invalid[0].focus();
      return;
    }

    // TODO: conectar con el proveedor de autenticación.
    showNotice(NOT_CONNECTED_MESSAGE);
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-google-auth]").forEach((button) => {
  // TODO: conectar con el proveedor de autenticación (OAuth de Google).
  button.addEventListener("click", () => showNotice(NOT_CONNECTED_MESSAGE));
});
