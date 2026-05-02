import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import PostBoard from "./PostBoard";
import Timeline from "./Timeline";
import { getPostTimeline } from "@/lib/activity";

export default async function PostPage({
  params,
}: {
  params: Promise<{ brandId: string; postId: string }>;
}) {
  const { brandId, postId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await getPostAccess(user.id, postId);
  if (!result || result.post.brandId !== brandId) notFound();
  const { post, access } = result;

  const images = await prisma.postImage.findMany({
    where: { postId },
    orderBy: { position: "asc" },
  });

  const versions = await prisma.postVersion.findMany({
    where: { postId },
    orderBy: { version: "desc" },
    take: 5,
  });

  const timeline = await getPostTimeline(postId);

  // Vecinos para flechas ← →
  const siblings = await prisma.post.findMany({
    where: { brandId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  const idx = siblings.findIndex((s) => s.id === postId);
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;

  if (access.role === "client" && post.status === "draft") notFound();

  const [comments, lastApproval, agencyName, brand] = await Promise.all([
    prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    }),
    prisma.approval.findFirst({
      where: { postId },
      orderBy: { createdAt: "desc" },
      include: { user: true },
    }),
    getUserAgencyName(user.id),
    prisma.brand.findUnique({ where: { id: brandId } }),
  ]);

  return (
    <AppShell
      userName={user.name ?? user.email}
      agencyName={agencyName}
      title={brand?.name ?? "Post"}
    >
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/brands/${brandId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver al feed
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[post.status] ?? "bg-zinc-200"}`}
            >
              {STATUS_LABEL[post.status] ?? post.status}
            </span>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900">
              {post.title ?? "Post"}
            </h1>
            <p className="text-xs text-zinc-500">
              {post.platform} · {post.postType}
              {post.scheduledAt && ` · ${new Date(post.scheduledAt).toLocaleString()}`}
            </p>
          </div>
        </div>

        {post.caption && (
          <div className="card mt-5 whitespace-pre-wrap p-4 text-sm text-zinc-800">
            {post.caption}
          </div>
        )}

        {lastApproval && (
          <div className="card mt-4 p-3 text-xs text-zinc-600">
            <span className="font-medium text-zinc-900">
              {lastApproval.decision === "approved" ? "Aprobado" : "Cambios solicitados"}
            </span>{" "}
            por {lastApproval.user.name ?? lastApproval.user.email} ·{" "}
            {new Date(lastApproval.createdAt).toLocaleString()}
            {lastApproval.note && (
              <p className="mt-1 italic text-zinc-500">"{lastApproval.note}"</p>
            )}
          </div>
        )}

        <div className="mt-6">
          <PostBoard
            postId={post.id}
            imageUrl={post.imageUrl}
            images={images.map((i) => i.url)}
            canApprove={access.canApprove && access.role === "client"}
            canEdit={access.canEdit}
            currentStatus={post.status}
            publishedUrl={post.publishedUrl}
            publishError={post.publishError}
            currentUserId={user.id}
            isDeleted={!!post.deletedAt}
            prevId={prevId}
            nextId={nextId}
            versions={versions.map((v) => ({
              id: v.id,
              version: v.version,
              caption: v.caption,
              images: JSON.parse(v.imagesJson) as string[],
              note: v.note,
              createdAt: v.createdAt.toISOString(),
            }))}
            initialComments={comments.map((c) => ({
              id: c.id,
              body: c.body,
              createdAt: c.createdAt.toISOString(),
              updatedAt: c.updatedAt.toISOString(),
              userName: c.user.name ?? c.user.email,
              userId: c.userId,
              x: c.x,
              y: c.y,
              parentId: c.parentId,
              resolved: c.resolved,
            }))}
          />
        </div>

        {timeline.length > 0 && (
          <div className="mt-6">
            <Timeline events={timeline} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
