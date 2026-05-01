import type { ComponentType, SVGProps } from "react";
import {
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Clock3,
  CreditCard,
  FileText,
  Layers3,
  MessageSquare,
  Newspaper,
  PenSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";

export type MarketingIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type MarketingPageCta = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

export type MarketingPageStat = {
  value: string;
  label: string;
};

export type MarketingPageItem = {
  title: string;
  description: string;
  icon: MarketingIcon;
  bullets?: string[];
  badge?: string;
};

export type MarketingPageSection = {
  title: string;
  description?: string;
  columns?: 2 | 3;
  items: MarketingPageItem[];
};

export type MarketingPageContent = {
  metadata: {
    title: string;
    description: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    ctas: MarketingPageCta[];
    stats?: MarketingPageStat[];
  };
  sections: MarketingPageSection[];
  closing: {
    title: string;
    description: string;
    ctas: MarketingPageCta[];
  };
};

export const marketingPages = {
  features: {
    metadata: {
      title: "Features | Hirexa AI",
      description:
        "Explore Hirexa AI features for job discovery, applications, career support, and workflow visibility.",
    },
    hero: {
      eyebrow: "Platform Features",
      title: "A more connected job search workflow",
      description:
        "Hirexa helps you move from discovery to application support without bouncing between disconnected tools.",
      ctas: [
        { href: "/login", label: "Get started" },
        { href: "/how-it-works", label: "See how it works", variant: "secondary" },
      ],
      stats: [
        { value: "1 profile", label: "Shared across tools" },
        { value: "3 min", label: "Onboarding time" },
        { value: "24/7", label: "Workflow support" },
      ],
    },
    sections: [
      {
        title: "From job search to action",
        description:
          "Core product flows stay aligned around your profile, preferences, and current opportunities.",
        columns: 3,
        items: [
          {
            icon: Search,
            title: "Smart job discovery",
            description:
              "Surface relevant roles faster with search and matching informed by your goals and history.",
            bullets: [
              "Role and skills alignment",
              "Remote and location-aware filtering",
              "Less manual searching",
            ],
          },
          {
            icon: Workflow,
            title: "Application workflow support",
            description:
              "Keep momentum once you find a fit, with guided next steps instead of fragmented tabs and notes.",
            bullets: [
              "Move from match to action quickly",
              "Keep context attached to each job",
              "Reduce repetitive form work",
            ],
          },
          {
            icon: Target,
            title: "Better-fit opportunities",
            description:
              "Focus your effort where role fit, location fit, and profile fit are strongest.",
            bullets: [
              "Higher-signal opportunities",
              "Clearer prioritization",
              "More consistent outreach",
            ],
          },
        ],
      },
      {
        title: "AI assistance where it matters",
        description:
          "Use AI to accelerate the parts of the job search that usually cost the most time.",
        columns: 3,
        items: [
          {
            icon: FileText,
            title: "Resume and application support",
            description:
              "Turn job context into stronger application materials without rebuilding everything from scratch.",
            bullets: [
              "Resume refinement support",
              "Role-aware drafting help",
              "Faster iteration",
            ],
          },
          {
            icon: MessageSquare,
            title: "Outreach and follow-up help",
            description:
              "Draft clearer recruiter outreach and follow-up messaging with less guesswork.",
            bullets: [
              "Personalized message structure",
              "Cleaner follow-up cadence",
              "Better consistency",
            ],
          },
          {
            icon: Bot,
            title: "Career coaching and interview prep",
            description:
              "Get practical guidance for positioning, interview preparation, and next-step decisions.",
            bullets: [
              "Role strategy support",
              "Interview prep workflows",
              "Actionable guidance",
            ],
          },
        ],
      },
      {
        title: "Built for clarity and control",
        description:
          "Hirexa is designed to help you move faster without hiding what matters.",
        columns: 3,
        items: [
          {
            icon: ShieldCheck,
            title: "Privacy-minded defaults",
            description:
              "Essential workflows stay available while optional analytics can be controlled through consent preferences.",
          },
          {
            icon: BarChart3,
            title: "Progress visibility",
            description:
              "Keep a clearer view of your pipeline, actions, and where to spend attention next.",
          },
          {
            icon: Users,
            title: "Human review stays central",
            description:
              "AI helps you move faster, but final decisions and quality checks stay with you.",
          },
        ],
      },
    ],
    closing: {
      title: "See the full workflow in motion",
      description:
        "Start with your profile, explore better-fit opportunities, and use Hirexa tools to act with more consistency.",
      ctas: [
        { href: "/login", label: "Start with Hirexa" },
        { href: "/jobs", label: "Browse jobs", variant: "secondary" },
      ],
    },
  },
  pricing: {
    metadata: {
      title: "Pricing | Hirexa AI",
      description:
        "Review Hirexa pricing principles, access options, and billing guidance before starting a plan.",
    },
    hero: {
      eyebrow: "Pricing",
      title: "Simple access options with clearer billing expectations",
      description:
        "Use Hirexa with a plan that matches how you want to start, then review billing and subscription details before checkout.",
      ctas: [
        { href: "/plans", label: "View plans" },
        { href: "/billing-and-credits", label: "Billing guide", variant: "secondary" },
      ],
      stats: [
        { value: "2", label: "Current access paths" },
        { value: "Clear", label: "Billing guidance" },
        { value: "Anytime", label: "Plan review before checkout" },
      ],
    },
    sections: [
      {
        title: "What pricing is built around",
        description:
          "The goal is to keep plan selection understandable before you commit to a workflow.",
        columns: 3,
        items: [
          {
            icon: CreditCard,
            title: "Straightforward plan selection",
            description:
              "Choose the access path that fits your search stage, then confirm the current terms during checkout.",
          },
          {
            icon: Clock3,
            title: "Low-friction evaluation",
            description:
              "Start without a long setup cycle so you can understand the workflow before investing deeper time.",
          },
          {
            icon: ShieldCheck,
            title: "Billing guidance before purchase",
            description:
              "Supporting pages explain subscriptions, credits, and cancellation behavior before you move forward.",
          },
        ],
      },
      {
        title: "Plan expectations",
        description:
          "These summaries are meant to help you choose a direction, while the live plan screen remains the source of current checkout terms.",
        columns: 2,
        items: [
          {
            icon: Sparkles,
            title: "Trial access",
            badge: "Popular",
            description:
              "A lightweight way to experience the product workflow and understand whether Hirexa fits your current search process.",
            bullets: [
              "Designed for quick onboarding",
              "Useful when you want to evaluate the workflow",
              "Review current checkout terms before purchase",
            ],
          },
          {
            icon: Layers3,
            title: "Annual access",
            description:
              "A longer-term path for people who want consistency across job discovery, applications, and support tools.",
            bullets: [
              "Useful for sustained job search cycles",
              "Better for repeat platform usage",
              "Supported by existing billing settings and account controls",
            ],
          },
        ],
      },
      {
        title: "Helpful before you decide",
        columns: 3,
        items: [
          {
            icon: Briefcase,
            title: "Use the product contextfully",
            description:
              "Plans make the most sense when your profile, role focus, and search preferences are already clear.",
          },
          {
            icon: BookOpen,
            title: "Review the billing guide",
            description:
              "Understand credit behavior, subscription handling, and support paths before buying.",
          },
          {
            icon: Users,
            title: "Keep control over the workflow",
            description:
              "You still review important outputs and decisions even when Hirexa helps accelerate the process.",
          },
        ],
      },
    ],
    closing: {
      title: "Ready to review the live plan options?",
      description:
        "Use the plan screen for current checkout details, or read the billing guide if you want more context first.",
      ctas: [
        { href: "/plans", label: "Go to plans" },
        { href: "/billing-and-credits", label: "Read billing guide", variant: "secondary" },
      ],
    },
  },
  about: {
    metadata: {
      title: "About | Hirexa AI",
      description:
        "Learn what Hirexa AI is building and the principles behind its job search workflow.",
    },
    hero: {
      eyebrow: "About Hirexa",
      title: "Built to make job searching less fragmented",
      description:
        "Hirexa is focused on helping job seekers move with more structure, less repetitive work, and better support across the hiring process.",
      ctas: [
        { href: "/login", label: "Start your profile" },
        { href: "/how-it-works", label: "Explore the workflow", variant: "secondary" },
      ],
      stats: [
        { value: "Focused", label: "On practical workflows" },
        { value: "Human-led", label: "Final review model" },
        { value: "Privacy-minded", label: "Product direction" },
      ],
    },
    sections: [
      {
        title: "What we care about",
        description:
          "The product direction stays anchored in real search friction, not novelty for its own sake.",
        columns: 3,
        items: [
          {
            icon: Workflow,
            title: "Connected workflows",
            description:
              "Job searching is easier when discovery, applications, and support tools share the same context.",
          },
          {
            icon: ShieldCheck,
            title: "User trust",
            description:
              "People should understand how the product behaves and where optional tracking can be controlled.",
          },
          {
            icon: Users,
            title: "Human judgment",
            description:
              "AI can accelerate effort, but review, accuracy, and decision-making should remain with the user.",
          },
        ],
      },
      {
        title: "How Hirexa approaches the problem",
        columns: 2,
        items: [
          {
            icon: Search,
            title: "Reduce repetitive searching",
            description:
              "Help users spend less time re-entering the same information and jumping between disconnected tools.",
            bullets: [
              "Central profile context",
              "Job matching support",
              "Cleaner next steps after discovery",
            ],
          },
          {
            icon: PenSquare,
            title: "Support stronger execution",
            description:
              "Give users help with outreach, applications, and preparation so more good opportunities turn into action.",
            bullets: [
              "Application support",
              "Outreach guidance",
              "Interview preparation tools",
            ],
          },
        ],
      },
      {
        title: "Product principles",
        columns: 3,
        items: [
          {
            icon: Sparkles,
            title: "Useful over flashy",
            description:
              "Features should solve practical workflow problems, not create extra noise.",
          },
          {
            icon: FileText,
            title: "Clear communication",
            description:
              "Users should be able to understand what the product is helping with and what still needs review.",
          },
          {
            icon: BarChart3,
            title: "Continuous improvement",
            description:
              "We learn from product usage patterns while keeping optional analytics behind consent.",
          },
        ],
      },
    ],
    closing: {
      title: "Explore the product from the outside in",
      description:
        "You can start with the public workflow pages, review pricing and billing guidance, or jump directly into the product.",
      ctas: [
        { href: "/features", label: "Explore features" },
        { href: "/pricing", label: "Review pricing", variant: "secondary" },
      ],
    },
  },
  blog: {
    metadata: {
      title: "Blog | Hirexa AI",
      description:
        "Read Hirexa perspectives on job search systems, AI-assisted workflows, and product updates.",
    },
    hero: {
      eyebrow: "Blog",
      title: "Guides, ideas, and product updates for a smarter search",
      description:
        "The Hirexa blog is designed to share practical job search thinking, product direction, and workflow guidance as the platform grows.",
      ctas: [
        { href: "/newsletter", label: "Join the newsletter" },
        { href: "/features", label: "Explore product features", variant: "secondary" },
      ],
      stats: [
        { value: "Guides", label: "Workflow-focused content" },
        { value: "Product", label: "Feature and roadmap updates" },
        { value: "Actionable", label: "Built for real searches" },
      ],
    },
    sections: [
      {
        title: "Editorial focus",
        description:
          "Content categories are organized to support job seekers with practical, readable guidance.",
        columns: 3,
        items: [
          {
            icon: Newspaper,
            badge: "Guides",
            title: "Modern job search systems",
            description:
              "What structured job searching looks like when your profile, role focus, and execution rhythm are aligned.",
            bullets: [
              "Planning weekly search cycles",
              "Prioritizing stronger-fit roles",
              "Reducing manual busywork",
            ],
          },
          {
            icon: Bot,
            badge: "Insights",
            title: "Using AI without losing control",
            description:
              "How to use AI-assisted tools thoughtfully while keeping review, quality, and credibility intact.",
            bullets: [
              "Reviewing AI output well",
              "Avoiding low-signal automation",
              "Keeping a human voice",
            ],
          },
          {
            icon: Briefcase,
            badge: "Product",
            title: "Hirexa product updates",
            description:
              "Launch notes, workflow improvements, and product thinking that affect the job seeker experience.",
            bullets: [
              "New workflow improvements",
              "Billing and feature clarity",
              "What changes next",
            ],
          },
        ],
      },
      {
        title: "Coming topics",
        columns: 2,
        items: [
          {
            icon: BookOpen,
            title: "How to review AI-generated applications before sending them",
            description:
              "A practical checklist for editing drafts so they still sound accurate, specific, and credible.",
          },
          {
            icon: MessageSquare,
            title: "Recruiter outreach that feels intentional, not spammy",
            description:
              "How to structure outreach around fit, timing, and a clear reason for contact.",
          },
          {
            icon: Clock3,
            title: "What a sustainable weekly job search rhythm actually looks like",
            description:
              "How to build a repeatable process that balances discovery, applications, and follow-up.",
          },
          {
            icon: Sparkles,
            title: "What changes when onboarding is fast but profile quality is still strong",
            description:
              "Why short setup time matters only if the downstream workflow gets better as a result.",
          },
        ],
      },
    ],
    closing: {
      title: "Stay close to future updates",
      description:
        "Use the newsletter to hear when new guides, product updates, and workflow content go live.",
      ctas: [
        { href: "/newsletter", label: "Subscribe to updates" },
        { href: "/about", label: "Learn about Hirexa", variant: "secondary" },
      ],
    },
  },
} satisfies Record<
  "features" | "pricing" | "about" | "blog",
  MarketingPageContent
>;
