// ============================================================
// MOTOR DE BÚSQUEDA - AND + Fuzzy Matching
// ============================================================
// Busca en campos de descripción del INSUMO (no del afiliado).
//
// VIAS DE EXCEPCION: DESCRIPCION, INSUMO, PRESTADOR, PROVEEDOR,
//   DETALLE, DETALLE_SUB, D_TIPO_SOLICITUD, ESPEC_TECNICAS, D_OBSERVACION
// ALTERNATIVOS: NOMBRE_NORMALIZADO, INSUMO (si existe), PRESTADOR
// ============================================================

const FUZZY_THRESHOLD = 0.70

function levenshteinDistance(a, b) {
  a = String(a ?? '')
  b = String(b ?? '')
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],
          dp[i][j - 1],
          dp[i - 1][j - 1]
        )
      }
    }
  }

  return dp[m][n]
}

function similitud(a, b) {
  a = String(a ?? '')
  b = String(b ?? '')
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

export function buscar(datos, termino, fechaMinima = null, ugl = '', prestador = 'Todos') {
  if (!datos || !Array.isArray(datos)) return []
  if (!termino || !termino.trim()) return []

  // Detectar búsqueda exacta (entre comillas)
  const esExacta = termino.startsWith('"') && termino.endsWith('"')
  const terminoLimpio = esExacta ? termino.slice(1, -1).toLowerCase() : termino.toLowerCase()

  return datos.filter(row => {
    if (!row) return false

    // 1. Filtro por fecha
    if (fechaMinima) {
      const rowFecha = row.fecha || row.Fecha || row.F_CAMBIO || row.F_SOLICITUD || null
      if (rowFecha) {
        const d = new Date(rowFecha)
        if (!isNaN(d) && d < fechaMinima) return false
      }
    }

    // 2. Filtro por UGL
    if (ugl && ugl.trim()) {
      const rowUgl = (row.ugl || row.UGL || row.C_UGL || '').toString()
      if (!rowUgl.includes(ugl)) return false
    }

    // 3. Filtro por Prestador (solo aplica a ALT)
    if (prestador && prestador !== 'Todos') {
      const rowPrestador = (row.prestador || row.PRESTADOR || '').toString().toLowerCase()
      if (!rowPrestador.includes(prestador.toLowerCase())) return false
    }

    // 4. Búsqueda de texto en campos de descripción del INSUMO
    // ⚠️ NO se incluye row.Nombre (afiliado en ALT) para evitar falsos positivos
    const campos = [
      // Descripción principal del insumo
      row.NOMBRE_NORMALIZADO || '',                  // ALT
      row.DESCRIPCION || row.descripcion || '',      // VIAS
      // Insumo (algunas filas viejas de ALT lo tenían)
      row.INSUMO || row.insumo || row.Insumo || '',
      // Prestador / proveedor
      row.PRESTADOR || row.prestador || '',
      row.DETALLE_PRESTADOR || '',                   // VIAS
      row.PROVEEDOR || row.proveedor || '',          // VIAS
      // Detalle / observaciones (VIAS)
      row.DETALLE || row.detalle || '',
      row.DETALLE_SUB || row.detalle_sub || '',
      row.D_TIPO_SOLICITUD || row.d_tipo_solicitud || '',
      row.ESPEC_TECNICAS || row.espec_tecnicas || '',
      row.D_OBSERVACION || row.d_observacion || '',
    ]
    const textoCompleto = campos.map(c => String(c ?? '')).join(' ').toLowerCase()

    if (esExacta) {
      return textoCompleto.includes(terminoLimpio)
    } else {
      const palabras = terminoLimpio.split(/\s+/).filter(p => p.length > 0)
      return palabras.every(palabra => {
        if (textoCompleto.includes(palabra)) return true
        if (palabra.length > 4) {
          const palabrasTexto = textoCompleto.split(/\s+/).filter(p => p.length > 0)
          try {
            return palabrasTexto.some(pt => similitud(palabra, pt) >= FUZZY_THRESHOLD)
          } catch (e) {
            return false
          }
        }
        return false
      })
    }
  })
}

export function calcularStats(precios) {
  if (!precios || precios.length === 0) {
    return { media: 0, mediana: 0, min: 0, max: 0 }
  }

  const numeros = precios
    .map(p => {
      if (typeof p === 'number') return p
      const str = String(p ?? '').replace(/\$/g, '').trim()
      let num
      if (str.includes(',')) {
        // Formato argentino: "1.234.567,89" → 1234567.89
        num = parseFloat(str.replace(/\./g, '').replace(',', '.'))
      } else {
        num = parseFloat(str.replace(/[^0-9.]/g, ''))
      }
      return isNaN(num) ? 0 : num
    })
    .filter(n => n > 0)
    .sort((a, b) => a - b)

  if (numeros.length === 0) return { media: 0, mediana: 0, min: 0, max: 0 }

  const suma = numeros.reduce((a, b) => a + b, 0)
  const media = suma / numeros.length

  const mid = Math.floor(numeros.length / 2)
  const mediana = numeros.length % 2 === 0
    ? (numeros[mid - 1] + numeros[mid]) / 2
    : numeros[mid]

  const min = numeros[0]
  const max = numeros[numeros.length - 1]

  return { media, mediana, min, max }
}
