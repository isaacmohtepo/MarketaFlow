import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Globe } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess, hasPermission } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import PresenceIndicator from "@/components/PresenceIndicator";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import { ASSET_TYPE_TAB_LABEL, assetTypeLabel, assetTypeTint, isAssetType } from "@/lib/asset-types";
import { FileList, VideoEmbed, WebsiteEmbed } from "@/components/AssetPreview";
import PostBoard from "./PostBoard";
import WebDesignBoard from "./WebDesignBoard";
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

  const timeline = await getPostTimeline(postId, {
    excludeInternal: access.role === "client",
  });

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

  const [
    canEditCaption,
    canUploadMedia,
    canCreatePost,
    canDelete,
    canSchedule,
    canPublish,
    canApprovePost,
    canApproveInternal,
    canWriteComments,
    canResolveComments,
  ] = await Promise.all([
    hasPermission(user.id, access.agencyId, "posts.edit_caption", brandId),
    hasPermission(user.id, access.agencyId, "posts.upload_media", brandId),
    hasPermission(user.id, access.agencyId, "posts.create", brandId),
    hasPermission(user.id, access.agencyId, "posts.delete", brandId),
    hasPermission(user.id, access.agencyId, "posts.schedule", brandId),
    hasPermission(user.id, access.agencyId, "posts.publish", brandId),
    hasPermission(user.id, access.agencyId, "posts.approve", brandId),
    hasPermission(user.id, access.agencyId, "posts.approve_internal", brandId),
    hasPermission(user.id, access.agencyId, "comments.write", brandId),
    hasPermission(user.id, access.agencyId, "comments.resolve", brandId),
  ]);

  const [comments, lastApproval, agencyName, brand] = await Promise.all([
    prisma.comment.findMany({
      where: {
        postId,
        // Cliente NO ve comentarios internos (revisión privada del equipo).
        ...(result.access.role === "client" ? { internal: false } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: {
        user: true,
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.approval.findFirst({
      where: { postId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    getUserAgencyName(user.id),
    prisma.brand.findUnique({ where: { id: brandId } }),
  ]);

  return (
    <>
      <div className="mx-auto max-w-6xl">
        {(() => {
          const t = isAssetType(post.assetType) ? post.assetType : "social_post";
          const backHref =
            t === "social_post" ? `/brands/${brandId}` : `/brands/${brandId}?type=${t}`;
          const backLabel =
            t === "social_post" ? "Volver al feed" : `Volver a ${ASSET_TYPE_TAB_LABEL[t]}`;
          return (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          );
        })()}

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[post.status] ?? "bg-zinc-200"}`}
              >
                {STATUS_LABEL[post.status] ?? post.status}
              </span>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${assetTypeTint(post.assetType)}`}
              >
                {assetTypeLabel(post.assetType)}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900">
              {post.title ?? "Post"}
            </h1>
            <p className="text-xs text-zinc-500">
              {post.assetType === "social_post" && (
                <>
                  {post.platform} · {post.postType}
                  {post.scheduledAt && ` · ${new Date(post.scheduledAt).toLocaleString()}`}
                </>
              )}
              {post.assetType !== "social_post" && post.scheduledAt && (
                <>Programado: {new Date(post.scheduledAt).toLocaleString()}</>
              )}
            </p>
          </div>
          <PresenceIndicator postId={postId} />
        </div>

        {post.assetType === "web_design" && post.sourceUrl && (
          <div className="mt-5">
            <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-blue-50 ring-1 ring-blue-100">
                  <Globe className="h-4 w-4 text-blue-700" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                    Sitio en revisión
                  </p>
                  <p className="truncate font-mono text-[12px] text-zinc-800" title={post.sourceUrl}>
                    {post.sourceUrl}
                  </p>
                </div>
              </div>
              <a
                href={post.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir original
              </a>
            </div>
            {!post.imageUrl && (
              <div className="mt-3">
                <WebsiteEmbed url={post.sourceUrl} />
              </div>
            )}
          </div>
        )}

        {post.assetType === "video" && post.sourceUrl && (
          <div className="mt-5">
            <VideoEmbed url={post.sourceUrl} />
          </div>
        )}

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
          {post.assetType === "web_design" ? (
            <WebDesignBoard
              postId={post.id}
              brandId={brandId}
              imageUrl={post.imageUrl}
              sourceUrl={post.sourceUrl}
              widgetToken={result.access.role !== "client" ? brand?.widgetToken ?? null : null}
              brandBreakpoints={brand?.breakpoints ?? null}
              currentUserId={user.id}
              canComment={!post.deletedAt && (access.canEdit || access.canApprove)}
              isAgency={access.role !== "client"}
              postStatus={post.status}
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
                pageUrl: c.pageUrl,
                selector: c.selector,
                viewportW: c.viewportW,
                viewportH: c.viewportH,
                attachmentUrl: c.attachmentUrl,
                attachmentName: c.attachmentName,
                attachmentMime: c.attachmentMime,
                assignedToId: c.assignedToId,
                assignedToName: c.assignedTo?.name ?? c.assignedTo?.email ?? null,
                internal: c.internal,
              }))}
            />
          ) : (
          <PostBoard
            postId={post.id}
            imageUrl={post.imageUrl}
            images={images.map((i) => i.url)}
            canApprove={access.canApprove && access.role === "client"}
            canEdit={access.canEdit}
            canEditCaption={canEditCaption}
            canUploadMedia={canUploadMedia}
            canCreatePost={canCreatePost}
            canDelete={canDelete}
            canSchedule={canSchedule}
            canPublish={canPublish}
            canApprovePost={canApprovePost}
            canApproveInternal={canApproveInternal}
            canWriteComments={canWriteComments}
            canResolveComments={canResolveComments}
            isAgency={access.role !== "client"}
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
              internal: c.internal,
              attachmentUrl: c.attachmentUrl,
              attachmentName: c.attachmentName,
              attachmentMime: c.attachmentMime,
              pageUrl: c.pageUrl,
              selector: c.selector,
              viewportW: c.viewportW,
              viewportH: c.viewportH,
              scrollY: c.scrollY,
            }))}
          />
          )}
        </div>

        {images.length > 0 && (
          <div className="mt-6">
            <FileList
              files={images.map((i) => ({ url: i.url, mime: i.mime, name: i.name }))}
            />
          </div>
        )}

        {timeline.length > 0 && (
          <div className="mt-6">
            <Timeline events={timeline} />
          </div>
        )}
      </div>
    </>
  );
}
