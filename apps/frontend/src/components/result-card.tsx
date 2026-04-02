"use client";
import { useState, useMemo, useEffect } from "react";
import { SearchResult } from "../pages/api";
import { verifyProofClientSide } from "../app/proof-component";

function toString(result: SearchResult): string {
  return [
    result.cid,
    result.root,
    result.proof,
    result.siteUrl,
    String(result.rank),
    result.id,
    (result.keywordScores
      ? [...result.keywordScores].map((k) => `${k.keyword}:${k.score}`)
      : [...(result.keywords || [])]
    )
      .sort()
      .join(","),
    String(result.totalScore),
    result.createdAt,
  ].join("|");
}

export async function hashResult(result: SearchResult): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(toString(result)),
  );
  return new Uint8Array(digest).toHex();
}

function getStoredVerified(hash: string): string | null {
  return window.localStorage.getItem(`${hash}`);
}

export function setStoredVerified(hash: string, status: 1 | 0) {
  try {
    window.localStorage.setItem(`${hash}`, String(status));
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === "QuataExceedError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      window.localStorage.clear();
      window.localStorage.setItem(`${hash}`, String(status));
    }
  }
}

interface ResultCardProps {
  result: SearchResult;
  index: number;
  verifyAllResult?: "1" | "0" | null;
  verifyAllInProgress?: boolean;
  searchQuery: string;
}

