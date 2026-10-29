import type { MapDefinition } from "./schema";

/**
 * Scene catalog: the textual side of each location (the visual side lives in
 * src/components/scene). Keyed by template and area so that campaigns stored
 * before this catalog existed resolve to the same descriptions.
 */
export type TemplateId = "ext-rua" | "ext-sitio" | "int-casarao" | "int-escola";

export function templateOf(map: Pick<MapDefinition, "areas" | "kind">): TemplateId {
  const ids = new Set(map.areas.map((a) => a.id));
  if (ids.has("terreiro")) return "ext-sitio";
  if (ids.has("rua")) return "ext-rua";
  if (ids.has("capela") || ids.has("cozinha")) return "int-casarao";
  return "int-escola";
}

export interface AreaProfile {
  /** First visit: what the agent takes in when stepping in. */
  first: string;
  /** Return visits: one short line. */
  again: string;
  /** Name of the generic obstacles ('o' tiles) in this area. */
  furniture: string;
}

interface Vars {
  place: string;
  placeKind: "escola" | "casarao";
}

const EXT: Record<"rua" | "terreiro", (v: Vars) => AreaProfile> = {
  rua: (v) => ({
    first: `A rua está vazia a essa hora. Do outro lado, ${v.placeKind === "escola" ? "o prédio da escola, de dois andares, ocupa a quadra inteira: janelas de vidro aramado, pichações sobre a pintura descascada e um portão de ferro com corrente frouxa" : "o sobrado se destaca entre as casas baixas, com a varanda tomada por plantas secas e as janelas fechadas por tábuas"}. Só um poste funciona no quarteirão.`,
    again: `Você está de volta à rua, diante ${v.placeKind === "escola" ? "da escola" : "do sobrado"}.`,
    furniture: "carros estacionados",
  }),
  terreiro: (v) => ({
    first: `A estrada de terra termina num terreiro de chão batido. ${v.placeKind === "escola" ? "A escola rural, de paredes caiadas e telhado de amianto," : "A casa grande, de taipa e telhado afundado,"} fica no alto do terreno, com mato crescendo até as janelas. O único som é o de um portão batendo devagar.`,
    again: "Você está de volta ao terreiro.",
    furniture: "carroças e cercas quebradas",
  }),
};

const SCHOOL: Record<string, AreaProfile> = {
  corredor: {
    first: "O corredor principal se estende de ponta a ponta. A faixa verde da pintura descasca na altura da cintura, o piso quadriculado tem lajotas soltas e um mural de cortiça ainda segura avisos amarelados. Portas numeradas se alinham dos dois lados.",
    again: "Você volta ao corredor principal.",
    furniture: "carteiras empilhadas",
  },
  "sala-aula": {
    first: "Uma sala de aula com as carteiras de fórmica ainda em fileiras, algumas viradas. O quadro-negro ocupa a parede do fundo e as janelas basculantes deixam entrar a luz do poste da rua.",
    again: "Você está de novo na sala de aula.",
    furniture: "carteiras escolares",
  },
  diretoria: {
    first: "A diretoria é pequena e abafada. Há uma mesa de madeira com tampo de vidro rachado, arquivos de aço com as gavetas entreabertas e um quadro de avisos com escalas de anos atrás.",
    again: "Você volta à diretoria.",
    furniture: "arquivos de aço",
  },
  covil: {
    first: "O almoxarifado não tem janelas. Prateleiras de metal sobem até o teto, carregadas de caixas de papel que alguém abriu e espalhou. O ar é seco e cheira a papel velho.",
    again: "Você está de volta ao almoxarifado.",
    furniture: "prateleiras de metal",
  },
  laboratorio: {
    first: "O laboratório de ciências tem bancadas de azulejo branco, pias manchadas e um armário de vidro com potes rotulados à mão. Um esqueleto didático, sem um dos braços, está encostado num canto.",
    again: "Você volta ao laboratório.",
    furniture: "bancadas de azulejo",
  },
  patio: {
    first: "O pátio coberto é amplo, com pilares de concreto e um telhado de telhas onduladas com goteiras. As marcas de uma quadra ainda aparecem no piso, e um bebedouro de inox enferrujado fica junto à parede.",
    again: "Você volta ao pátio coberto.",
    furniture: "bancos de concreto",
  },
  biblioteca: {
    first: "A biblioteca da escola tem estantes de aço tortas e livros didáticos inchados de umidade. Uma mesa comprida de leitura atravessa a sala, e fichas de empréstimo estão espalhadas pelo chão.",
    again: "Você está de novo na biblioteca.",
    furniture: "estantes de aço",
  },
};

const MANOR: Record<string, AreaProfile> = {
  corredor: {
    first: "Um corredor largo de tábuas corridas atravessa a casa. O papel de parede, de flores desbotadas, descola nas emendas, e retratos de família pendem tortos em molduras escuras.",
    again: "Você volta ao corredor do casarão.",
    furniture: "aparadores antigos",
  },
  biblioteca: {
    first: "A biblioteca da casa é forrada de estantes até o teto. Há uma poltrona de couro rachado, uma escrivaninha e pilhas de livros no chão, algumas com marcadores ainda no lugar.",
    again: "Você está de volta à biblioteca.",
    furniture: "pilhas de livros",
  },
  capela: {
    first: "A capela particular é estreita, com dois bancos de madeira escura e um pequeno altar coberto por uma toalha de renda. As imagens de santo foram viradas para a parede.",
    again: "Você volta à capela.",
    furniture: "bancos de igreja",
  },
  covil: {
    first: "O quarto estava selado havia muito tempo. A cama de ferro está desfeita, o espelho da penteadeira foi coberto com um lençol e o ar pesa como se ninguém respirasse ali há anos.",
    again: "Você está de novo no quarto selado.",
    furniture: "móveis cobertos",
  },
  cozinha: {
    first: "A cozinha conserva um fogão a lenha apagado, panelas de ferro penduradas e uma mesa comprida de madeira. A despensa está aberta, quase vazia.",
    again: "Você volta à cozinha.",
    furniture: "barris e caixotes",
  },
  sala: {
    first: "A sala de estar tem sofás cobertos por lençóis, um lustre de cristal sem lâmpadas e uma cristaleira de portas de vidro. O relógio da parede parou.",
    again: "Você está de novo na sala de estar.",
    furniture: "sofás cobertos",
  },
};

export function areaProfile(map: Pick<MapDefinition, "areas" | "kind">, areaId: string, v: Vars): AreaProfile {
  const t = templateOf(map);
  if (t === "ext-rua" || t === "ext-sitio") return EXT[t === "ext-rua" ? "rua" : "terreiro"](v);
  const table = t === "int-escola" ? SCHOOL : MANOR;
  const name = map.areas.find((a) => a.id === areaId)?.name ?? "cômodo";
  return table[areaId] ?? { first: `Você está em: ${name}.`, again: `Você volta para: ${name}.`, furniture: "móveis" };
}

export function placeKindOf(maps: Pick<MapDefinition, "areas" | "kind">[]): "escola" | "casarao" {
  return maps.some((m) => templateOf(m) === "int-casarao") ? "casarao" : "escola";
}
