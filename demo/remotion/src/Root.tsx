import { Composition } from "remotion";
import { OpenCofferDemo } from "./OpenCofferDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="OpenCofferDemo"
      component={OpenCofferDemo}
      durationInFrames={150}
      fps={30}
      width={960}
      height={540}
    />
  );
};
