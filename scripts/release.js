const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ...

async function uploadAsset(release, filePath, token) {
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);

  // upload_url looks like: https://uploads.github.com/repos/OWNER/REPO/releases/ID/assets{?name,label}
  const baseUploadUrl = release.upload_url.replace(/\{.*\}$/, '');
  const url = `${baseUploadUrl}?name=${encodeURIComponent(fileName)}`;

  // Do not read large release assets into one giant Buffer. In particular,
  // the Windows installer can exceed 1 GB. Node's fetch() body handling is
  // much more reliable here when the file is provided as a stream.
  const fileStream = fs.createReadStream(filePath);

  const res = await fetch(url, {
    method: 'POST',
    headers: githubHeaders(token, {
      'Content-Type': mimeTypeFor(fileName),
      'Content-Length': stat.size,
    }),
    body: fileStream,
    // Node's fetch requires this flag for streaming request bodies.
    duplex: 'half',
  });

  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new Error(
      `Failed to upload asset "${fileName}" (${res.status}): ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`
    );
  }

  const asset = await res.json();
  ok(`Uploaded asset "${fileName}".`);
  return asset;
}
