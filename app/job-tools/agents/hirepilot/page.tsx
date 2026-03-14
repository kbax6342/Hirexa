import { redirect } from "next/navigation";

type HirePilotLegacyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildQueryString(
  params: Record<string, string | string[] | undefined> | undefined
) {
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params ?? {})) {
    if (typeof rawValue === "string" && rawValue.trim()) {
      search.set(key, rawValue);
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        if (value?.trim()) {
          search.append(key, value);
        }
      }
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export default async function HirePilotLegacyPage({
  searchParams,
}: HirePilotLegacyPageProps) {
  const queryString = buildQueryString(await searchParams);
  redirect(`/hirepilot${queryString}`);
}
