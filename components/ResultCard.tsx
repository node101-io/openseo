'use client';

import { useState } from 'react';
import { SearchResult, verifyProof } from '@/app/api';

interface ResultCardProps {
  result: SearchResult;
  index: number;
}

export function ResultCard({ result, index }: ResultCardProps) {
  const [verifyState, setVerifyState] = useState<
    'idle' | 'loading' | 'success' | 'failed'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerify = async () => {
    setVerifyState('loading');
    setErrorMessage(null);
    
    try {
      const response = await verifyProof(result.proof, result.root);
      
      if (response.success && response.verified) {
        setVerifyState('success');
      } else {
        setVerifyState('failed');
        setErrorMessage(response.error || response.message || 'Verification failed');
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

  // Get favicon URL
  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
      return null;
    }
  };

  return (
    <div
      className="result-card bg-white rounded-xl p-5 shadow-sm border border-gray-100 fade-in"
      style={{ animationDelay: `${index * 0.05}s` }}
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

          <a
            href={result.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-medium text-primary-600 hover:text-primary-700 hover:underline 
                       truncate block transition-colors"
          >
            {result.siteUrl}
          </a>

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

        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleVerify}
            disabled={verifyState === 'loading' || verifyState === 'success'}
            className={`verify-btn px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2
              ${
                verifyState === 'idle'
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : verifyState === 'loading'
                  ? 'bg-gray-100 text-gray-500 cursor-wait'
                  : verifyState === 'success'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }
              disabled:cursor-not-allowed transition-all`}
          >
            {verifyState === 'loading' && (
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
            {verifyState === 'success' && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {verifyState === 'failed' && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {verifyState === 'idle' && 'Verify'}
            {verifyState === 'loading' && 'Verifying...'}
            {verifyState === 'success' && 'Verified'}
            {verifyState === 'failed' && 'Retry'}
          </button>
          {verifyState === 'failed' && errorMessage && (
            <span className="text-xs text-red-500 max-w-[150px] text-right">
              {errorMessage.length > 50 ? errorMessage.substring(0, 50) + '...' : errorMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