export function ResultCard({
  result,
  index,
  verifyAllResult,
  verifyAllInProgress,
  searchQuery,
}: ResultCardProps) {
  const [verifyState, setVerifyState] = useState<
    "idle" | "loading" | "success" | "failed"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultHash, setResultHash] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hashResult(result).then((h) => {
      if (!cancelled) setResultHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  useEffect(() => {
    if (resultHash == null) return;

    const status = getStoredVerified(resultHash);

    if (status === "1") {
      setVerifyState("success");
      setIsCached(true);
    } else if (status === "0") {
      setVerifyState("failed");
      setIsCached(false);
    } else {
      setVerifyState("idle");
      setIsCached(false);
    }
  }, [resultHash]);

  const displayState = useMemo(() => {
    if (verifyAllResult !== undefined && verifyAllResult !== null) {
      return verifyAllResult === "1" ? "success" : "failed";
    }
    if (verifyAllInProgress) return "loading";
    return verifyState;
  }, [verifyAllResult, verifyAllInProgress, verifyState]);

  const displayedScore = useMemo(() => {
    if (!result.keywordScores || !searchQuery) return result.totalScore;
    const match = result.keywordScores.find(
      (k) => k.keyword.toLowerCase() === searchQuery.toLowerCase(),
    );

    return match ? match.score : result.totalScore;
  }, [result.keywordScores, searchQuery, result.totalScore]);

  const [htmlPreviewOpen, setHtmlPreviewOpen] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);
  const filecoinUrl =
    process.env.NEXT_PUBLIC_FILECOIN_URL ||
    "https://openseo-filecoin.openseo.workers.dev";

  const handleCardClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setHtmlPreviewOpen(true);
    setHtmlContent(null);
    setHtmlError(null);
    setHtmlLoading(true);
    try {
      const res = await fetch(
        `${filecoinUrl}/html_file/${encodeURIComponent(result.cid)}`,
      );
      const data = await res.json();
      if (data.success && data.file != null) {
        setHtmlContent(data.file);
      } else {
        setHtmlError(data.error || "Could not load page");
      }
    } catch (err: any) {
      setHtmlError(err.message || "Could not load page");
    } finally {
      setHtmlLoading(false);
    }
  };

  const handleVerify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setVerifyState("loading");
    setIsCached(false);
    setErrorMessage(null);
    const hash = resultHash ?? (await hashResult(result));

    try {
      const response = await verifyProofClientSide(
        result.proof,
        result.cid,
        result.totalScore,
        result.keywordScores,
      );
      if (response.verified) {
        setVerifyState("success");
        setStoredVerified(hash, 1);
      } else {
        setVerifyState("failed");
        const err = response.error || "Verification failed";
        setErrorMessage(err);
        setStoredVerified(hash, 0);
      }
    } catch (error: any) {
      setVerifyState("failed");
      const err = error.message || "Verification failed";
      setErrorMessage(err);
      setStoredVerified(hash, 0);
    }
  };

  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  };

  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
      return null;
    }
  };

  return (
    <>
      <div
        className="result-card bg-white rounded-xl p-5 shadow-sm border border-gray-100 fade-in cursor-pointer hover:border-primary-200 hover:shadow-md transition-all"
        style={{ animationDelay: `${index * 0.05}s` }}
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick(e as unknown as React.MouseEvent);
          }
        }}
        aria-label={`${getDomain(result.siteUrl)}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center justify-center w-7 h-7 text-sm font-bold text-primary-600 bg-primary-50 rounded-full">
                {result.rank}
              </span>
              <span className="text-sm text-gray-500">
                Score:{" "}
                <span className="font-semibold text-gray-700">
                  {displayedScore}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2 mb-1">
              {getFaviconUrl(result.siteUrl) && (
                <img
                  src={getFaviconUrl(result.siteUrl)!}
                  alt=""
                  className="w-4 h-4"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>

            <p className="text-md font-medium text-primary-600 truncate">
              {getDomain(result.siteUrl)}
            </p>
          </div>

          <div
            className="flex flex-col items-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleVerify}
              disabled={
                displayState === "loading" || displayState === "success"
              }
              className={`verify-btn px-4 py-2 text-sm font-medium rounded-lg flex flex-col justify-center items-start
              ${
                displayState === "idle"
                  ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  : displayState === "loading"
                    ? "bg-gray-100 text-gray-500 cursor-wait"
                    : displayState === "success"
                      ? "bg-green-100 text-green-700 text-sm"
                      : "bg-red-100 text-red-700 hover:bg-red-200"
              }
              disabled:cursor-not-allowed transition-all`}
            >
              <div className="flex items-center gap-1.5">
                {displayState === "loading" && (
                  <svg className="h-5 w-5 spinner" viewBox="0 0 24 24">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="opacity-25"
                    />
                    <path
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      className="opacity-75"
                    />
                  </svg>
                )}
                {displayState === "success" && (
                  <svg
                    className="h-5 w-5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {displayState === "failed" && (
                  <svg
                    className="h-5 w-5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}

                <span className="leading-none mt-[1px]">
                  {displayState === "loading" && "Verifying..."}
                  {displayState === "success" && "Verified"}
                  {displayState === "failed" && "Retry"}
                  {displayState === "idle" && "Verify"}
                </span>
              </div>

              {displayState === "success" && isCached && (
                <span className="text-[11px] text-gray-500/90 font-normal mt-1 leading-none pl-[26px]">
                  (from cache)
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="flex overflow-x-auto gap-2 mt-4 pb-1 scroll-smooth">
          {result.keywordScores?.map((item, i) => {
            const isSearched =
              item.keyword.toLowerCase() === searchQuery.toLowerCase();

            return (
              <span
                key={i}
                className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap pl-2 pr-1 py-0.5 text-sm font-normal rounded-md border transition-colors ${
                  isSearched
                    ? "bg-primary-50 text-primary-700 border-primary-200"
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                <span>{item.keyword}</span>
                <span
                  className={`flex items-center justify-center min-w-[20px] h-[20px] text-[11px] font-bold rounded shadow-sm ${
                    isSearched
                      ? "bg-primary-600 text-white"
                      : "bg-white text-primary-700"
                  }`}
                >
                  {item.score}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {htmlPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setHtmlPreviewOpen(false)}
        >
          <div
            className="flex items-center justify-between mb-2 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-white font-medium truncate">
              {getDomain(result.siteUrl)}
            </span>
            <button
              type="button"
              onClick={() => setHtmlPreviewOpen(false)}
              className="ml-4 px-3 py-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 text-sm font-medium"
            >
              Kapat
            </button>
          </div>
          <div
            className="flex-1 min-h-0 rounded-lg overflow-hidden bg-white relative"
            onClick={(e) => e.stopPropagation()}
          >
            {htmlLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                <span className="text-gray-500">Yükleniyor…</span>
              </div>
            )}
            {!htmlLoading && htmlError && (
              <div className="absolute inset-0 flex items-center justify-center text-red-600 p-4">
                {htmlError}
              </div>
            )}
            {!htmlLoading && htmlContent != null && (
              <iframe
                title={`${getDomain(result.siteUrl)}`}
                srcDoc={htmlContent}
                className="w-full h-full min-h-[60vh] border-0"
                sandbox="allow-same-origin allow-scripts"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
