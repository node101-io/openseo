'use client';
import { useState, useMemo } from 'react';
import { SearchResult } from '../pages/api';
import { verifyProofClientSide } from '../app/proof-component';

export type VerifySingleResult = { verified: boolean; error?: string; verifyTime?: number };

interface ResultCardProps {
  result: SearchResult;
  index: number;
  verifyAllResult?: VerifySingleResult | null;
  verifyAllInProgress?: boolean;
}

export function ResultCard({ result, index, verifyAllResult, verifyAllInProgress }: ResultCardProps) {
  const [verifyState, setVerifyState] = useState<
    'idle' | 'loading' | 'success' | 'failed'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifyTime, setVerifyTime] = useState<number | null>(null);

  const displayState = useMemo(() => {
    if (verifyAllResult !== undefined && verifyAllResult !== null) {
      return verifyAllResult.verified ? 'success' : 'failed';
    }
    if (verifyAllInProgress) return 'loading';
    return verifyState;
  }, [verifyAllResult, verifyAllInProgress, verifyState]);

  const displayError = verifyAllResult?.error ?? errorMessage;
  const displayVerifyTime = verifyAllResult?.verifyTime ?? verifyTime;

  const [htmlPreviewOpen, setHtmlPreviewOpen] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  const filecoinUrl = process.env.NEXT_PUBLIC_FILECOIN_URL || 'https://openseo-filecoin.openseo.workers.dev';

  const handleCardClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setHtmlPreviewOpen(true);
    setHtmlContent(null);
    setHtmlError(null);
    setHtmlLoading(true);
    try {
      const res = await fetch(`${filecoinUrl}/html_file/${encodeURIComponent(result.cid)}`);
      const data = await res.json();
      if (data.success && data.file != null) {
        setHtmlContent(data.file);
      } else {
        setHtmlError(data.error || 'Could not load page');
      }
    } catch (err: any) {
      setHtmlError(err.message || 'Could not load page');
    } finally {
      setHtmlLoading(false);
    }
  };

  const handleVerify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setVerifyState('loading');
    setErrorMessage(null);
    setVerifyTime(null);
    
    try {
      const response = await verifyProofClientSide(result.proof, result.root);
      
      if (response.verified) {
        setVerifyState('success');
        setVerifyTime(response.verifyTime || null);
      } else {
        setVerifyState('failed');
        setErrorMessage(response.error || 'Verification failed');
      }
    } catch (error: any) {
      setVerifyState('failed');
      setErrorMessage(error.message || 'Verification failed');
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
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(e as unknown as React.MouseEvent); } }}
      aria-label={`Önizle: ${getDomain(result.siteUrl)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 text-sm font-bold text-primary-600 bg-primary-50 rounded-full">
              {result.rank}
            </span>
            <span className="text-sm text-gray-500">
              Score: <span className="font-semibold text-gray-700">{result.totalScore}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 mb-1">
            {getFaviconUrl(result.siteUrl) && (
              <img
                src={getFaviconUrl(result.siteUrl)!}
                alt=""
                className="w-4 h-4"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="text-sm text-gray-500 truncate">
              {getDomain(result.siteUrl)}
            </span>
          </div>

          <p className="text-lg font-medium text-primary-600 truncate">
            {getDomain(result.siteUrl)}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {result.keywords.map((keyword, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-full"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleVerify}
            disabled={displayState === 'loading' || displayState === 'success'}
            className={`verify-btn px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2
              ${
                displayState === 'idle'
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : displayState === 'loading'
                  ? 'bg-gray-100 text-gray-500 cursor-wait'
                  : displayState === 'success'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }
              disabled:cursor-not-allowed transition-all`}
          >
            {displayState === 'loading' && (
              <svg className="h-4 w-4 spinner" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {displayState === 'success' && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {displayState === 'failed' && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {displayState === 'idle' && 'Verify'}
            {displayState === 'loading' && 'Verifying...'}
            {displayState === 'success' && (displayVerifyTime != null ? `Verified (${displayVerifyTime.toFixed(0)}ms)` : 'Verified')}
            {displayState === 'failed' && 'Retry'}
          </button>
          {displayState === 'failed' && displayError && (
            <span className="text-xs text-red-500 max-w-[150px] text-right">
              {displayError.length > 50 ? displayError.substring(0, 50) + '...' : displayError}
            </span>
          )}
        </div>
      </div>
    </div>

    {htmlPreviewOpen && (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Sayfa önizlemesi"
        onClick={() => setHtmlPreviewOpen(false)}
      >
        <div className="flex items-center justify-between mb-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className="text-white font-medium truncate">{getDomain(result.siteUrl)}</span>
          <button
            type="button"
            onClick={() => setHtmlPreviewOpen(false)}
            className="ml-4 px-3 py-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 text-sm font-medium"
          >
            Kapat
          </button>
        </div>
        <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-white relative" onClick={(e) => e.stopPropagation()}>
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
              title={`Önizleme: ${getDomain(result.siteUrl)}`}
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
