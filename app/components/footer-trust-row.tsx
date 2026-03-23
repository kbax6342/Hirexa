function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.244 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.053 6.106 29.28 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917Z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.109 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.053 6.106 29.28 4 24 4c-7.682 0-14.347 4.337-17.694 10.691Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.179 0 9.868-1.977 13.409-5.192l-6.19-5.238C29.143 35.155 26.693 36 24 36c-5.223 0-9.62-3.329-11.283-7.957l-6.52 5.025C9.505 39.556 16.227 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 0 1-4.084 5.571h.002l6.19 5.238C36.973 39.207 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"
      />
    </svg>
  );
}

function MetaLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 40"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
    >
      <defs>
        <linearGradient id="meta-gradient" x1="8" x2="56" y1="8" y2="32">
          <stop offset="0" stopColor="#0EA5E9" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <path
        d="M8 28c3.3-11.8 7.4-17.7 12.2-17.7 5.2 0 8.1 6.2 11.8 13.6 2.8 5.5 4.6 8.1 6.6 8.1 2.4 0 4.4-3 7.2-8.5 3.3-6.5 6.4-13.2 10.2-13.2C60.4 10.3 63 17 63 28"
        stroke="url(#meta-gradient)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrustBadge({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/35 px-3 py-2 text-xs font-medium text-foreground/90">
      {icon}
      <span>{label}</span>
    </div>
  );
}

export function FooterTrustRow() {
  return (
    <div className="mt-8 border-t border-border/60 pt-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <TrustBadge icon={<GoogleLogo />} label="Google Sign-In Enabled" />
        {/* Wording can be adjusted later if Meta tracking messaging changes. */}
        <TrustBadge icon={<MetaLogo />} label="Uses Meta Pixel" />
      </div>
    </div>
  );
}
