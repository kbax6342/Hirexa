export type JobSource =
  | "adzuna"
  | "greenhouse"
  | "lever"
  | "workday"
  | "icims"
  | "jazzhr"
  | "other";

export type Job = {
  id: string;              // MUST be stable + unique (include source prefix)
  source: JobSource;

  title: string;
  company: string;
  location: string;
  posted: string;

  salary?: string;
  badge?: "NEW" | "MVP";
  description?: string;    // list view can be short; details can fetch later
  jobUrl?: string;         // optional now; strongly recommended later
};

export type JobPrettySection = {
  title: string;
  kind: "paragraphs" | "bullets" | "callout" | "smallprint";
  paragraphs?: string[];
  bullets?: string[];
  callout?: {
    label?: string;
    value: string;
  };
};

export type JobPretty = {
  highlights: Array<{ label: string; value: string }>;
  sections: Array<
    | { title: string; kind: "paragraphs"; paragraphs: string[] }
    | { title: string; kind: "bullets"; bullets: string[] }
    | { title: string; kind: "callout"; callout: { label?: string; value: string } }
    | { title: string; kind: "smallprint"; paragraphs: string[] }
  >;
};
