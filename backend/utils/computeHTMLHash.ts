import crypto from 'node:crypto';

const FETCH_TIMEOUT = 3000;

export default async function(website_url: string): Promise<string | Error> {
  const response = await fetch(website_url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT)
  }).catch(err => {
    if (err.name === 'AbortError')
      return new Error('fetch_timeout', { cause: err.message });

    return new Error('failed_to_fetch_html', { cause: err.message });
  });

  if (response instanceof Error)
    return response;

  if (!response.ok)
    return new Error(`Failed to fetch HTML from ${website_url}`);

  const html = await response.text()
    .catch(err => new Error('failed_to_fetch_html', { cause: err.message }));

  if (html instanceof Error)
    return html;

  const html_hash = crypto.createHash('sha256').update(html).digest('hex'); // TODO: use Poseidon 2

  return html_hash;
};
