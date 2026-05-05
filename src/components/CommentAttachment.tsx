import { Download, FileIcon } from "lucide-react";

export default function CommentAttachment({
  url,
  name,
  mime,
}: {
  url: string;
  name: string | null | undefined;
  mime: string | null | undefined;
}) {
  const safeName = name ?? "archivo";
  const isImage = (mime ?? "").startsWith("image/");

  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block w-fit overflow-hidden rounded-lg ring-1 ring-zinc-200 transition hover:ring-fuchsia-300"
        title={safeName}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={safeName}
          className="max-h-48 max-w-full object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={safeName}
      className="mt-1.5 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition hover:bg-zinc-100"
    >
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded bg-white text-zinc-500">
        <FileIcon className="h-3.5 w-3.5" />
      </span>
      <span className="max-w-[180px] truncate">{safeName}</span>
      <Download className="h-3 w-3 text-zinc-400" />
    </a>
  );
}
