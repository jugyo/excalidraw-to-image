import { Resvg } from "@resvg/resvg-js";

export function svgToPng(svg: string): Uint8Array {
  const resvg = new Resvg(svg, {
    background: "rgba(255, 255, 255, 0)",
  });
  const rendered = resvg.render();
  return rendered.asPng();
}
