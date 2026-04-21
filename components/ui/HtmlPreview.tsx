"use client";

import { useEffect, useRef, useState } from "react";

interface HtmlPreviewProps {
  html: string;
}

export function HtmlPreview({ html }: HtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; margin: 0; }
        img { max-width: 100%; }
      </style>
    </head><body>${html}</body></html>`);
    doc.close();

    const resizeObserver = new ResizeObserver(() => {
      const body = iframe.contentDocument?.body;
      if (body) setHeight(Math.max(200, body.scrollHeight + 40));
    });

    if (iframe.contentDocument?.body) {
      resizeObserver.observe(iframe.contentDocument.body);
    }

    return () => resizeObserver.disconnect();
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      style={{ height }}
      className="w-full border border-gray-200 rounded-lg bg-white"
      title="HTML 預覽"
    />
  );
}
