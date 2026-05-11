// ============================================================
// MOTOR DE BÚSQUEDA - AND + Fuzzy Matching
// ============================================================

const FUZZY_THRESHOLD = 0.70

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0))
  
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (b[i - 1] === a[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }
  return dp[n][m]
}

function similitud(a, b) {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

export function buscar(datos, termino, fechaMinima = null, ugl = '', prestador = 'Todos') {
  if (!datos || !Array.isArray(datos)) return []
  if (!termino.trim()) return []
  
  // Detectar búsqueda exacta (entre comillas)
  const esExacta = termino.startsWith('"') && termino.endsWith('"')
  const terminoLimpio = esExacta ? termino.slice(1, -1).toLowerCase() : termino.toLowerCase()
  
  return datos.filter(row => {
    // 1. Filtro por fecha
    if (fechaMinima) {
      const rowFecha = row.fecha || row.Fecha || row.F_CAMBIO || null
      if (rowFecha) {
        const d = new Date(rowFecha)
        if (d < fechaMinima) return false
      }
    }
    
    // 2. Filtro por UGL
    if (ugl.trim()) {
      const rowUgl = (row.ugl || row.UGL || row.C_UGL || '').toString()
      if (!rowUgl.includes(ugl)) return false
    }
    
    // 3. Filtro por Prestador (solo para ALT)
    if (prestador && prestador !== 'Todos') {
      const rowPrestador = (row.prestador || row.PRESTADOR || '').toLowerCase()
      if (!rowPrestador.includes(prestador.toLowerCase())) return false
    }
    
    // 4. Búsqueda de texto
    const campos = [
      row.nombre || row.NOMBRE || row.DESCRIPCION || row.descripcion || '',
      row.insumo || row.INSUMO || '',
      row.proveedor || row.PROVEEDOR || '',
      row.prestador || row.PRESTADOR || '',
      row.detalle || row.DETALLE || '',
      row.d_tipo_solicitud || row.D_TIPO_SOLICITUD || '',
      row.espec_tecnicas || row.ESPEC_TECNICAS || '',
    ]
    
    const textoCompleto = campos.join(' ').toLowerCase()
    
    if (esExacta) {
      // Búsqueda exacta
      return textoCompleto.includes(terminoLimpio)
    } else {
      // Búsqueda AND + Fuzzy
      const palabras = terminoLimpio.split(/\s+/).filter(p => p.length > 0)
      
      return palabras.every(palabra => {
        // ¿Palabra exacta en el texto?
        if (textoCompleto.includes(palabra)) return true
        
        // ¿Palabra > 4 caracteres? → fuzzy matching
        if (palabra.length > 4) {
          const palabrasTexto = textoCompleto.split(/\s+/)
          return palabrasTexto.some(pt => similitud(palabra, pt) >= FUZZY_THRESHOLD)
        }
        
        // Palabras cortas deben ser exactas
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
      const num = parseFloat(p)
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
