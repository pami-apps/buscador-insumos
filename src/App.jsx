import { useState, useEffect, useCallback, useRef } from 'react'
import { buscar, calcularStats } from './search'
import styles from './App.module.css'

// Descomprimir GZIP
async function decompressGzip(buffer) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(buffer)
      controller.close()
    },
  })
  const compressedStream = stream.pipeThrough(new DecompressionStream('gzip'))
  const decompressed = await new Response(compressedStream).arrayBuffer()
  const text = new TextDecoder().decode(decompressed)
  return JSON.parse(text)
}

const PRESTADORES = [
  'Todos',
  'ASOCIIACION MUTUAL PROACTIVA',
  'CEMIC',
  'CLIMO S.A. – CLNICA DEL BUEN PASTOR',
  'CPN S.A - IMAC',
  'SILVER CROSS AMRICA INC S.A',
  'CLINICA DE LA ESPERANZA - CELSO',
  'CLINICA PRIVADA INDEPENDENCIA',
  'HOSPITAL ITALIANO',
  'ICIME S.A- Cnica Maria Ward',
  'Instituto de Tratamiento Endoluminal BS. AS - ITEBA',
  'ENERI- DR. PEDRO LYLYK Y ASOC S.A.',
  'FUNDACION FAVALORO',
  'HOSPITAL Dr. Alberto DUHAU',
  'ITAC - NEPHROLOG',
  'SANATORIO GUEMES',
]

// Parsea valores tipo "$1.234.567,89" o "1234.56" o números → Number
function parsePrecio(val) {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  const str = String(val).replace(/\$/g, '').trim()
  let num
  if (str.includes(',')) {
    // Formato argentino: "1.234.567,89" → 1234567.89
    num = parseFloat(str.replace(/\./g, '').replace(',', '.'))
  } else {
    // Formato simple: "1234567" o "1234567.89"
    num = parseFloat(str.replace(/[^0-9.\-]/g, ''))
  }
  return isNaN(num) ? 0 : num
}

