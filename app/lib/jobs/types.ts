export type JobSource =
  | "adzuna"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "usajobs"
  | "remotive"
  | "remoteok"
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
  searchText?: string;     // internal matching context; safe for clients to ignore
};

export type JobDetailSection = {
  title: string;
  kind: "paragraphs" | "bullets" | "callout" | "smallprint";
  paragraphs?: string[];
  bullets?: string[];
  callout?: {
    label?: string;
    value: string;
  };
};

export type JobDetail = Job & {
  remote?: boolean;
  salaryText?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  employmentType?: string | null;
  applyUrl?: string | null;
  externalUrl?: string | null;
  descriptionHtml?: string | null;
  contentHtml?: string | null;
  content?: string | null;
  descriptionPlain?: string | null;
  summary?: string | null;
  snippet?: string | null;
  sections?: JobDetailSection[];
  benefits?: string[];
  requirements?: string[];
  duties?: string[];
  howToApply?: string[];
  metadata?: Record<string, string | number | boolean | null>;
  detailLevel?: "full" | "partial" | "summary";
  providerHasFullDetails?: boolean;
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
