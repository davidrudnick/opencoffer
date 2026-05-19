from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT_DIR = ROOT / "demo" / "remotion" / "public" / "screenshots"
OUT = ROOT / "public" / "demo.gif"

W, H = 720, 405
SCENE_FRAMES = 24
FADE_FRAMES = 8

SCENES = [
    ("overview.png", "Overview", "Balances, cash flow, and analyst callouts", "left"),
    ("charts.png", "Charts", "Deterministic chart tools with fresh context", "right"),
    ("chat.png", "Chat", "History, model picker, and graph answers", "left"),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = Path("/usr/share/fonts/truetype/dejavu") / name
    return ImageFont.truetype(str(path), size)


F11 = font(11, True)
F12 = font(12)
F18 = font(18, True)


def ease(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return 1 - (1 - value) ** 3


def load_screenshots() -> list[Image.Image]:
    images = []
    missing = []
    for filename, *_ in SCENES:
        path = SCREENSHOT_DIR / filename
        if not path.exists():
            missing.append(str(path))
            continue
        images.append(Image.open(path).convert("RGB"))

    if missing:
        raise FileNotFoundError("Missing demo screenshots:\n" + "\n".join(missing))

    return images


def crop_zoom(source: Image.Image, zoom: float, shift_x: float) -> Image.Image:
    resized = source.resize((round(W * zoom), round(H * zoom)), Image.Resampling.LANCZOS)
    left = round((resized.width - W) / 2 + shift_x)
    top = round((resized.height - H) / 2)
    left = max(0, min(left, resized.width - W))
    top = max(0, min(top, resized.height - H))
    return resized.crop((left, top, left + W, top + H))


def overlay_label(img: Image.Image, scene_index: int, local_frame: int) -> Image.Image:
    _, title, detail, align = SCENES[scene_index]
    label_alpha = ease((local_frame - 4) / 10)
    if label_alpha <= 0:
        return img

    draw = ImageDraw.Draw(img, "RGBA")
    width = 310
    height = 82
    x = 22 if align == "left" else W - width - 22
    y = H - height - 34
    fill_alpha = round(205 * label_alpha)
    line_alpha = round(42 * label_alpha)
    text_alpha = round(255 * label_alpha)
    muted_alpha = round(205 * label_alpha)

    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=10,
        fill=(17, 17, 15, fill_alpha),
        outline=(242, 239, 227, line_alpha),
        width=1,
    )
    draw.text((x + 15, y + 13), "OPENCOFFER", fill=(155, 164, 135, muted_alpha), font=F11)
    draw.text((x + 15, y + 31), title, fill=(244, 241, 230, text_alpha), font=F18)
    draw.text((x + 15, y + 57), detail, fill=(200, 193, 173, muted_alpha), font=F12)
    return img


def render_scene(source: Image.Image, scene_index: int, local_frame: int) -> Image.Image:
    scene_progress = ease(local_frame / max(1, SCENE_FRAMES - 1))
    direction = -1 if SCENES[scene_index][3] == "left" else 1
    zoom = 1.035 - 0.035 * scene_progress
    shift_x = direction * (6 - 6 * scene_progress)
    img = crop_zoom(source, zoom, shift_x)

    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    scrim_draw = ImageDraw.Draw(scrim, "RGBA")
    for y in range(H):
        t = y / H
        alpha = round(6 + 68 * max(0, (t - 0.52) / 0.48))
        scrim_draw.line((0, y, W, y), fill=(15, 15, 13, alpha))
    img = Image.alpha_composite(img.convert("RGBA"), scrim).convert("RGB")
    return overlay_label(img, scene_index, local_frame)


def make_frames(sources: list[Image.Image]) -> list[Image.Image]:
    frames = []
    for scene_index, source in enumerate(sources):
        for local_frame in range(SCENE_FRAMES):
            frame = render_scene(source, scene_index, local_frame)
            if scene_index < len(sources) - 1 and local_frame >= SCENE_FRAMES - FADE_FRAMES:
                next_local = local_frame - (SCENE_FRAMES - FADE_FRAMES)
                next_frame = render_scene(sources[scene_index + 1], scene_index + 1, next_local)
                blend = ease((next_local + 1) / FADE_FRAMES)
                frame = Image.blend(frame, next_frame, blend)
            frames.append(frame)
    return frames


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames = make_frames(load_screenshots())
    first, *rest = frames
    first.save(
        OUT,
        save_all=True,
        append_images=rest,
        duration=70,
        loop=0,
        optimize=True,
    )
    print(f"wrote {OUT} from {SCREENSHOT_DIR}")


if __name__ == "__main__":
    main()
