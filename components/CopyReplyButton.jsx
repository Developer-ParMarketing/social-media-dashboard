"use client";

import { useCallback, useState } from "react";

/** Small corner copy control for suggested replies */
export default function CopyReplyButton({ text, className = "" }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const value = (text || "").trim();
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard unavailable */
        }
    }, [text]);

    if (!text?.trim()) return null;

    return (
        <button
            type="button"
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy reply"}
            aria-label={copied ? "Copied" : "Copy reply"}
            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${
                copied
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white/95 text-gray-500 border-gray-200 hover:text-gray-800 hover:border-gray-300 shadow-sm"
            } ${className}`}
        >
            {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
            )}
        </button>
    );
}
