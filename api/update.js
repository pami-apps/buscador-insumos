import { gzipSync } from 'zlib';

export const config = { maxDuration: 60 };

const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;

function validarTokenAdmin(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    if (decoded.type !== 'admin') return false;
    if (decoded.exp < Date.now()) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function descargarHoja(sheetName, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!${range}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet error: ${res.status}`);
  const data = await res.json();
  const values = data.values || [];
  if (values.length === 0) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || '');
    return obj;
  });
}

async function subirAGitHub(contenido) {
  const baseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  
  const ref = await fetch(`${baseUrl}/git/refs/heads/main`, { headers }).then(r => r.json());
  const commitRes = await fetch(`${baseUrl}/git/commits/${ref.object.sha}`, { headers }).then(r => r.json());
  const baseTreeSha = commitRes.tree.sha;
  
  const blobRes = await fetch(`${baseUrl}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: contenido.toString('base64'),
      encoding: 'base64',
    }),
  }).then(r => r.json());
  
  const treeRes = await fetch(`${baseUrl}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [{
        path: 'public/data.json.gz',
        mode: '100644',
        type: 'blob',
        sha: blobRes.sha,
      }],
    }),
  }).then(r => r.json());
  
  const commitRes2 = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: `Actualización: ${new Date().toLocaleString('es-AR')}`,
      tree: treeRes.sha,
      parents: [ref.object.sha],
    }),
  }).then(r => r.json());
  
  await fetch(`${baseUrl}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: commitRes2.sha }),
  });
  
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !validarTokenAdmin(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const vias = await descargarHoja('VIAS DE EXCEPCION', 'A:R');
    const alt = await descargarHoja('ALTERNATIVOS', 'A:Z');
    
    const datos = {
      vias: vias.filter(r => Object.values(r).some(v => v && v.toString().trim())),
      alt: alt.filter(r => Object.values(r).some(v => v && v.toString().trim())),
    };
    
    const json = JSON.stringify(datos);
    const compressed = gzipSync(json);
    
    await subirAGitHub(compressed);
    
    return res.status(200).json({
      success: true,
      stats: {
        vias: datos.vias.length,
        alt: datos.alt.length,
        compressed_mb: (compressed.length / 1024 / 1024).toFixed(2),
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
