export interface MbmCopy {
  id: string;
  group: string;
  text: string;
}

/** Fixed Made by Madelen campaign evaluation set. No lorem. */
export const MBM_COPY: MbmCopy[] = [
  { id: "info", group: "Information", text: "INFORMATION" },
  { id: "name", group: "Information", text: "MADE BY MADELEN" },
  { id: "date", group: "Information", text: "07.09.2026" },
  { id: "launching-date", group: "Information", text: "LAUNCHING\n07.09.2026" },
  { id: "name-launch", group: "Information", text: "MADE BY MADELEN\nLAUNCHING 07.09.2026" },
  { id: "new", group: "Information", text: "NEW" },
  { id: "now", group: "Information", text: "NOW AVAILABLE" },
  { id: "worn", group: "Information", text: "MADE TO BE WORN" },
  { id: "product-colour", group: "Product", text: "PRODUCT / COLOUR" },
  { id: "colourway", group: "Product", text: "COLOURWAY LANGUAGE" },
  { id: "cold", group: "Product", text: "COLD SHOULDER" },
  { id: "redy", group: "Product", text: "RED-Y OR NOT" },
  { id: "slate", group: "Product", text: "CLEAN SLATE" },
  { id: "mixed", group: "Product", text: "MIXED MESSAGES" },
  { id: "way", group: "Belief", text: "MADE THE WAY YOU ARE." },
  { id: "flawed", group: "Belief", text: "WE'RE FLAWED AND FLAWLESS." },
  { id: "perfect", group: "Belief", text: "WE'RE PERFECTLY IMPERFECT." },
  { id: "free", group: "Belief", text: "CARE-FREE.\nGUILT-FREE.\nJUDGEMENT-FREE." },
  { id: "feel", group: "Belief", text: "MADE TO MAKE YOU FEEL, MADE. X" },
  { id: "this-is", group: "Campaign", text: "THIS IS MADE BY MADELEN." },
  { id: "coming", group: "Campaign", text: "SOMETHING IS COMING." },
];
