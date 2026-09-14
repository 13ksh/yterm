#!/usr/bin/env python3
"""Write simple RGBA PNG icons without third-party libraries."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: Path, size: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = b""
    for y in range(size):
        raw += b"\x00"
        for x in range(size):
            raw += bytes(pixels[y * size + x])
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", ihdr),
            png_chunk(b"IDAT", zlib.compress(raw, 9)),
            png_chunk(b"IEND", b""),
        ]
    )
    path.write_bytes(png)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def paint(size: int) -> list[tuple[int, int, int, int]]:
    pixels: list[tuple[int, int, int, int]] = []
    cx = cy = (size - 1) / 2
    r_outer = size * 0.46
    r_inner = size * 0.18
    stroke = max(1.6, size * 0.09)
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            # rounded square background
            qx = max(abs(dx) - size * 0.32, 0)
            qy = max(abs(dy) - size * 0.32, 0)
            box = (qx * qx + qy * qy) ** 0.5 - size * 0.12
            if box > 1.2:
                pixels.append((0, 0, 0, 0))
                continue
            bg = (22, 22, 24, 255)
            if box > 0:
                alpha = int(max(0, 255 * (1 - box / 1.2)))
                bg = (22, 22, 24, alpha)
            # crimson ring
            ring = abs(dist - r_outer * 0.72)
            if ring < stroke:
                t = 1 - ring / stroke
                bg = (
                    int(lerp(bg[0], 255, t)),
                    int(lerp(bg[1], 77, t)),
                    int(lerp(bg[2], 109, t)),
                    255,
                )
            # slash
            slash = abs(dx + dy) / 1.414
            on_slash = slash < stroke * 0.7 and abs(dx) < r_outer * 0.7 and abs(dy) < r_outer * 0.7
            if on_slash:
                bg = (255, 240, 242, 255)
            # inner hole suggestion
            if dist < r_inner and not on_slash:
                bg = (18, 18, 20, bg[3])
            pixels.append(bg)
    return pixels


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "icons"
    out.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(out / f"icon{size}.png", size, paint(size))


if __name__ == "__main__":
    main()
