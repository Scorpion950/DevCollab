import Image from "next/image";
import { Crosshair } from "lucide-react";

export function Assembly() {
  return (
    <figure className="assembly" aria-label="Exploded illustration of the planned workspace, agent, and data layers">
      <i className="corner tl" aria-hidden="true" /><i className="corner tr" aria-hidden="true" />
      <i className="corner bl" aria-hidden="true" /><i className="corner br" aria-hidden="true" />
      <figcaption className="assembly-caption"><Crosshair size={13} /> System assembly</figcaption>
      <Image className="assembly-image" src="/art/workspace-assembly.webp" width={1200} height={960}
        preload sizes="(max-width: 740px) 92vw, (max-width: 1400px) 45vw, 570px" alt="" />
      <div className="callout layer-one"><span />Workspace</div>
      <div className="callout layer-two"><span />Agent layer</div>
      <div className="callout layer-three"><span />Project data</div>
      <span className="assembly-axis" aria-hidden="true">⌖</span>
      <span className="assembly-view">ISO / EXPLODED</span>
    </figure>
  );
}