function fmt(num) {
  const n = parsePrecio(num)
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(val) {
  if (!val) return ''
  const d = new Date(val)
  if (isNaN(d)) return val
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── LOGIN USUARIO ─────────────────────────────────────────────────────────────
function Login({ onLogin, loggingIn }) {
  const [pass, setPass] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('https://buscador-insumos.vercel.app/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      })

      if (!response.ok) {
        setError(true)
        setShake(true)
        setTimeout(() => setShake(false), 500)
        return
      }

      const data = await response.json()
      sessionStorage.setItem('auth', '1')
      sessionStorage.setItem('userToken', data.token)
      onLogin()
    } catch (err) {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className={styles.loginWrap}>
      <div className={`${styles.loginBox} ${shake ? styles.shake : ''}`}>
        <div className={styles.loginLogo}>
          <span className={styles.loginIcon}>⬡</span>
          <h1>Buscador de Insumos</h1>
          <p>Sistema de consulta de precios</p>
        </div>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.loginField}>
            <label>Contraseña de acceso</label>
            <input
              type="password"
              value={pass}
              onChange={e => { setPass(e.target.value); setError(false) }}
              placeholder="••••••••••••••"
              className={error ? styles.inputError : ''}
              disabled={loggingIn}
              autoFocus
            />
            {error && <span className={styles.loginError}>Contraseña incorrecta</span>}
          </div>
          <button type="submit" className={styles.btnLogin} disabled={loggingIn}>
            {loggingIn ? 'Ingresando...' : 'Ingresar →'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── LOGIN ADMIN ───────────────────────────────────────────────────────────────
function AdminLogin({ onLogin, onClose }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoggingIn(true)

    try {
      const response = await fetch('https://buscador-insumos.vercel.app/api/auth-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password: pass }),
      })

      if (!response.ok) {
        setError('Usuario o contraseña incorrectos')
        setShake(true)
        setTimeout(() => setShake(false), 500)
        setLoggingIn(false)
        return
      }

      const data = await response.json()
      onLogin(data.token)
    } catch (err) {
      setError('Error al conectar')
      setLoggingIn(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.adminBox} ${shake ? styles.shake : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.adminHeader}>
          <span>🔐 Ingreso administrador</span>
          <button className={styles.btnClose} onClick={onClose} disabled={loggingIn}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.loginField}>
            <label>Usuario</label>
            <input
              type="text"
              value={user}
              onChange={e => { setUser(e.target.value); setError('') }}
              placeholder="administrador"
              disabled={loggingIn}
              autoFocus
            />
          </div>
          <div className={styles.loginField}>
            <label>Contraseña</label>
            <input
              type="password"
              value={pass}
              onChange={e => { setPass(e.target.value); setError('') }}
              placeholder="••••••••••••••"
              disabled={loggingIn}
            />
          </div>
          {error && <span className={styles.loginError}>{error}</span>}
          <button type="submit" className={styles.btnLogin} disabled={loggingIn}>
            {loggingIn ? 'Verificando...' : 'Ingresar como admin →'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── STATS BAR ────────────────────────────────────────────────────────────────
function StatsBar({ data, color }) {
  if (!data || data.length === 0) return null

  // Pasamos los strings crudos a calcularStats (que sabe parsear formato argentino)
  const precios = data.map(d => d.Precio || d.PRECIO || d.precio || d.IMPORTE || d.IMPORTE_PESOS || 0)
  const stats = calcularStats(precios)

  return (
    <div className={styles.statsBar} style={{ '--accent': color }}>
      {[
        { label: 'Media', val: stats.media },
        { label: 'Mediana', val: stats.mediana },
        { label: 'Mín', val: stats.min },
        { label: 'Máx', val: stats.max },
      ].map(s => (
        <div key={s.label} className={styles.statItem}>
          <span className={styles.statVal}>{fmt(s.val)}</span>
          <span className={styles.statLabel}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── TABLA RESULTADOS ─────────────────────────────────────────────────────────
function TablaResultados({ data, tipo, onSelect }) {
  if (!data) return null
  if (data.length === 0) return <div className={styles.noResults}>Sin coincidencias</div>

  // NOMBRE_NORMALIZADO es el campo de alternativos; DESCRIPCION para vías
  const getNombre = (row) => row.NOMBRE_NORMALIZADO || row.DESCRIPCION || row.INSUMO || row.nombre || row.NOMBRE || row.descripcion || 'Sin nombre'
  const getUgl = (row) => row.ugl || row.UGL || row.C_UGL || '—'
  const getFecha = (row) => row.fecha || row.Fecha || row.F_CAMBIO || row.F_SOLICITUD || ''
  const getPrecio = (row) => row.Precio || row.PRECIO || row.precio || row.IMPORTE || row.IMPORTE_PESOS || '0'
  const getPrestador = (row) => row.prestador || row.PRESTADOR || row.prestador_cod || '—'

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ width: 48 }}>UGL</th>
            <th>Descripción</th>
            <th style={{ width: 130 }}>Precio</th>
            <th style={{ width: 120 }}>Info</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={styles.rowClickable} onClick={() => onSelect({ row, tipo })}>
              <td><span className={styles.uglBadge}>{getUgl(row)}</span></td>
              <td>
                <span className={styles.desc}>{getNombre(row)}</span>
                {getPrestador(row) && getPrestador(row) !== '—' && <span className={styles.sub}>{getPrestador(row)}</span>}
              </td>
              <td><span className={styles.price}>{fmt(getPrecio(row))}</span></td>
              <td>
                <span className={styles.dateStr}>{formatDate(getFecha(row))}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── FICHA DETALLE ────────────────────────────────────────────────────────────
function val(v) {
  if (v === null || v === undefined || v === '') return '—'
  return v
}

function Ficha({ item, tipo, onClose }) {
  const { row } = item
  const esVias = tipo === 'vias'
  const titulo = esVias ? 'Ficha — Vías de Excepción' : 'Ficha — Alternativos'
  const accent = esVias ? '#3b82f6' : '#22c55e'

  const campos = esVias
    ? [
        { label: 'Código de insumo', value: val(row.INSUMO || row.insumo) },
        { label: 'Descripción', value: val(row.DESCRIPCION || row.nombre || row.NOMBRE), full: true },
        { label: 'UGL', value: val(row.C_UGL || row.ugl || row.UGL) },
        { label: 'Prestador', value: val(row.PRESTADOR || row.DETALLE_PRESTADOR || row.prestador) },
        { label: 'Proveedor', value: val(row.PROVEEDOR || row.proveedor) },
        { label: 'Fecha', value: val(formatDate(row.F_CAMBIO || row.F_SOLICITUD)) },
        { label: 'Precio', value: (row.PRECIO || row.precio) ? fmt(row.PRECIO || row.precio) : '—', highlight: true },
      ]
    : [
        { label: 'Presupuesto N°', value: val(row['PRESUPUESTO NRO'] || row.presupuesto_nro || row.PRESUPUESTO_NRO) },
        { label: 'Afiliado', value: val(row.Nombre || row.nombre || row.NOMBRE), full: true },
        { label: 'Prestador', value: val(row.PRESTADOR || row.prestador), full: true },
        { label: 'UGL', value: val(row.UGL || row.ugl) },
        { label: 'Insumo', value: val(row.NOMBRE_NORMALIZADO || row.INSUMO || row.insumo || row.Insumo), full: true },
        { label: 'Fecha', value: val(formatDate(row.Fecha || row.fecha)) },
        { label: 'Unidades', value: val(row.unidades) },
        { label: 'Precio', value: (row.Precio || row.PRECIO || row.IMPORTE) ? fmt(row.Precio || row.PRECIO || row.IMPORTE) : '—', highlight: true },
      ]

  return (
    <div className={styles.fichaWrap} style={{ '--accent': accent }}>
      <div className={styles.fichaHeader}>
        <button className={styles.btnVolver} onClick={onClose}>← Volver</button>
        <div className={styles.fichaTitleBlock}>
          <h2 className={styles.fichaTitle}>{titulo}</h2>
        </div>
      </div>

      <div className={styles.fichaGrid}>
        {campos.map((c, i) => (
          <div
            key={i}
            className={`${styles.fichaField} ${c.full ? styles.fichaFieldFull : ''} ${c.highlight ? styles.fichaFieldHighlight : ''}`}
          >
            <span className={styles.fichaLabel}>{c.label}</span>
            <span className={styles.fichaValue}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => sessionStorage.getItem('auth') === '1')
  const [loggingIn, setLoggingIn] = useState(false)
  const [data, setData] = useState({ vias: [], alt: [] })
  const [loadState, setLoadState] = useState('idle')
  const [loadMsg, setLoadMsg] = useState('')
  const [cacheTs, setCacheTs] = useState(null)

  // Admin
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [updating, setUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [updateOk, setUpdateOk] = useState(null)

  // Search
  const [termino, setTermino] = useState('')
  const [fecha, setFecha] = useState('')
  const [ugl, setUgl] = useState('')
  const [prestador, setPrestador] = useState('Todos')
  const [resVias, setResVias] = useState(null)
  const [resAlt, setResAlt] = useState(null)
  const [searched, setSearched] = useState(false)
  const [itemSel, setItemSel] = useState(null)
  const terminoRef = useRef(null)

  const handleLogin = () => {
    setLoggedIn(true)
  }

  // Cargar datos al ingresar (desde data.json.gz)
  useEffect(() => {
    if (!loggedIn) return
    cargarDatos()
    setTimeout(() => terminoRef.current?.focus(), 100)
  }, [loggedIn])

  const cargarDatos = useCallback(async () => {
    setLoadState('loading')
    setLoadMsg('Cargando datos...')

    try {
      // Descargar data.json.gz desde GitHub
      const response = await fetch('https://raw.githubusercontent.com/pami-apps/buscador-insumos/main/public/data.json.gz')
      if (!response.ok) throw new Error('No se pudo descargar data.json.gz')

      const buffer = await response.arrayBuffer()
      const result = await decompressGzip(new Uint8Array(buffer))

      window.__data = result // para inspección manual en consola

      setData(result)
      setCacheTs(new Date())
      setLoadState('ready')
      setLoadMsg('')
    } catch (err) {
      console.error(err)
      setLoadState('error')
      setLoadMsg(err.message || 'Error al cargar datos.')
    }
  }, [])

  // Admin: actualizar datos
  const handleActualizar = useCallback(async () => {
    setUpdating(true)
    setUpdateMsg('Actualizando datos...')
    setUpdateOk(null)

    try {
      const response = await fetch('https://buscador-insumos.vercel.app/api/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
        body: '{}',
      })

      if (!response.ok) throw new Error(`Error ${response.status}`)

      const result = await response.json()
      setUpdateMsg(`✓ Datos actualizados: ${result.stats.vias} vías, ${result.stats.alt} alternativos.`)
      setUpdateOk(true)

      // Recargar datos locales
      setTimeout(() => cargarDatos(), 1000)
    } catch (err) {
      console.error(err)
      setUpdateMsg('✗ Error: ' + err.message)
      setUpdateOk(false)
    } finally {
      setUpdating(false)
    }
  }, [adminToken, cargarDatos])

  const handleAdminLogin = (token) => {
    setAdminToken(token)
    setIsAdmin(true)
    setShowAdminLogin(false)
  }

  const handleSearch = useCallback(() => {
    if (!termino.trim()) return

    const fechaMinima = fecha
      ? (() => { const d = new Date(fecha); d.setHours(0,0,0,0); return d })()
      : null

    const resV = buscar(data.vias, termino, fechaMinima, ugl, null)
    const resA = buscar(data.alt, termino, fechaMinima, ugl, prestador)

    setResVias(resV)
    setResAlt(resA)
    setSearched(true)
    setItemSel(null)
  }, [termino, fecha, ugl, prestador, data])

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch() }

  if (!loggedIn) return <Login onLogin={handleLogin} loggingIn={loggingIn} />

  return (
    <div className={styles.app}>
      {/* MODAL ADMIN LOGIN */}
      {showAdminLogin && (
        <AdminLogin
          onLogin={handleAdminLogin}
          onClose={() => setShowAdminLogin(false)}
        />
      )}

      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>⬡</span>
          <div>
            <h1 className={styles.headerTitle}>Buscador de Insumos</h1>
            <span className={styles.headerSub}>
              {loadState === 'ready'
                ? `${data.vias.length.toLocaleString()} VE · ${data.alt.length.toLocaleString()} ALT`
                : loadState === 'loading' ? 'Cargando...' : ''}
              {cacheTs && (
                <span className={styles.cacheInfo}> · Datos al {formatDate(cacheTs)}</span>
              )}
            </span>
          </div>
        </div>

        <div className={styles.headerRight}>
          {isAdmin ? (
            <div className={styles.adminPanel}>
              <span className={styles.adminBadge}>🔐 Admin</span>
              <button
                className={styles.btnActualizar}
                onClick={handleActualizar}
                disabled={updating}
              >
                {updating ? '⟳ Actualizando...' : '⟳ Actualizar datos'}
              </button>
              <button
                className={styles.btnAdminOut}
                onClick={() => { setIsAdmin(false); setAdminToken(''); setUpdateMsg(''); setUpdateOk(null) }}
              >
                Salir
              </button>
            </div>
          ) : (
            <button
              className={styles.btnAdminLink}
              onClick={() => setShowAdminLogin(true)}
            >
              🔐 Ingreso admin
            </button>
          )}
        </div>
      </header>

      {/* MENSAJE ACTUALIZACIÓN */}
      {updateMsg && (
        <div className={updateOk === true ? styles.successBanner : updateOk === false ? styles.errorBanner : styles.loadBanner}>
          {updating && <span className={styles.spinner} />} {updateMsg}
        </div>
      )}

      {/* LOADING / ERROR */}
      {loadState === 'loading' && !updateMsg && (
        <div className={styles.loadBanner}>
          <span className={styles.spinner} /> {loadMsg}
        </div>
      )}
      {loadState === 'error' && (
        <div className={styles.errorBanner}>{loadMsg}</div>
      )}

      {/* BUSCADOR */}
      <div className={styles.searchBox}>
        <div className={`${styles.inputGroup} ${styles.gSearch}`}>
          <label>Insumo <span className={styles.hint}>(comillas "" para búsqueda exacta)</span></label>
          <input
            ref={terminoRef}
            type="text"
            value={termino}
            onChange={e => setTermino(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: cateter foley silicon..."
            disabled={loadState !== 'ready'}
          />
        </div>

        <div className={`${styles.inputGroup} ${styles.gUgl}`}>
          <label>UGL</label>
          <input
            type="text"
            value={ugl}
            onChange={e => setUgl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="N°"
            disabled={loadState !== 'ready'}
          />
        </div>

        <div className={`${styles.inputGroup} ${styles.gDate}`}>
          <label>Fecha mín.</label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            disabled={loadState !== 'ready'}
          />
        </div>

        <div className={`${styles.inputGroup} ${styles.gPrest}`}>
          <label>Prestador <span className={styles.hint}>(solo Alt.)</span></label>
          <select
            value={prestador}
            onChange={e => setPrestador(e.target.value)}
            disabled={loadState !== 'ready'}
          >
            {PRESTADORES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <button
          className={styles.btnSearch}
          onClick={handleSearch}
          disabled={loadState !== 'ready' || !termino.trim()}
        >
          Buscar
        </button>
      </div>

      {/* FICHA DETALLE */}
      {searched && itemSel && (
        <Ficha item={itemSel} tipo={itemSel.tipo} onClose={() => setItemSel(null)} />
      )}

      {/* RESULTADOS */}
      {searched && !itemSel && (
        <div className={styles.resultsGrid}>
          <div className={`${styles.column} ${styles.colVias}`}>
            <div className={styles.colHeader}>
              <div className={styles.colTitleRow}>
                <span className={styles.colDot} style={{ background: '#3b82f6' }} />
                <h2>Vías de Excepción</h2>
                <span className={styles.countBadge} style={{ '--c': '#3b82f6' }}>
                  {resVias?.length ?? 0}
                </span>
              </div>
              <StatsBar data={resVias} color="#3b82f6" />
            </div>
            <TablaResultados data={resVias} tipo="vias" onSelect={setItemSel} />
          </div>

          <div className={`${styles.column} ${styles.colAlt}`}>
            <div className={styles.colHeader}>
              <div className={styles.colTitleRow}>
                <span className={styles.colDot} style={{ background: '#22c55e' }} />
                <h2>Alternativos</h2>
                <span className={styles.countBadge} style={{ '--c': '#22c55e' }}>
                  {resAlt?.length ?? 0}
                </span>
              </div>
              <StatsBar data={resAlt} color="#22c55e" />
            </div>
            <TablaResultados data={resAlt} tipo="alt" onSelect={setItemSel} />
          </div>
        </div>
      )}

      {!searched && loadState === 'ready' && (
        <div className={styles.emptyState}>
          <span>Ingresá un término para comenzar la búsqueda</span>
        </div>
      )}
    </div>
  )
}
