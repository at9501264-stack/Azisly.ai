export type HairStyle = "short" | "side-part" | "spiky" | "wavy" | "long" | "bun" | "grey-receding";

export interface PersonaLook {
  skin: string;
  /** Slightly darker skin for ears, neck and nose shading */
  skinShade: string;
  hair: string;
  hairStyle: HairStyle;
  /** Top / shirt colour; defaults to the persona colour */
  outfit: string;
  glasses?: boolean;
  beard?: "stubble" | "full";
  moustache?: boolean;
  earrings?: boolean;
  lips: string;
}

export const PERSONA_LOOKS: Record<string, PersonaLook> = {
  "mod-1": {
    skin: "#d9a27a",
    skinShade: "#c08a63",
    hair: "#b9b4ab",
    hairStyle: "grey-receding",
    outfit: "#1e3a2f",
    glasses: true,
    moustache: true,
    lips: "#9c5a48",
  },
  "ai-aarav": {
    skin: "#c88a60",
    skinShade: "#ad7149",
    hair: "#1d1916",
    hairStyle: "spiky",
    outfit: "#a84b26",
    beard: "stubble",
    lips: "#8f4c3a",
  },
  "ai-meera": {
    skin: "#e2b08a",
    skinShade: "#c99571",
    hair: "#221a16",
    hairStyle: "long",
    outfit: "#3e5c76",
    glasses: true,
    lips: "#a85a55",
  },
  "ai-kabir": {
    skin: "#b47a52",
    skinShade: "#98623d",
    hair: "#2a201b",
    hairStyle: "wavy",
    outfit: "#74496a",
    beard: "full",
    lips: "#7e4232",
  },
  "ai-riya": {
    skin: "#d49a70",
    skinShade: "#ba8059",
    hair: "#3a2318",
    hairStyle: "bun",
    outfit: "#8a6219",
    earrings: true,
    lips: "#a24e4a",
  },
  "ai-dev": {
    skin: "#c4865b",
    skinShade: "#a96e45",
    hair: "#1f1b18",
    hairStyle: "side-part",
    outfit: "#536640",
    lips: "#8a4a38",
  },
};
