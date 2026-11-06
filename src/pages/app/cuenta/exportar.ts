// GET /app/cuenta/exportar: descarga tus datos en JSON. El middleware exige la sesión y el segundo paso.
import type { APIRoute } from "astro";
import { exportMyData } from "@/data/queries";
import { today } from "@/lib/dates";

export const GET: APIRoute = async ({ locals }) =>
  new Response(JSON.stringify(await exportMyData(locals), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="caja-simple-${today()}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
