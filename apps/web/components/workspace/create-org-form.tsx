"use client";

import { useActionState, useState } from "react";
import { Building2, CircleAlert } from "lucide-react";
import { createOrganizationAction, type ActionState } from "@/app/app/actions";
import { Button } from "@/components/ui/button";

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function CreateOrganizationForm({
  heading = "Create an organization",
  subheading = "Organizations group your team, projects, and role-based permissions.",
}: {
  heading?: string;
  subheading?: string;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createOrganizationAction,
    {},
  );

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(toSlug(value));
    }
  }

  return (
    <section className="app-card">
      <div className="app-card-header">
        <div>
          <p className="eyebrow">
            <Building2 size={14} /> Organization setup
          </p>
          <h2 style={{ marginTop: ".35rem" }}>{heading}</h2>
          <p className="field-hint" style={{ marginTop: ".25rem" }}>
            {subheading}
          </p>
        </div>
      </div>

      <form action={action} className="form-stack" aria-busy={pending}>
        <label className="field-group">
          Organization name
          <input
            type="text"
            name="name"
            className="field-input"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Yash Technologies"
          />
        </label>

        <label className="field-group">
          Organization slug
          <input
            type="text"
            name="slug"
            className="field-input mono-input"
            required
            minLength={2}
            maxLength={64}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            placeholder="yash-technologies"
          />
          <span className="field-hint">
            Unique lowercase identifier (letters, numbers, and hyphens).
          </span>
        </label>

        <label className="field-group">
          Description (optional)
          <textarea
            name="description"
            className="field-textarea"
            maxLength={500}
            placeholder="Engineering teams collaborating on platform services and AI workflows."
          />
        </label>

        {state.error && (
          <p className="banner banner-error" role="alert">
            <span className="inline-actions">
              <CircleAlert size={16} />
              {state.error}
            </span>
          </p>
        )}

        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating organization…" : "Create Organization"}
          </Button>
        </div>
      </form>
    </section>
  );
}
