javascript// ============================================================
// API: Actualizar datos (solo admin) - con GZIP
// Endpoint: POST /api/actualizar
// ============================================================

import { gzipSync } from 'zlib';

const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const FILE_PATH = 'public/data.json.gz';
const BRANCH = 'main';

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
  if (!res.ok) {
    throw new Error(`Error al leer Sheet "${sheetName}": ${res.status}`);
  }
  const data = await res.json();
  const values = data.values || [];
  if (values.length === 0) return [];
  const headers = values[0];
  const rows = values.slice(1);
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] || '';
    });
    return obj;
  });
}

async function subirAGitHub(contenidoBuffer) {
  const baseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  
  const refRes = await fetch(`${baseUrl}/git/refs/heads/${BRANCH}`, { headers });
  if (!refRes.ok) throw new Error(`Error al obtener ref: ${refRes.status}`);
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha;
  
  const commitRes = await fetch(`${baseUrl}/git/commits/${latestCommitSha}`, { headers });
  if (!commitRes.ok) throw new Error(`Error al obtener commit: ${commitRes.status}`);
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;
  
  const base64Content = contenidoBuffer.toString('base64');
  const blobRes = await fetch(`${baseUrl}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: base64Content,
      encoding: 'base64',
    }),
  });
  if (!blobRes.ok) {
    const err = await blobRes.json().catch(() => ({}));
    throw new Error(`Error al crear blob: ${blobRes.status} - ${err.message || ''}`);
  }
  const blobData = await blobRes.json();
  
  const treeRes = await fetch(`${baseUrl}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [{
        path: FILE_PATH,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      }],
    }),
  });
  if (!treeRes.ok) throw new Error(`Error al crear tree: ${treeRes.status}`);
  const treeData = await treeRes.json();
  
  const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: `Actualización de datos: ${new Date().toLocaleString('es-AR')}`,
      tree: treeData.sha,
      parents: [latestCommitSha],
    }),
  });
  if (!newCommitRes.ok) throw new Error(`Error al crear commit: ${newCommitRes.status}`);
  const newCommitData = await newCommitRes.json();
  
  const updateRefRes = await fetch(`${baseUrl}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: newCommitData.sha,
      force: false,
    }),
  });
  if (!updateRefRes.ok) {
    const err = await updateRefRes.json().catch(() => ({}));
    throw new Error(`Error al actualizar rama: ${updateRefRes.status} - ${err.message || ''}`);
  }
  
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (!token || !validarTokenAdmin(token)) {
    return res.status(401).json({ error: 'No autorizado o token expirado' });
  }
  
  try {
    const vias = await descargarHoja('VIAS DE EXCEPCION', 'A:R');
    const alt = await descargarHoja('ALTERNATIVOS', 'A:Z');
    
    const viasFiltradas = vias.filter(r => 
      Object.values(r).some(v => v && v.toString().trim().length > 0)
    );
    const altFiltrados = alt.filter(r => 
      Object.values(r).some(v => v && v.toString().trim().length > 0)
    );
    
    const datos = {
      vias: viasFiltradas,
      alt: altFiltrados,
      updatedAt: new Date().toISOString(),
    };
    
    const json = JSON.stringify(datos);
    const sizeOriginal = Buffer.byteLength(json, 'utf-8');
    const compressed = gzipSync(json);
    const sizeCompressed = compressed.length;
    const ratio = ((1 - sizeCompressed / sizeOriginal) * 100).toFixed(1);
    
    await subirAGitHub(compressed);
    
    return res.status(200).json({
      success: true,
      message: 'Datos actualizados correctamente',
      stats: {
        vias: viasFiltradas.length,
        alt: altFiltrados.length,
        size_original_mb: (sizeOriginal / 1024 / 1024).toFixed(2),
        size_compressed_mb: (sizeCompressed / 1024 / 1024).toFixed(2),
        compression_ratio: `${ratio}%`,
      }
    });
    
  } catch (error) {
    console.error('Error en actualizar:', error);
    return res.status(500).json({
      error: 'Error al actualizar datos',
      details: error.message,
    });
  }
}








                            
