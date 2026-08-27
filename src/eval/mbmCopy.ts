export interface MbmCopy {
  id: string;
  group: string;
  text: string;
}

/** Fixed Made by Madelen campaign evaluation set. No lorem. */
export const MBM_COPY: MbmCopy[] = [
  { id: "new", group: "Display", text: "NEW" },
  { id: "hello", group: "Display", text: "HELLO" },
  { id: "coming-soon", group: "Display", text: "COMING SOON" },
  { id: "welcome", group: "Display", text: "WELCOME TO THE MBM WORLD MADE BY MADELEN" },
  { id: "welcome-authored", group: "Display", text: "WELCOME TO\nTHE MBM WORLD\nMADE BY MADELEN" },
  { id: "coming-soon-break", group: "Display", text: "COMING\nSOON" },
  { id: "name", group: "Display", text: "MADE BY MADELEN" },
  { id: "name-break", group: "Display", text: "MADE BY\nMADELEN" },
  { id: "cold", group: "Display", text: "COLD SHOULDER" },
  { id: "redy", group: "Display", text: "RED-Y OR NOT" },
  { id: "redy-break", group: "Display", text: "RED-Y\nOR NOT" },
  { id: "slate", group: "Display", text: "CLEAN SLATE" },
  { id: "mixed", group: "Display", text: "MIXED MESSAGES" },
  { id: "date", group: "Folio", text: "07.09.2026" },
  { id: "date-md", group: "Folio", text: "07.09" },
  { id: "year", group: "Folio", text: "2026" },
  { id: "date-split", group: "Folio", text: "07.09\n2026" },
  { id: "ss26-short", group: "Folio", text: "SS26" },
  { id: "num01", group: "Folio", text: "01" },
  { id: "num02", group: "Folio", text: "02" },
  { id: "sydney", group: "Folio", text: "SYDNEY" },
  { id: "now", group: "Caption", text: "NOW AVAILABLE" },
  { id: "made-by", group: "Caption", text: "MADE BY" },
  { id: "madelen", group: "Display", text: "MADELEN" },
  { id: "worn", group: "Caption", text: "MADE TO BE WORN" },
  { id: "launching", group: "Caption", text: "LAUNCHING" },
  { id: "product-colour", group: "Caption", text: "PRODUCT / COLOUR" },
  { id: "way", group: "Editorial", text: "MADE THE WAY YOU ARE." },
  { id: "flawed", group: "Editorial", text: "WE'RE FLAWED AND FLAWLESS." },
  { id: "flawed-break", group: "Editorial", text: "WE'RE FLAWED\nAND FLAWLESS." },
  { id: "perfect", group: "Editorial", text: "WE'RE PERFECTLY IMPERFECT." },
  { id: "free", group: "Editorial", text: "CARE-FREE.\nGUILT-FREE.\nJUDGEMENT-FREE." },
  { id: "this-is", group: "Editorial", text: "THIS IS MADE BY MADELEN." },
  { id: "date-euro", group: "Headline", text: "09.07\n2026" },
  { id: "two-rows", group: "Headline", text: "FIRST LINE\nSECOND LINE" },
  { id: "three-rows", group: "Headline", text: "FIRST LINE\nSECOND LINE\nTHIRD LINE" },
  { id: "kelly", group: "Paragraph", text: "Nic Kelly may have given you a heads up, but welcome to the MBM world made by Madelen. We're flawed and flawless. Care-free. Guilt-free. Judgement-free. Made the way you are." },
];

export function mbmById(id: string): MbmCopy {
  const found = MBM_COPY.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown MBM copy id: ${id}`);
  return found;
}
