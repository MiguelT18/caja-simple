import { describe, expect, it } from "vitest";
import { imageInfo, tooLarge } from "./image";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const png = (w: number, h: number) => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32(13), "IHDR", u32(w), u32(h), [8, 6, 0, 0, 0]);

describe("imageInfo", () => {
  it("lee un PNG", () => {
    expect(imageInfo(png(640, 480))).toEqual({ type: "image/png", width: 640, height: 480 });
  });

  it("lee un JPEG con un segmento EXIF antes del SOF", () => {
    const jpeg = bytes([0xff, 0xd8], [0xff, 0xe1], u16(8), "Exif\0\0", [0xff, 0xc0], u16(17), [8], u16(480), u16(640), [3], new Array(12).fill(0));
    expect(imageInfo(jpeg)).toEqual({ type: "image/jpeg", width: 640, height: 480 });
  });

  it("lee los tres formatos de WebP", () => {
    const lossy = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], [0x80, 0x02], [0xe0, 0x01], [0, 0]);
    expect(imageInfo(lossy)).toEqual({ type: "image/webp", width: 640, height: 480 });
    // VP8L: 14 bits de (ancho − 1) y 14 de (alto − 1), empaquetados.
    const w = 639, h = 479, bits = w | (h << 14);
    const lossless = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [0, 0, 0, 0], [0x2f], [bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255], [0, 0, 0, 0, 0]);
    expect(imageInfo(lossless)).toEqual({ type: "image/webp", width: 640, height: 480 });
    const extended = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0, 0, 0, 0], [0x7f, 0x02, 0], [0xdf, 0x01, 0], [0, 0]);
    expect(imageInfo(extended)).toEqual({ type: "image/webp", width: 640, height: 480 });
  });

  it("rechaza lo que no es imagen aunque se llame .png", () => {
    expect(imageInfo(bytes("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(imageInfo(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))).toBeNull();
    expect(imageInfo(bytes([0x4d, 0x5a, 0x90, 0], new Array(40).fill(0)))).toBeNull(); // ejecutable de Windows
  });
});

describe("tooLarge", () => {
  it("frena las imágenes bomba", () => {
    expect(tooLarge(imageInfo(png(30000, 30000))!)).toBe(true);
    expect(tooLarge(imageInfo(png(7000, 7000))!)).toBe(true); // 49 MP
    expect(tooLarge(imageInfo(png(4000, 3000))!)).toBe(false);
  });
});
