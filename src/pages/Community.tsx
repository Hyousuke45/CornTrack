import { useState } from "react";
import { Megaphone, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useDeleteRow, useInsertRow, usePosts, useProfile } from "@/lib/data";
import { POST_KINDS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { CommunityPostInsert } from "@/lib/types";
import { useToast } from "@/components/Toast";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  SaveButton,
  SectionTitle,
  SelectField,
  Sheet,
  TextArea,
  formText,
} from "@/components/ui";

/** Community board (guide §8): shared announcements, tips and questions. */
export default function Community() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: profile } = useProfile(user?.id);
  const { data: posts = [], isLoading } = usePosts();
  const insertPost = useInsertRow<CommunityPostInsert>("community_posts");
  const deletePost = useDeleteRow("community_posts");
  const [sheet, setSheet] = useState(false);

  const fail = (error: unknown) =>
    toast({
      title: "Could not save",
      description: error instanceof Error ? error.message : "Please try again.",
      variant: "error",
    });

  const submit = (form: FormData) => {
    if (!user) return;
    insertPost.mutate(
      {
        user_id: user.id,
        title: formText(form, "title"),
        body: formText(form, "body"),
        author_name: profile?.full_name || user.email?.split("@")[0] || "A corn farmer",
        location: [profile?.municipality, profile?.province].filter(Boolean).join(", "),
        kind: formText(form, "kind") || "Tip",
      },
      {
        onSuccess: () => {
          toast({ title: "Post shared with the community" });
          setSheet(false);
        },
        onError: fail,
      }
    );
  };

  return (
    <div className="page-enter">
      <header className="mb-4">
        <a href="/more" className="back-link">
          ← Back to More
        </a>
        <h1 className="page-title">Community</h1>
        <p className="page-intro">Announcements, tips and questions from CornTrack farmers.</p>
      </header>

      <button className="btn-primary w-full" onClick={() => setSheet(true)} data-testid="button-add-post">
        <Plus size={16} /> Share a post
      </button>

      <Card className="mt-4">
        <SectionTitle>Board</SectionTitle>
        {isLoading ? (
          <div className="loading-block">Loading posts…</div>
        ) : posts.length ? (
          <div>
            {posts.map((post) => (
              <article key={post.id} className="row-item !items-start" data-testid={`card-post-${post.id}`}>
                <span className="row-icon" style={{ background: "#e3edfd", color: "#1a62c9" }}>
                  {post.kind === "Announcement" ? <Megaphone size={16} /> : <MessageSquareText size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="row-title">{post.title}</span>
                    <Badge tone={post.kind === "Announcement" ? "blue" : "neutral"}>{post.kind}</Badge>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#5c6b5e]">{post.body}</p>
                  <p className="mt-2 text-[10px] text-[#98a394]">
                    {post.author_name}
                    {post.location ? ` · ${post.location}` : ""} · {formatDateTime(post.created_at)}
                  </p>
                </div>
                {user && post.user_id === user.id && (
                  <button
                    className="icon-btn icon-btn-danger"
                    aria-label="Delete my post"
                    onClick={() => {
                      if (!window.confirm("Delete this post?")) return;
                      deletePost.mutate(post.id, {
                        onSuccess: () => toast({ title: "Post deleted" }),
                        onError: fail,
                      });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<MessageSquareText size={20} />}
            title="No posts yet"
            text="Be the first to share a practical tip or announcement with other farmers."
          />
        )}
      </Card>

      {sheet && (
        <Sheet title="Share a post" close={() => setSheet(false)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit(new FormData(event.currentTarget));
            }}
          >
            <Field label="Title" name="title" required placeholder="One helpful thing to share" />
            <SelectField label="Kind of post" name="kind" defaultValue="Tip" options={POST_KINDS} />
            <TextArea label="Your post" name="body" rows={5} required placeholder="Share a practical reminder that could help another corn farmer…" />
            <div className="notice">Posts are visible to all CornTrack farmers. Do not post personal contact details you want to keep private.</div>
            <SaveButton label="Share post" pending={insertPost.isPending} testId="button-save-post" />
          </form>
        </Sheet>
      )}
    </div>
  );
}
