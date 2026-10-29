import { FIRST_NAMES } from "@/modules/adventures/content/pools";

/**
 * Procedural portraits: every NPC gets a face derived from their name and
 * role, so the same person looks the same in the scene, the journal and the
 * dialogue, with no image files involved.
 */
export interface PersonLook {
  gender: "f" | "m";
  age: "young" | "adult" | "old";
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: number;
  coat: string;
  shirt: string;
  accessory: "none" | "glasses" | "cap" | "apron" | "keys" | "scarf" | "satchel";
  beard: boolean;
  calm: boolean;
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SKINS = [
  ["#f1c7a5", "#d9a583"],
  ["#d9a07a", "#b97f5a"],
  ["#b9805a", "#966140"],
  ["#8d5a3b", "#6e4129"],
  ["#5e3b26", "#472a19"],
] as const;
const HAIR = ["#1d1512", "#2e2019", "#4a3020", "#6b4a2c", "#a7a39b", "#d9d6cf"];
const COATS = ["#3b4250", "#4b3a32", "#2f3a33", "#5a2d2a", "#3d3446", "#55503f", "#2a2f3c"];
const SHIRTS = ["#b8b2a3", "#7d8a96", "#a58c6a", "#8a6f74", "#c9c1ad"];

export function lookOf(name: string, role = "", calm = false): PersonLook {
  const first = name.split(" ")[0];
  const gender: "f" | "m" = FIRST_NAMES.f.includes(first) ? "f" : FIRST_NAMES.m.includes(first) ? "m" : /a$/.test(first) ? "f" : "m";
  const r = role.toLowerCase();
  const h = hash(name);
  const age: PersonLook["age"] = /veteran|síndic|zelador|relojoeir|mordomo|viúv|avó|avô/.test(r) ? "old" : /colega|entregador|sobrinh|estudante/.test(r) ? "young" : (["young", "adult", "adult", "old"] as const)[h % 4];
  const accessory: PersonLook["accessory"] = /zelador|síndic|porteir/.test(r)
    ? "keys"
    : /jardineir|cozinh/.test(r)
      ? "apron"
      : /carteiro|entregador/.test(r)
        ? "cap"
        : /relojoeir|editor|professor|radialista/.test(r)
          ? "glasses"
          : /bar/.test(r)
            ? "apron"
            : (["none", "none", "glasses", "scarf", "satchel"] as const)[(h >> 5) % 5];
  const [skin, skinShade] = SKINS[(h >> 3) % SKINS.length];
  const hair = age === "old" ? HAIR[4 + ((h >> 7) % 2)] : HAIR[(h >> 7) % 4];
  return {
    gender,
    age,
    skin,
    skinShade,
    hair,
    hairStyle: (h >> 11) % 3,
    coat: COATS[(h >> 13) % COATS.length],
    shirt: SHIRTS[(h >> 17) % SHIRTS.length],
    accessory,
    beard: gender === "m" && (h >> 19) % 3 === 0,
    calm,
  };
}

/** Head and shoulders, drawn in a 100×120 box with the chin around y=78. */
export function Bust({ look, gaze = 0 }: { look: PersonLook; gaze?: number }) {
  const { gender, age, skin, skinShade, hair } = look;
  const long = gender === "f" && look.hairStyle !== 2;
  return (
    <g>
      {/* Shoulders */}
      <path d="M12 120 C14 96 30 88 50 88 C70 88 86 96 88 120 Z" fill={look.coat} />
      <path d="M40 89 L50 104 L60 89 Z" fill={look.shirt} />
      {look.accessory === "apron" && <path d="M34 120 L36 98 L64 98 L66 120 Z" fill="#cfc6b2" opacity="0.85" />}
      {look.accessory === "scarf" && <path d="M34 88 C42 96 58 96 66 88 L64 98 C56 102 44 102 36 98 Z" fill="#8c3b34" />}
      {look.accessory === "satchel" && <path d="M28 92 L72 118" stroke="#3b2a1c" strokeWidth="4" />}
      {look.accessory === "keys" && (
        <g transform="translate(70 108)">
          <circle r="4" fill="none" stroke="#c9b37a" strokeWidth="1.4" />
          <path d="M2 3 l3 7 M-1 4 l-1 7" stroke="#c9b37a" strokeWidth="1.4" />
        </g>
      )}
      {/* Neck */}
      <rect x="43" y="70" width="14" height="20" rx="5" fill={skinShade} />
      {/* Hair behind */}
      {long && <path d="M26 46 C24 76 30 92 40 94 L60 94 C70 92 76 76 74 46 Z" fill={hair} />}
      {/* Face */}
      <ellipse cx="50" cy="50" rx="21" ry="26" fill={skin} />
      <path d="M29 52 C30 70 40 78 50 78 C60 78 70 70 71 52 C68 66 60 72 50 72 C40 72 32 66 29 52 Z" fill={skinShade} opacity="0.55" />
      {/* Hair on top */}
      {look.accessory === "cap" ? (
        <g>
          <path d="M27 40 C28 22 72 22 73 40 Z" fill="#33485e" />
          <path d="M60 38 L84 41 L72 44 Z" fill="#26384a" />
        </g>
      ) : look.hairStyle === 0 ? (
        <path d="M28 46 C26 24 44 18 52 20 C66 20 76 30 72 48 C66 36 54 32 40 34 C34 36 30 40 28 46 Z" fill={hair} />
      ) : look.hairStyle === 1 ? (
        <path d="M28 44 C28 26 40 20 50 20 C62 20 72 26 72 44 C70 38 66 34 58 32 C50 36 40 36 30 40 Z" fill={hair} />
      ) : (
        <path d="M30 40 C30 26 42 21 50 21 C60 21 70 26 70 40 C62 32 40 32 30 40 Z" fill={hair} />
      )}
      {gender === "f" && look.hairStyle === 2 && <circle cx="50" cy="18" r="7" fill={hair} />}
      {/* Eyes */}
      <g transform={`translate(${gaze} 0)`}>
        <ellipse cx="42" cy="50" rx="3" ry={look.calm ? 1.2 : 2} fill="#1b1714" />
        <ellipse cx="58" cy="50" rx="3" ry={look.calm ? 1.2 : 2} fill="#1b1714" />
      </g>
      <path d="M37 44 L46 43 M54 43 L63 44" stroke={hair} strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
      {age === "old" && <path d="M38 56 q4 2 8 0 M54 56 q4 2 8 0 M44 66 q6 -2 12 0" stroke={skinShade} strokeWidth="1" fill="none" />}
      <path d="M50 52 L48 61 L52 61" stroke={skinShade} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d={look.calm ? "M44 67 q6 3 12 0" : "M44 67 L56 67"} stroke="#6e3c32" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {look.beard && <path d="M31 58 C32 76 42 80 50 80 C58 80 68 76 69 58 C64 70 58 72 50 72 C42 72 36 70 31 58 Z" fill={hair} opacity="0.9" />}
      {look.accessory === "glasses" && (
        <g stroke="#2a2522" strokeWidth="1.5" fill="none">
          <circle cx="42" cy="50" r="6" />
          <circle cx="58" cy="50" r="6" />
          <path d="M48 50 L52 50" />
        </g>
      )}
    </g>
  );
}

export function Portrait({ name, role, calm, size = 48, className = "" }: { name: string; role?: string; calm?: boolean; size?: number; className?: string }) {
  const look = lookOf(name, role, calm);
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} className={className} role="img" aria-label={`Retrato de ${name}`}>
      <defs>
        <radialGradient id="pbg" cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#3a3340" />
          <stop offset="1" stopColor="#141117" />
        </radialGradient>
      </defs>
      <rect width="100" height="120" rx="10" fill="url(#pbg)" />
      <Bust look={look} />
      <rect width="100" height="120" rx="10" fill="none" stroke="#000" strokeOpacity="0.4" />
    </svg>
  );
}
