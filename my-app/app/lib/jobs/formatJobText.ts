// my-app/app/lib/jobs/formatJobText.ts

export type ParsedSection = {
    title: string;
    bullets: string[];
  };
  
  export function cleanJobText(html: string) {
    if (!html) return "";
  
    // remove HTML tags
    const text = html
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  
    return text;
  }
  
  export function splitSections(text: string): ParsedSection[] {
    if (!text) return [];
  
    const sections = text.split(/\n(?=[A-Z][^\n]+:)/);
  
    return sections.map((s) => {
      const [title, ...rest] = s.split("\n");
  
      return {
        title: title.replace(":", "").trim(),
        bullets: rest
          .map((l) => l.trim())
          .filter((l) => l.length > 0),
      };
    });
  }