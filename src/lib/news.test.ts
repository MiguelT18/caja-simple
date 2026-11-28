import { describe, expect, it } from "vitest";
import { notesFor, unseenNotes, type Audience } from "./news";

const note = (id: string, date: string, para: Audience = "todos") => ({ id, date, para });
const notes = [note("a", "2026-10-01"), note("b", "2026-11-28", "dueña"), note("c", "2026-11-15", "empleada")];

describe("notesFor", () => {
  it("filtra por rol y ordena de la más nueva a la más vieja", () => {
    expect(notesFor(notes, { owner: true, employee: false }).map((n) => n.id)).toEqual(["b", "a"]);
    expect(notesFor(notes, { owner: false, employee: true }).map((n) => n.id)).toEqual(["c", "a"]);
    expect(notesFor(notes, { owner: true, employee: true }).map((n) => n.id)).toEqual(["b", "c", "a"]);
    expect(notesFor(notes, { owner: false, employee: false }).map((n) => n.id)).toEqual(["a"]);
  });
});

describe("unseenNotes", () => {
  const sorted = notesFor(notes, { owner: true, employee: true });
  it("sin cookie (o dañada), solo la más nueva", () => {
    expect(unseenNotes(sorted).map((n) => n.id)).toEqual(["b"]);
    expect(unseenNotes(sorted, "basura").map((n) => n.id)).toEqual(["b"]);
  });
  it("con cookie vieja, las posteriores; al día, ninguna", () => {
    expect(unseenNotes(sorted, "2026-11-01").map((n) => n.id)).toEqual(["b", "c"]);
    expect(unseenNotes(sorted, "2026-11-28")).toEqual([]);
  });
});
