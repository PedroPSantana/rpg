/** Original name and setting pools for procedural campaign generation. */
export const CITIES = [
  "Juiz de Fora", "Pelotas", "Campina Grande", "Ouro Preto", "Santarém", "Joinville", "Petrópolis", "Caruaru",
  "Londrina", "Ilhéus", "Uberaba", "Sobral", "Anápolis", "Bagé", "Parintins", "Diamantina",
];

export const FIRST_NAMES = {
  f: ["Helena", "Marta", "Rosana", "Íris", "Celeste", "Noêmia", "Tereza", "Lúcia", "Dalva", "Glória", "Iolanda", "Kátia", "Mirela", "Odete", "Quitéria", "Sueli"],
  m: ["Joaquim", "Otávio", "Benedito", "Valter", "Davi", "Rui", "Elias", "Augusto", "Fábio", "Heitor", "Jonas", "Leonel", "Nestor", "Paulo", "Raimundo", "Tadeu"],
};

export const LAST_NAMES = [
  "Albuquerque", "Bittencourt", "Cavalcanti", "Damasceno", "Esteves", "Falcão", "Guimarães", "Holanda", "Ipiranga",
  "Jardim", "Lacerda", "Macedo", "Nogueira", "Paranhos", "Queiroz", "Rezende", "Siqueira", "Toledo", "Valadares", "Xavier",
];

export const PLACE_NAMES = {
  casarao: ["Casarão {last}", "Solar dos {last}", "Sobrado {last}"],
  escola: ["Escola Estadual {first} {last}", "Antiga Escola Normal {last}", "Escola Municipal {last}"],
} as const;

export const TIMES = ["Madrugada de quinta-feira, garoa fina", "Noite de lua nova, calor abafado", "Fim de tarde nublado de domingo", "Madrugada fria de inverno, neblina baixa"];
