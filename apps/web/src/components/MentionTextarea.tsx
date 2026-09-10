import { useQuery } from "@tanstack/react-query";
import { TextareaHTMLAttributes, useMemo, useState } from "react";
import { Icon } from "../app/icons";
import { api } from "../lib/api";

type Organization = {
  id: string;
  name: string;
  official_name: string;
  acronym?: string;
  handle: string;
  kind: "GOVERNMENT" | "NGO";
};

export function MentionTextarea({
  name = "body",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [value, setValue] = useState(String(props.defaultValue ?? ""));
  const [ids, setIds] = useState<string[]>([]);
  const match = useMemo(
    () => value.match(/(?:^|\s)@([A-Za-z0-9_]{1,30})$/),
    [value],
  );
  const term = match?.[1] ?? "";
  const search = useQuery({
    queryKey: ["mention-search", term],
    queryFn: () =>
      api<Organization[]>(
        `/organizations/search?q=${encodeURIComponent(term)}&mentionable=true`,
      ),
    enabled: Boolean(term),
    staleTime: 30_000,
  });
  const choose = (organization: Organization) => {
    setValue((current) =>
      current.replace(/@([A-Za-z0-9_]{1,30})$/, `@${organization.handle} `),
    );
    setIds((current) =>
      [...new Set([...current, organization.id])].slice(0, 5),
    );
  };
  return (
    <div className="mention-field">
      <textarea
        {...props}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <input
        type="hidden"
        name="mentionedOrganizationIds"
        value={JSON.stringify(ids)}
      />
      {match && (
        <div
          className="mention-menu"
          role="listbox"
          aria-label="Organization suggestions"
        >
          {search.isLoading && <p>Finding verified organizations…</p>}
          {search.data?.map((organization) => (
            <button
              type="button"
              role="option"
              key={organization.id}
              onClick={() => choose(organization)}
            >
              <span className="mention-avatar">
                {organization.acronym?.slice(0, 2) ??
                  organization.name.slice(0, 2)}
              </span>
              <span>
                <strong>@{organization.handle}</strong>
                <small>{organization.official_name}</small>
              </span>
              <em>
                <Icon
                  name={
                    organization.kind === "GOVERNMENT" ? "building" : "people"
                  }
                  size={16}
                />
                {organization.kind}
              </em>
            </button>
          ))}
          {!search.isLoading && !search.data?.length && (
            <p>No verified organization matches @{term}.</p>
          )}
        </div>
      )}
      {ids.length > 0 && (
        <p className="mention-help">
          <Icon name="success" size={16} />
          {ids.length} organization{ids.length === 1 ? "" : "s"} will be
          notified when published.
        </p>
      )}
    </div>
  );
}
