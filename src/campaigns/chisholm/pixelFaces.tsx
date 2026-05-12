import { useRef, useEffect } from "react";
import type { FaceLevel } from "../types";

export const FC: Record<string, string> = {
  ".":"transparent",s:"#e8b796",d:"#c4896b",w:"#a0654d",
  H:"#5c3a1e",h:"#7a5230",B:"#d4a843",e:"#1a1a2e",W:"#f0e8dc",r:"#3d2512",
  m:"#8b3a3a",M:"#5c1e1e",g:"#4a6741",G:"#364d30",b:"#8b2020",n:"#6b1515",
  c:"#c9a84c",C:"#a08530",f:"#5c3a1e",F:"#3d2512",x:"#7a5570",k:"#8b3a3a",
  D:"#c4a882",t:"#b8d4e8",
};

export const B_H="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..ssssddsssss.."+"..sfssmmssfs..."+"..sffssmssff..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
export const B_T="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..ssssddsssss.."+"..sfssmmssfs..."+"..sffsssssff..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
export const B_W="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..ssssddsssss.."+"..sfsMMMssfs..."+"..sffsssssff..."+"...sssssssss..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
export const B_D="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...xxsssssxx..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssddssskx.."+"..ssssddsssss.."+"..sfMMMMMsfs..."+"..sFfsssssFs..."+"...wswswswsw..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
export const S_H="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrsssssrrr..."+"..rrsssssssrr..."+"..ssssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..sssssssssss.."+"..ssssddsssss.."+"..ssssmmsssss.."+"..ssssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const S_T="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrsssssrrr..."+"..rrsssssssrr..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..sssssssssss.."+"..ssssddsssss.."+"..ssssmmsssss.."+"..ssssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const S_W="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrsssssrrr..."+"..rrdsssssdrrr.."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xssssssssxs.."+"..ssssddsssss.."+"..sssMMMsssss.."+"..ssssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const S_D="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrxsssxrrr..."+"..rrxsssssxrr..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssssssskx.."+"..ssssddsssss.."+"..ssMMMMMssss.."+"..wsswssswss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const CK_H="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
export const CK_T="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
export const CK_W="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..sssssssssss.."+"..ssMMMMMssss.."+"..sssssssssss..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
export const CK_D="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...xxsssssxx..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssddssskx.."+"..sssssssssss.."+"..sMMMMMMMsss.."+"..wswswswsww..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
export const WR_H="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
export const WR_T="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
export const WR_W="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..sssssssssss.."+"..sssMMMsssss.."+"..sssssssssss..."+"...sssssssss..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
export const WR_D="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...xxsssssxx..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssddssskx.."+"..sssssssssss.."+"..sMMMMMMMsss.."+"..wswswswsww..."+"...wswswswsw..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
export const PT_H="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const PT_T="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...DDsssssDD..."+"..DDsssssssDD.."+"..DWesssseWD..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const PT_W="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...DDdsssdDD..."+"..DDdsssssdDD.."+"..DWesssseWD..."+"..ssesssssess.."+"..bbbbbbbbbbb.."+"..bnbbbbbbbbn.."+"..bbbbbbbbbbb.."+"...bbbbbbbbb..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const PT_D="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...xxdsssdxx..."+"..xxdsssssdxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..bbbbbbbbbbb.."+"..bnbbbbbbbbn.."+"..bbbbbbbbbbb.."+"...bbbbbbbbb..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
export const HD_H="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
export const HD_S="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
export const HD_K="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..sssssssssss.."+"..sssMMMsssss.."+"...wsswsswss..."+"...sssssssss..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
export const HD_G="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...xxsssssxx..."+"..xxwssssswxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkwsddsxkxs.."+"..wsssssssssw.."+"..wMMMMMMMwww.."+"...wswswswsw..."+"...wswswswsw..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";

export const FACES: Record<string, FaceLevel[]> = {
  boss:[{threshold:70,sprite:B_H,label:"Confident"},{threshold:45,sprite:B_T,label:"Wary"},{threshold:20,sprite:B_W,label:"Worried"},{threshold:0,sprite:B_D,label:"Desperate"}],
  scout:[{threshold:70,sprite:S_H,label:"Sharp"},{threshold:45,sprite:S_T,label:"Cautious"},{threshold:20,sprite:S_W,label:"Rattled"},{threshold:0,sprite:S_D,label:"Gone"}],
  cook:[{threshold:60,sprite:CK_H,label:"Fed"},{threshold:35,sprite:CK_T,label:"Scraping"},{threshold:15,sprite:CK_W,label:"Empty"},{threshold:0,sprite:CK_D,label:"Nothing"}],
  wrangler:[{threshold:70,sprite:WR_H,label:"Strong"},{threshold:45,sprite:WR_T,label:"Thin"},{threshold:20,sprite:WR_W,label:"Lame"},{threshold:0,sprite:WR_D,label:"Afoot"}],
  point:[{threshold:70,sprite:PT_H,label:"Steady"},{threshold:45,sprite:PT_T,label:"Dusty"},{threshold:20,sprite:PT_W,label:"Masked"},{threshold:0,sprite:PT_D,label:"Losing"}],
  hand:[{threshold:80,sprite:HD_H,label:"Full crew"},{threshold:55,sprite:HD_S,label:"Short"},{threshold:30,sprite:HD_K,label:"Skeleton"},{threshold:0,sprite:HD_G,label:"Bones"}],
};

export function gf(set: FaceLevel[], v: number): FaceLevel {
  for (const f of set) { if (v >= f.threshold) return f; }
  return set[set.length - 1];
}

export function PixelFace({ spriteData, size = 48 }: { spriteData: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext("2d")!; const px = size / 16;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < spriteData.length; i++) {
      const ch = spriteData[i]; if (ch === "." || ch === " ") continue;
      const color = FC[ch]; if (!color || color === "transparent") continue;
      ctx.fillStyle = color; ctx.fillRect((i % 16) * px, Math.floor(i / 16) * px, px, px);
    }
  }, [spriteData, size]);
  return <canvas ref={ref} width={size} height={size} style={{ imageRendering: "pixelated", width: size, height: size }} />;
}
