import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const SCENE_FRAMES = 50;
const OVERLAP_FRAMES = 10;

const scenes = [
  {
    src: "screenshots/overview.png",
    title: "Overview",
    detail: "Balances, cash flow, and auto analyst callouts",
    align: "left" as const,
  },
  {
    src: "screenshots/charts.png",
    title: "Charts",
    detail: "Deterministic chart tools with fresh data context",
    align: "right" as const,
  },
  {
    src: "screenshots/chat.png",
    title: "Chat",
    detail: "Conversation history, model picker, and graph answers",
    align: "left" as const,
  },
];

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const OpenCofferDemo = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 1], clamp);

  return (
    <AbsoluteFill style={styles.stage}>
      {scenes.map((scene, index) => (
        <Sequence
          key={scene.src}
          from={index * SCENE_FRAMES}
          durationInFrames={index === scenes.length - 1 ? SCENE_FRAMES : SCENE_FRAMES + OVERLAP_FRAMES}
        >
          <ScreenshotScene {...scene} index={index} />
        </Sequence>
      ))}
      <div style={styles.progressShell}>
        <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
      </div>
    </AbsoluteFill>
  );
};

function ScreenshotScene({
  src,
  title,
  detail,
  align,
  index,
}: {
  src: string;
  title: string;
  detail: string;
  align: "left" | "right";
  index: number;
}) {
  const frame = useCurrentFrame();
  const isLast = index === scenes.length - 1;
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: ease });
  const fadeOut = isLast
    ? 1
    : interpolate(frame, [SCENE_FRAMES, SCENE_FRAMES + OVERLAP_FRAMES], [1, 0], { ...clamp, easing: ease });
  const scale = interpolate(frame, [0, SCENE_FRAMES], [1.035, 1], { ...clamp, easing: ease });
  const x = interpolate(frame, [0, SCENE_FRAMES], align === "left" ? [-8, 0] : [8, 0], {
    ...clamp,
    easing: ease,
  });
  const labelY = interpolate(frame, [6, 20], [12, 0], { ...clamp, easing: ease });
  const labelOpacity = interpolate(
    frame,
    [6, 18, SCENE_FRAMES, SCENE_FRAMES + OVERLAP_FRAMES],
    [0, 1, 1, isLast ? 1 : 0],
    clamp,
  );

  return (
    <AbsoluteFill style={{ ...styles.scene, opacity: fadeIn * fadeOut }}>
      <Img
        src={staticFile(src)}
        style={{
          ...styles.screenshot,
          transform: `translate3d(${x}px, 0, 0) scale(${scale})`,
        }}
      />
      <div style={styles.scrim} />
      <div
        style={{
          ...styles.label,
          ...(align === "right" ? styles.labelRight : styles.labelLeft),
          opacity: labelOpacity,
          transform: `translate3d(0, ${labelY}px, 0)`,
        }}
      >
        <div style={styles.kicker}>OpenCoffer</div>
        <div style={styles.title}>{title}</div>
        <div style={styles.detail}>{detail}</div>
      </div>
    </AbsoluteFill>
  );
}

const styles: Record<string, CSSProperties> = {
  stage: {
    background: "#0f0f0d",
    color: "#f2efe3",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: "hidden",
  },
  scene: {
    background: "#0f0f0d",
    overflow: "hidden",
  },
  screenshot: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transformOrigin: "center center",
  },
  scrim: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(15,15,13,0.08) 0%, rgba(15,15,13,0) 44%, rgba(15,15,13,0.32) 100%)",
  },
  label: {
    position: "absolute",
    bottom: 28,
    maxWidth: 360,
    border: "1px solid rgba(242, 239, 227, 0.16)",
    borderRadius: 10,
    background: "rgba(17, 17, 15, 0.82)",
    boxShadow: "0 18px 56px rgba(0, 0, 0, 0.38)",
    padding: "16px 18px",
  },
  labelLeft: {
    left: 28,
  },
  labelRight: {
    right: 28,
  },
  kicker: {
    color: "#9ba487",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.1,
    lineHeight: 1,
    textTransform: "uppercase",
  },
  title: {
    color: "#f4f1e6",
    fontSize: 24,
    fontWeight: 750,
    letterSpacing: 0,
    lineHeight: 1.1,
    marginTop: 8,
  },
  detail: {
    color: "#c8c1ad",
    fontSize: 13,
    lineHeight: 1.45,
    marginTop: 6,
  },
  progressShell: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 14,
    height: 3,
    borderRadius: 999,
    background: "rgba(242, 239, 227, 0.13)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "#79a7ff",
  },
};
