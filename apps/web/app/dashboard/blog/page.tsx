"use client"

import { useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { errorText } from "@/components/dashboard/lib"
import { PageHeader } from "@/components/dashboard/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

export default function BlogPage() {
  const projects = useQuery(api.projects.list)
  const [chosen, setChosen] = useState<Id<"projects"> | null>(null)
  const [editing, setEditing] = useState<Id<"posts"> | "new" | null>(null)
  const projectId = chosen ?? projects?.[0]?._id ?? null
  const project = projects?.find((p) => p._id === projectId)

  return (
    <>
      <PageHeader
        title="Blog"
        description="Posts appear at /blog on your published site, in its own header, footer and theme. Ask the AI chat in the editor to write one, or write it here in Markdown."
        action={
          projects && projects.length > 1 ? (
            <NativeSelect
              value={projectId ?? ""}
              onChange={(e) => {
                setChosen(e.target.value as Id<"projects">)
                setEditing(null)
              }}
              aria-label="Site"
            >
              {projects.map((p) => (
                <NativeSelectOption key={p._id} value={p._id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : undefined
        }
      />
      {projects === undefined ? (
        <Skeleton className="h-64" />
      ) : !project ? (
        <p className="text-sm text-muted-foreground">Create a site first, then write its blog here.</p>
      ) : editing ? (
        <PostEditor
          key={editing}
          projectId={project._id}
          postId={editing === "new" ? null : editing}
          liveBase={project.publishedVersionId ? `https://${project.hostname}` : null}
          onDone={() => setEditing(null)}
          onCreated={(id) => setEditing(id)}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <BlogSettings projectId={project._id} />
          <PostList
            projectId={project._id}
            liveBase={project.publishedVersionId ? `https://${project.hostname}` : null}
            onEdit={setEditing}
          />
        </div>
      )}
    </>
  )
}

function BlogSettings({ projectId }: { projectId: Id<"projects"> }) {
  const settings = useQuery(api.posts.settings, { projectId })
  const save = useMutation(api.posts.setSettings)
  if (!settings) return <Skeleton className="h-24" />
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blog page</CardTitle>
        <CardDescription>The heading and intro at the top of /blog.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="blog-title">Heading</Label>
          <Input
            id="blog-title"
            key={settings.title}
            defaultValue={settings.title}
            onBlur={(e) => e.target.value !== settings.title && void save({ projectId, title: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="blog-intro">Intro</Label>
          <Input
            id="blog-intro"
            key={settings.intro}
            defaultValue={settings.intro}
            placeholder="News, guides and stories from our team."
            onBlur={(e) => e.target.value !== settings.intro && void save({ projectId, intro: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function statusOf(post: { status: "draft" | "published"; scheduled: boolean }) {
  return post.status === "draft" ? "Draft" : post.scheduled ? "Scheduled" : "Published"
}

function PostList({
  projectId,
  liveBase,
  onEdit,
}: {
  projectId: Id<"projects">
  liveBase: string | null
  onEdit: (id: Id<"posts"> | "new") => void
}) {
  const posts = useQuery(api.posts.list, { projectId })
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Posts</CardTitle>
          <CardDescription>
            {liveBase ? (
              <a className="underline-offset-4 hover:underline" href={`${liveBase}/blog`} target="_blank" rel="noreferrer">
                View the blog →
              </a>
            ) : (
              "Publish the site to put its blog online."
            )}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => onEdit("new")}>
          New post
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {posts === undefined ? (
          <Skeleton className="h-16" />
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        ) : (
          posts.map((post) => (
            <button
              key={post._id}
              type="button"
              onClick={() => onEdit(post._id)}
              className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{post.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  /blog/{post.slug} · edited {formatDistanceToNow(post.updatedAt, { addSuffix: true })}
                  {post.scheduled && post.publishedAt && ` · goes live ${new Date(post.publishedAt).toLocaleString()}`}
                </span>
              </div>
              <Badge variant={post.status === "draft" ? "outline" : "secondary"}>{statusOf(post)}</Badge>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}

type Draft = {
  title: string
  slug: string
  excerpt: string
  cover: string
  coverAlt: string
  author: string
  tags: string
  body: string
  seoTitle: string
  seoDescription: string
}

const EMPTY: Draft = { title: "", slug: "", excerpt: "", cover: "", coverAlt: "", author: "", tags: "", body: "", seoTitle: "", seoDescription: "" }

function PostEditor({
  projectId,
  postId,
  liveBase,
  onDone,
  onCreated,
}: {
  projectId: Id<"projects">
  postId: Id<"posts"> | null
  liveBase: string | null
  onDone: () => void
  onCreated: (id: Id<"posts">) => void
}) {
  const post = useQuery(api.posts.get, postId ? { postId } : "skip")
  if (postId && post === undefined) return <Skeleton className="h-96" />
  const initial: Draft = post
    ? {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? "",
        cover: post.cover ?? "",
        coverAlt: post.coverAlt ?? "",
        author: post.author ?? "",
        tags: post.tags.join(", "),
        body: post.body,
        seoTitle: post.seoTitle ?? "",
        seoDescription: post.seoDescription ?? "",
      }
    : EMPTY
  return (
    <EditorForm
      key={post?.updatedAt ?? "new"}
      projectId={projectId}
      post={post ?? null}
      initial={initial}
      liveBase={liveBase}
      onDone={onDone}
      onCreated={onCreated}
    />
  )
}

function EditorForm({
  projectId,
  post,
  initial,
  liveBase,
  onDone,
  onCreated,
}: {
  projectId: Id<"projects">
  post: { _id: Id<"posts">; status: "draft" | "published"; scheduled: boolean; slug: string; publishedAt?: number } | null
  initial: Draft
  liveBase: string | null
  onDone: () => void
  onCreated: (id: Id<"posts">) => void
}) {
  const create = useMutation(api.posts.create)
  const update = useMutation(api.posts.update)
  const publish = useMutation(api.posts.publish)
  const unpublish = useMutation(api.posts.unpublish)
  const remove = useMutation(api.posts.remove)
  const [draft, setDraft] = useState(initial)
  const [schedule, setSchedule] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }))

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const values = () => ({
    title: draft.title,
    excerpt: draft.excerpt,
    cover: draft.cover,
    coverAlt: draft.coverAlt,
    author: draft.author,
    tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
    body: draft.body,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
  })

  async function save(): Promise<Id<"posts">> {
    if (post) {
      if (dirty) await update({ postId: post._id, ...values(), slug: draft.slug || undefined })
      return post._id
    }
    const id = await create({ projectId, ...values(), slug: draft.slug || undefined })
    onCreated(id)
    return id
  }

  const live = post?.status === "published" && !post.scheduled

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="post-title">Title</Label>
            <Input id="post-title" value={draft.title} onChange={set("title")} placeholder="What's this post about?" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="post-excerpt">Excerpt</Label>
            <Textarea id="post-excerpt" rows={2} value={draft.excerpt} onChange={set("excerpt")} placeholder="One or two sentences for the post list and search results." />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="post-body">Body (Markdown)</Label>
            <Textarea
              id="post-body"
              rows={22}
              className="font-mono text-sm"
              value={draft.body}
              onChange={set("body")}
              placeholder={"## A heading\n\nA paragraph with **bold** and a [link](https://example.com).\n\n- A list item"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">{post ? (post.status === "draft" ? "Draft" : post.scheduled ? "Scheduled" : "Published") : "New post"}</CardTitle>
            {live && liveBase && (
              <CardDescription>
                <a className="underline-offset-4 hover:underline" href={`${liveBase}/blog/${post.slug}`} target="_blank" rel="noreferrer">
                  View post →
                </a>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" disabled={busy !== null || !draft.title.trim() || (post !== null && !dirty)} onClick={() => run("save", save)}>
              {busy === "save" && <Spinner />}
              {post ? "Save changes" : "Save draft"}
            </Button>
            <Button
              disabled={busy !== null || !draft.title.trim() || !draft.body.trim()}
              onClick={() =>
                run("publish", async () => {
                  const id = await save()
                  await publish({ postId: id })
                })
              }
            >
              {busy === "publish" && <Spinner />}
              {live ? (dirty ? "Save and update" : "Published") : "Publish now"}
            </Button>
            <div className="flex gap-2">
              <Input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} aria-label="Publish at" />
              <Button
                variant="outline"
                disabled={busy !== null || !schedule || !draft.title.trim() || !draft.body.trim()}
                onClick={() =>
                  run("schedule", async () => {
                    const id = await save()
                    await publish({ postId: id, at: new Date(schedule).getTime() })
                  })
                }
              >
                Schedule
              </Button>
            </div>
            {post && post.status === "published" && (
              <Button variant="ghost" disabled={busy !== null} onClick={() => run("unpublish", () => unpublish({ postId: post._id }))}>
                Unpublish
              </Button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="flex flex-col gap-3 pt-4">
            <Field id="post-slug" label="URL" value={draft.slug} onChange={set("slug")} placeholder="made from the title" prefix="/blog/" />
            <Field id="post-cover" label="Cover image URL" value={draft.cover} onChange={set("cover")} placeholder="https://…" />
            <Field id="post-cover-alt" label="Cover description" value={draft.coverAlt} onChange={set("coverAlt")} />
            <Field id="post-author" label="Author" value={draft.author} onChange={set("author")} />
            <Field id="post-tags" label="Tags" value={draft.tags} onChange={set("tags")} placeholder="news, guides" />
            <Field id="post-seo-title" label="Search title" value={draft.seoTitle} onChange={set("seoTitle")} placeholder="the title" />
            <Field id="post-seo-desc" label="Search description" value={draft.seoDescription} onChange={set("seoDescription")} placeholder="the excerpt" />
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={onDone}>
            ← All posts
          </Button>
          {post && (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm("Delete this post for good?")) void run("delete", async () => {
                  await remove({ postId: post._id })
                  onDone()
                })
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  prefix,
  ...input
}: { id: string; label: string; prefix?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
        <Input id={id} {...input} />
      </div>
    </div>
  )
}
