const express = require("express")
const fs = require("fs")
const path = require("path")
const bodyParser = require("body-parser")
const multer = require("multer")
const crypto = require("crypto")
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib")
const { gerarArquivosCracha } = require("./utils/gerarCracha")
const gerarPdfCnh = require("./utils/gerarPdfCnh")
require("dotenv").config()

const app = express()
app.disable("x-powered-by")

const usuariosFile = "./database/usuarios.json"
const docsFile = "./database/documentos.json"
const recargasFile = "./database/recargas.json"
const cnhDigitalFile = "./database/cnh_digital.json"
const modelosEditaveisFile = "./database/modelos_editaveis.json"
const medicosModelosFile = "./database/medicos_modelos.json"
const sessoesFile = "./database/sessoes.json"

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000"
const APP_VALIDATION_BASE_URL = process.env.APP_VALIDATION_BASE_URL || APP_BASE_URL
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || ""
const MERCADO_PAGO_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET || ""
const CREDITS_PER_REAL = Number(process.env.CREDITS_PER_REAL || 2)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@admin.com"
const ADMIN_SENHA = process.env.ADMIN_SENHA || "1234"
const CUSTO_PADRAO_DOCUMENTO = 20
const TRUST_PROXY = String(process.env.TRUST_PROXY || "false").toLowerCase() === "true"
const TOKEN_TTL_HORAS = Number(process.env.TOKEN_TTL_HORAS || 24)
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || `${APP_BASE_URL},${APP_VALIDATION_BASE_URL}`)
  .split(",")
  .map(item => item.trim())
  .filter(Boolean)

if (TRUST_PROXY) {
  app.set("trust proxy", 1)
}

const MERCADO_PAGO_API_BASE = "https://api.mercadopago.com"

const GRUPOS_MODELO = ["UPA", "SUS", "HAPVIDA", "UNIMED", "ESPECIFICO"]
const TIPOS_CAMPO_SUPORTADOS = [
  "texto",
  "cpf",
  "data",
  "numero",
  "textarea",
  "select",
  "medico_select",
  "qrcode",
  "carimbo_png",
  "assinatura_png",
  "imagem",
  "campo_auto"
]

function garantirPasta(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function garantirArquivoJson(file, valorInicial = []) {
  const pasta = path.dirname(file)
  garantirPasta(pasta)

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(valorInicial, null, 2))
  }
}

garantirPasta("./database")
garantirPasta("./docs")
garantirPasta("./generated")
garantirPasta("./generated/crachas")
garantirPasta("./generated/cnh-pdf")
garantirPasta("./uploads")
garantirPasta("./uploads/modelos")
garantirPasta("./uploads/carimbos")
garantirPasta("./uploads/assinaturas")

garantirArquivoJson(usuariosFile, [])
garantirArquivoJson(docsFile, [])
garantirArquivoJson(recargasFile, [])
garantirArquivoJson(cnhDigitalFile, [])
garantirArquivoJson(modelosEditaveisFile, [])
garantirArquivoJson(medicosModelosFile, [])
garantirArquivoJson(sessoesFile, [])

function ler(file) {
  try {
    const conteudo = fs.readFileSync(file, "utf8")
    return JSON.parse(conteudo || "[]")
  } catch (error) {
    return []
  }
}

function salvar(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

function normalizarUsuario(valor) {
  return String(valor || "").trim().toLowerCase()
}

function slug(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

function agoraIso() {
  return new Date().toISOString()
}

function gerarId(prefixo) {
  return `${prefixo}_${Date.now()}_${Math.floor(Math.random() * 100000)}`
}

function sanitizarTexto(valor, limite = 5000) {
  return String(valor ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite)
}

function sanitizarPathRelativo(valor) {
  const texto = String(valor || "").replace(/\\/g, "/").trim()
  if (!texto) return ""
  if (texto.includes("..")) return ""
  return texto.replace(/^\/+/, "")
}

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor || "").trim())
}

function cpfSeguro(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 14)
}

function somenteNumeroTexto(valor, limite = 50) {
  return String(valor || "").replace(/[^0-9A-Za-z/-]/g, "").slice(0, limite)
}

function sanitizarGrupoModelo(grupo) {
  const valor = String(grupo || "").trim().toUpperCase()
  if (valor === "HAPVIDA") return "HAPVIDA"
  if (valor === "UNIMED") return "UNIMED"
  if (valor === "SUS") return "SUS"
  if (valor === "UPA") return "UPA"
  if (valor === "ESPECIFICO") return "ESPECIFICO"
  if (valor === "MODELOS ESPECIFICOS") return "ESPECIFICO"
  if (valor === "MODELOS ESPECÍFICOS") return "ESPECIFICO"
  return "ESPECIFICO"
}

function normalizarCategoriasAdicionais(lista = []) {
  if (!Array.isArray(lista)) return []

  return lista
    .map(item => ({
      categoria: sanitizarTexto(item?.categoria || item?.nome || "", 20),
      validade: sanitizarTexto(item?.validade || item?.data || "", 30)
    }))
    .filter(item => item.categoria || item.validade)
}

function getMercadoPagoHeaders(idempotencyKey = "") {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Access Token do Mercado Pago não configurado")
  }

  const headers = {
    Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  }

  if (idempotencyKey) {
    headers["X-Idempotency-Key"] = idempotencyKey
  }

  return headers
}

function obterIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "0.0.0.0"
  )
}

function origemPermitida(req) {
  const origin = String(req.headers.origin || "").trim()
  const referer = String(req.headers.referer || "").trim()

  if (!origin && !referer) {
    return true
  }

  const origemEncontrada = origin || (() => {
    try {
      return new URL(referer).origin
    } catch {
      return ""
    }
  })()

  return ALLOWED_ORIGINS.includes(origemEncontrada)
}

function middlewareCors(req, res, next) {
  const origin = String(req.headers.origin || "").trim()
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

  if (req.method === "OPTIONS") {
    return res.sendStatus(204)
  }

  next()
}

function middlewareSeguranca(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "SAMEORIGIN")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin")
  res.setHeader("Origin-Agent-Cluster", "?1")
  res.setHeader("X-DNS-Prefetch-Control", "off")

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    `connect-src 'self' ${ALLOWED_ORIGINS.join(" ")}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'self'"
  ].join("; ")

  res.setHeader("Content-Security-Policy", csp)
  next()
}

const rateMap = new Map()

function rateLimit({ janelaMs = 60000, limite = 60 } = {}) {
  return (req, res, next) => {
    const chave = `${obterIp(req)}:${req.path}`
    const agora = Date.now()
    const item = rateMap.get(chave) || { contador: 0, expira: agora + janelaMs }

    if (agora > item.expira) {
      item.contador = 0
      item.expira = agora + janelaMs
    }

    item.contador += 1
    rateMap.set(chave, item)

    if (item.contador > limite) {
      return res.status(429).json({ erro: "Muitas requisições. Tente novamente em instantes." })
    }

    next()
  }
}

function exigirOrigemValida(req, res, next) {
  if (!origemPermitida(req)) {
    return res.status(403).json({ erro: "Origem não permitida" })
  }
  next()
}

function limparSessoesExpiradas() {
  const agora = Date.now()
  let sessoes = ler(sessoesFile)
  sessoes = sessoes.filter(sessao => {
    if (!sessao.expiraEm) return false
    return new Date(sessao.expiraEm).getTime() > agora
  })
  salvar(sessoesFile, sessoes)
  return sessoes
}

function gerarToken() {
  return crypto.randomBytes(32).toString("hex")
}

function criarSessao({ tipo, usuario, email, ip, userAgent }) {
  const token = gerarToken()
  const agora = new Date()
  const expira = new Date(agora.getTime() + TOKEN_TTL_HORAS * 60 * 60 * 1000)

  const sessoes = limparSessoesExpiradas()

  const sessao = {
    id: gerarId("sessao"),
    token,
    tipo: tipo || "usuario",
    usuario: usuario || null,
    email: email || null,
    ip: String(ip || ""),
    userAgent: String(userAgent || "").slice(0, 300),
    criadoEm: agora.toISOString(),
    expiraEm: expira.toISOString()
  }

  sessoes.push(sessao)
  salvar(sessoesFile, sessoes)

  return sessao
}

function obterTokenRequest(req) {
  const authHeader = String(req.headers.authorization || "").trim()
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim()
  }

  const tokenHeader = String(req.headers["x-auth-token"] || "").trim()
  if (tokenHeader) return tokenHeader

  const tokenBody = String(req.body?.token || "").trim()
  if (tokenBody) return tokenBody

  const tokenQuery = String(req.query?.token || "").trim()
  if (tokenQuery) return tokenQuery

  return ""
}

function buscarSessaoPorToken(token) {
  if (!token) return null
  const sessoes = limparSessoesExpiradas()
  return sessoes.find(sessao => sessao.token === token) || null
}

function authObrigatoria(req, res, next) {
  const token = obterTokenRequest(req)
  const sessao = buscarSessaoPorToken(token)

  if (!sessao) {
    return res.status(401).json({ erro: "Token inválido ou expirado" })
  }

  req.auth = sessao
  next()
}

function authAdminObrigatoria(req, res, next) {
  const token = obterTokenRequest(req)
  const sessao = buscarSessaoPorToken(token)

  if (!sessao) {
    return res.status(401).json({ erro: "Token inválido ou expirado" })
  }

  if (sessao.tipo !== "admin") {
    return res.status(403).json({ erro: "Acesso restrito ao administrador" })
  }

  req.auth = sessao
  next()
}

function authUsuarioOuAdmin(req, res, next) {
  const token = obterTokenRequest(req)
  const sessao = buscarSessaoPorToken(token)

  if (!sessao) {
    return res.status(401).json({ erro: "Token inválido ou expirado" })
  }

  req.auth = sessao
  next()
}

function podeAcessarUsuarioLogado(req, usuarioAlvo) {
  if (!req.auth) return false
  if (req.auth.tipo === "admin") return true
  return normalizarUsuario(req.auth.usuario) === normalizarUsuario(usuarioAlvo)
}

function removerArquivoSeExistir(caminhoArquivo) {
  try {
    if (!caminhoArquivo) return false

    const nomeSeguro = path.basename(String(caminhoArquivo || ""))
    if (!nomeSeguro) return false

    const caminhoCompleto = path.join(process.cwd(), "docs", nomeSeguro)

    if (fs.existsSync(caminhoCompleto)) {
      fs.unlinkSync(caminhoCompleto)
      return true
    }

    return false
  } catch (error) {
    console.error("Erro ao remover arquivo físico do documento:", error)
    return false
  }
}

app.use(middlewareCors)
app.use(middlewareSeguranca)
app.use(bodyParser.json({ limit: "15mb" }))
app.use(bodyParser.urlencoded({ extended: true, limit: "15mb" }))
app.use((req, res, next) => {
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    return exigirOrigemValida(req, res, next)
  }
  next()
})

app.use("/app", express.static(path.join(__dirname, "public", "app"), { etag: true, maxAge: "1h", index: ["index.html"] }))
app.use(express.static("public", { etag: true, maxAge: "1h", index: ["index.html"] }))
app.use("/docs", express.static("docs", { etag: true, maxAge: "1h" }))
app.use("/generated", express.static("generated", { etag: true, maxAge: "1h" }))
app.use("/uploads", express.static("uploads", { etag: true, maxAge: "1h" }))

async function criarPixMercadoPago({ usuario, valor, creditos }) {
  const referenceId = `recarga_${slug(usuario)}_${Date.now()}`
  const idempotencyKey = crypto.randomUUID()

  const emailCliente = emailValido(usuario) ? usuario : `${slug(usuario || "usuario")}@example.com`

  const body = {
    transaction_amount: Number(valor),
    description: `Recarga de créditos - ${usuario}`,
    payment_method_id: "pix",
    notification_url: `${APP_BASE_URL}/api/mercadopago/webhook`,
    external_reference: referenceId,
    payer: {
      email: emailCliente
    }
  }

  const response = await fetch(`${MERCADO_PAGO_API_BASE}/v1/payments`, {
    method: "POST",
    headers: getMercadoPagoHeaders(idempotencyKey),
    body: JSON.stringify(body)
  })

  const data = await response.json()

  if (!response.ok) {
    console.error("Erro Mercado Pago criar PIX:", data)
    throw new Error(data?.message || data?.error_description || "Erro ao criar PIX no Mercado Pago")
  }

  const qrCode = data?.point_of_interaction?.transaction_data?.qr_code || ""
  const qrCodeBase64 = data?.point_of_interaction?.transaction_data?.qr_code_base64 || ""
  const ticketUrl = data?.point_of_interaction?.transaction_data?.ticket_url || ""

  if (!qrCode && !qrCodeBase64) {
    throw new Error("Mercado Pago não retornou os dados do PIX")
  }

  let recargas = ler(recargasFile)

  recargas.push({
    id: referenceId,
    usuario,
    valor: Number(valor),
    creditos: Number(creditos),
    status: data.status || "pending",
    referencia: referenceId,
    payment_id: data.id,
    processada: false,
    gateway: "mercado_pago",
    tipo: "pix",
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    ticket_url: ticketUrl,
    criada_em: agoraIso()
  })

  salvar(recargasFile, recargas)

  return {
    paymentId: data.id,
    referenceId,
    qrCode,
    qrCodeBase64,
    ticketUrl,
    status: data.status || "pending"
  }
}

async function consultarPagamentoMercadoPago(paymentId) {
  const response = await fetch(`${MERCADO_PAGO_API_BASE}/v1/payments/${paymentId}`, {
    method: "GET",
    headers: getMercadoPagoHeaders()
  })

  const data = await response.json()

  if (!response.ok) {
    console.error("Erro Mercado Pago consultar pagamento:", data)
    throw new Error(data?.message || data?.error_description || "Erro ao consultar pagamento no Mercado Pago")
  }

  return data
}

function statusMercadoPagoEhAprovado(status) {
  const valor = String(status || "").toLowerCase()
  return valor === "approved"
}

function processarRecargaAprovada(referenceId, pagamento = {}) {
  let recargas = ler(recargasFile)
  let usuarios = ler(usuariosFile)

  let recarga = recargas.find(r => r.referencia === referenceId)

  if (!recarga) {
    throw new Error("Recarga não encontrada")
  }

  if (recarga.processada) {
    let usuarioDuplicado = usuarios.find(
      u => normalizarUsuario(u.usuario) === normalizarUsuario(recarga.usuario)
    )

    return {
      ok: true,
      duplicada: true,
      saldo: usuarioDuplicado ? Number(usuarioDuplicado.saldo || 0) : 0,
      recarga
    }
  }

  let usuario = usuarios.find(
    u => normalizarUsuario(u.usuario) === normalizarUsuario(recarga.usuario)
  )

  if (!usuario) {
    throw new Error("Usuário da recarga não encontrado")
  }

  usuario.saldo = Number(usuario.saldo || 0) + Number(recarga.creditos || 0)
  usuario.recargaTotal = Number(usuario.recargaTotal || 0) + Number(recarga.valor || 0)

  recarga.status = pagamento.status || "approved"
  recarga.processada = true
  recarga.pagamento_id = pagamento.id || recarga.payment_id || null
  recarga.aprovada_em = agoraIso()

  salvar(usuariosFile, usuarios)
  salvar(recargasFile, recargas)

  return {
    ok: true,
    saldo: usuario.saldo,
    recarga
  }
}

function extensoDias(dias) {
  const mapa = {
    "01": "UM",
    "02": "DOIS",
    "03": "TRÊS",
    "04": "QUATRO",
    "05": "CINCO",
    "06": "SEIS",
    "07": "SETE",
    "08": "OITO",
    "09": "NOVE",
    "10": "DEZ",
    "11": "ONZE",
    "12": "DOZE",
    "13": "TREZE",
    "14": "QUATORZE",
    "15": "QUINZE"
  }
  return mapa[String(dias).padStart(2, "0")] || ""
}

function gerarIdCnh() {
  return "cnh_" + Date.now() + "_" + Math.floor(Math.random() * 100000)
}

function limparCnhsExpiradas() {
  let lista = ler(cnhDigitalFile)
  let agora = Date.now()

  lista = lista.filter(item => {
    if (!item.expiraEm) return false
    return new Date(item.expiraEm).getTime() > agora
  })

  salvar(cnhDigitalFile, lista)
  return lista
}

function listarModelos() {
  return ler(modelosEditaveisFile)
}

function salvarModelos(lista) {
  salvar(modelosEditaveisFile, lista)
}

function listarMedicos() {
  return ler(medicosModelosFile)
}

function salvarMedicos(lista) {
  salvar(medicosModelosFile, lista)
}

function validarCampoModelo(campo = {}) {
  return {
    id: String(campo.id || gerarId("campo")),
    nome: slug(campo.nome || campo.label || "campo") || "campo",
    label: sanitizarTexto(campo.label || "Campo", 150),
    tipo: TIPOS_CAMPO_SUPORTADOS.includes(String(campo.tipo || "texto"))
      ? String(campo.tipo || "texto")
      : "texto",
    obrigatorio: Boolean(campo.obrigatorio),
    pagina: Math.max(1, Number(campo.pagina || 1)),
    x: Number(campo.x || 0),
    y: Number(campo.y || 0),
    largura: Number(campo.largura || 0),
    altura: Number(campo.altura || 0),
    tamanho: Math.max(6, Number(campo.tamanho || 10)),
    fonte: sanitizarTexto(campo.fonte || "Helvetica", 40),
    alinhamento: sanitizarTexto(campo.alinhamento || "left", 20),
    placeholder: sanitizarTexto(campo.placeholder || "", 200),
    opcoes: Array.isArray(campo.opcoes) ? campo.opcoes.map(op => sanitizarTexto(op, 100)) : [],
    valorPadrao: sanitizarTexto(campo.valorPadrao ?? "", 1000),
    mascara: sanitizarTexto(campo.mascara || "", 100),
    exibirNoFormulario: campo.exibirNoFormulario !== false,
    renderizarNoPdf: campo.renderizarNoPdf !== false,
    autoTipo: sanitizarTexto(campo.autoTipo || "", 40),
    crmX: Number(campo.crmX || 0),
    crmY: Number(campo.crmY || 0),
    crmTamanho: Number(campo.crmTamanho || 10),
    carimboX: Number(campo.carimboX || 0),
    carimboY: Number(campo.carimboY || 0),
    carimboLargura: Number(campo.carimboLargura || 120),
    carimboAltura: Number(campo.carimboAltura || 60),
    assinaturaX: Number(campo.assinaturaX || 0),
    assinaturaY: Number(campo.assinaturaY || 0),
    assinaturaLargura: Number(campo.assinaturaLargura || 120),
    assinaturaAltura: Number(campo.assinaturaAltura || 50)
  }
}

function validarModeloPayload(payload = {}) {
  const campos = Array.isArray(payload.campos) ? payload.campos.map(validarCampoModelo) : []

  return {
    id: String(payload.id || gerarId("modelo")),
    grupo: sanitizarGrupoModelo(payload.grupo),
    nome: sanitizarTexto(payload.nome || "Novo Modelo", 150),
    tipo: sanitizarTexto(payload.tipo || "atestado", 60),
    estado: sanitizarTexto(payload.estado || "", 80),
    cidade: sanitizarTexto(payload.cidade || "", 120),
    descricao: sanitizarTexto(payload.descricao || "", 300),
    ativo: payload.ativo !== false,
    custoCreditos: Number(payload.custoCreditos || CUSTO_PADRAO_DOCUMENTO),
    arquivoBase: sanitizarPathRelativo(payload.arquivoBase || ""),
    previewImagem: sanitizarPathRelativo(payload.previewImagem || ""),
    previewWidth: Number(payload.previewWidth || 0),
    previewHeight: Number(payload.previewHeight || 0),
    campos,
    criadoEm: String(payload.criadoEm || agoraIso()),
    atualizadoEm: agoraIso()
  }
}

function gerarValorAutomatico(autoTipo, contexto = {}) {
  const agora = new Date()
  const docs = ler(docsFile)

  switch (String(autoTipo || "").toLowerCase()) {
    case "sequencial":
      return String(docs.length + 1).padStart(6, "0")
    case "protocolo":
      return `PROTO-${agora.getFullYear()}-${String(Date.now()).slice(-6)}`
    case "hashcurta":
      return Math.random().toString(36).slice(2, 10).toUpperCase()
    case "data_atual":
      return agora.toLocaleDateString("pt-BR")
    case "hora_atual":
      return agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    case "dias_extenso":
      return extensoDias(contexto.dias || contexto?.valores?.dias || "")
    default:
      return Math.random().toString(36).slice(2, 8).toUpperCase()
  }
}

function montarValoresCampos(modelo, valoresRecebidos = {}) {
  const valores = {}

  Object.keys(valoresRecebidos || {}).forEach(chave => {
    const chaveSegura = slug(chave)
    if (!chaveSegura) return
    valores[chaveSegura] = sanitizarTexto(valoresRecebidos[chave], 5000)
  })

  for (const campo of modelo.campos || []) {
    if (campo.tipo === "campo_auto") {
      valores[campo.nome] = gerarValorAutomatico(campo.autoTipo, { ...valoresRecebidos, valores })
    }
  }

  if (!valores.extenso && valores.dias) {
    valores.extenso = extensoDias(valores.dias)
  }

  return valores
}

function validarValoresObrigatorios(modelo, valores = {}) {
  const faltando = []

  for (const campo of modelo.campos || []) {
    if (!campo.exibirNoFormulario) continue
    if (!campo.obrigatorio) continue
    const valor = valores[campo.nome]
    if (valor === undefined || valor === null || String(valor).trim() === "") {
      faltando.push(campo.label)
    }
  }

  return faltando
}

function resolverArquivoBaseModelo(modelo) {
  if (!modelo.arquivoBase) {
    throw new Error("Modelo sem arquivo base configurado")
  }

  const relativo = sanitizarPathRelativo(modelo.arquivoBase)
  const caminhosPossiveis = [
    relativo,
    path.join(process.cwd(), relativo)
  ]

  const encontrado = caminhosPossiveis.find(c => c && fs.existsSync(c))
  if (!encontrado) {
    throw new Error("Arquivo base do modelo não encontrado")
  }

  return encontrado
}

async function carregarFontePorNome(pdfDoc, nomeFonte) {
  const fonte = String(nomeFonte || "Helvetica")
  if (fonte === "Helvetica-Bold") return await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  if (fonte === "Courier") return await pdfDoc.embedFont(StandardFonts.Courier)
  if (fonte === "TimesRoman") return await pdfDoc.embedFont(StandardFonts.TimesRoman)
  return await pdfDoc.embedFont(StandardFonts.Helvetica)
}

async function desenharImagemNoPdf(pdfDoc, pagina, caminhoImagem, campo) {
  if (!caminhoImagem) return

  const relativo = sanitizarPathRelativo(caminhoImagem)
  const caminhosPossiveis = [
    relativo,
    path.join(process.cwd(), relativo)
  ]

  const encontrado = caminhosPossiveis.find(c => c && fs.existsSync(c))
  if (!encontrado) return

  const buffer = fs.readFileSync(encontrado)
  const ext = path.extname(encontrado).toLowerCase()
  const imagem = ext === ".png" ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer)

  pagina.drawImage(imagem, {
    x: Number(campo.x || 0),
    y: Number(campo.y || 0),
    width: Number(campo.largura || 80),
    height: Number(campo.altura || 40)
  })
}

async function gerarPdfPorModelo({ modelo, valores }) {
  const basePath = resolverArquivoBaseModelo(modelo)
  const modeloBytes = fs.readFileSync(basePath)
  const pdfDoc = await PDFDocument.load(modeloBytes)
  const pages = pdfDoc.getPages()
  const medicos = listarMedicos()

  function converterCoordenadas(campo, pagina) {
    const pageWidth = pagina.getWidth()
    const pageHeight = pagina.getHeight()

    const previewWidth = Number(modelo.previewWidth || pageWidth)
    const previewHeight = Number(modelo.previewHeight || pageHeight)

    const xPreview = Number(campo.x || 0)
    const yPreview = Number(campo.y || 0)
    const larguraPreview = Number(campo.largura || 0)
    const alturaPreview = Number(campo.altura || 0)

    const xPdf = (xPreview / previewWidth) * pageWidth
    const yTopoPreview = (yPreview / previewHeight) * pageHeight
    const alturaPdf = alturaPreview > 0 ? (alturaPreview / previewHeight) * pageHeight : 0
    const yPdf = pageHeight - yTopoPreview - alturaPdf
    const larguraPdf = larguraPreview > 0 ? (larguraPreview / previewWidth) * pageWidth : 0

    return {
      x: xPdf,
      y: yPdf,
      largura: larguraPdf,
      altura: alturaPdf
    }
  }

  for (const campo of modelo.campos || []) {
    const pagina = pages[Math.max(0, Number(campo.pagina || 1) - 1)]
    if (!pagina) continue

    let valor = valores[campo.nome]

    if (campo.tipo === "medico_select") {
      const medico = medicos.find(m => m.id === valor)
      if (!medico) continue

      if (medico.carimboPng) {
        const medicoTemPosicao =
          medico.carimboX !== undefined ||
          medico.carimboY !== undefined ||
          medico.carimboLargura !== undefined ||
          medico.carimboAltura !== undefined

        const carimboCampo = medicoTemPosicao
          ? {
              x: Number(medico.carimboX || 0),
              y: Number(medico.carimboY || 0),
              largura: Number(medico.carimboLargura || 140),
              altura: Number(medico.carimboAltura || 70)
            }
          : {
              x: Number(campo.carimboX || campo.x || 0),
              y: Number(campo.carimboY || campo.y || 0),
              largura: Number(campo.carimboLargura || 120),
              altura: Number(campo.carimboAltura || 60)
            }

        const posCarimbo = converterCoordenadas(carimboCampo, pagina)

        await desenharImagemNoPdf(pdfDoc, pagina, medico.carimboPng, {
          x: posCarimbo.x,
          y: posCarimbo.y,
          largura: posCarimbo.largura || Number(carimboCampo.largura || 120),
          altura: posCarimbo.altura || Number(carimboCampo.altura || 60)
        })
      }

      if (medico.assinaturaPng && campo.assinaturaX !== undefined && campo.assinaturaY !== undefined) {
        const assinaturaCampo = {
          x: Number(campo.assinaturaX || 0),
          y: Number(campo.assinaturaY || 0),
          largura: Number(campo.assinaturaLargura || 120),
          altura: Number(campo.assinaturaAltura || 50)
        }
        const posAss = converterCoordenadas(assinaturaCampo, pagina)

        await desenharImagemNoPdf(pdfDoc, pagina, medico.assinaturaPng, {
          x: posAss.x,
          y: posAss.y,
          largura: posAss.largura || 120,
          altura: posAss.altura || 50
        })
      }

      continue
    }

    if (campo.renderizarNoPdf === false) continue

    const pos = converterCoordenadas(campo, pagina)

    if (campo.tipo === "qrcode") {
      if (typeof valor === "string" && valor.startsWith("data:image/png;base64,")) {
        const base64 = valor.split(",")[1]
        const imagem = await pdfDoc.embedPng(Buffer.from(base64, "base64"))
        pagina.drawImage(imagem, {
          x: pos.x,
          y: pos.y,
          width: pos.largura || 80,
          height: pos.altura || 80
        })
      }
      continue
    }

    if (campo.tipo === "imagem" || campo.tipo === "carimbo_png" || campo.tipo === "assinatura_png") {
      await desenharImagemNoPdf(pdfDoc, pagina, String(valor || ""), {
        x: pos.x,
        y: pos.y,
        largura: pos.largura || 80,
        altura: pos.altura || 40
      })
      continue
    }

    if (valor === undefined || valor === null) {
      valor = campo.valorPadrao || ""
    }

    const fonte = await carregarFontePorNome(pdfDoc, campo.fonte)

    pagina.drawText(String(valor), {
      x: pos.x,
      y: pos.y,
      size: Number(campo.tamanho || 10),
      font: fonte,
      color: rgb(0, 0, 0)
    })
  }

  const nomeArquivo = `${slug(modelo.nome || "modelo")}_${Date.now()}.pdf`
  const caminho = "./docs/" + nomeArquivo
  const pdfBytes = await pdfDoc.save()
  fs.writeFileSync(caminho, pdfBytes)

  return {
    arquivo: nomeArquivo,
    pdf: "/docs/" + nomeArquivo
  }
}

function criarStorageUpload(destinoRelativo) {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      const destino = path.join(process.cwd(), destinoRelativo)
      garantirPasta(destino)
      cb(null, destino)
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname || "").toLowerCase()
      const base = slug(path.basename(file.originalname || "arquivo", ext))
      cb(null, `${base || "arquivo"}_${Date.now()}${ext}`)
    }
  })
}

function validarMimeArquivo(file, tiposPermitidos = []) {
  return tiposPermitidos.includes(String(file.mimetype || "").toLowerCase())
}

const uploadModeloPdf = multer({
  storage: criarStorageUpload("uploads/modelos"),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase()
    if (ext !== ".pdf" || !validarMimeArquivo(file, ["application/pdf"])) {
      return cb(new Error("Envie apenas arquivo PDF"))
    }
    cb(null, true)
  }
})

const uploadModeloPreview = multer({
  storage: criarStorageUpload("uploads/modelos"),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase()
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      return cb(new Error("Envie imagem PNG, JPG, JPEG ou WEBP"))
    }
    if (!validarMimeArquivo(file, ["image/png", "image/jpeg", "image/jpg", "image/webp"])) {
      return cb(new Error("Tipo de imagem inválido"))
    }
    cb(null, true)
  }
})

const uploadCarimbo = multer({
  storage: criarStorageUpload("uploads/carimbos"),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase()
    if (ext !== ".png" || !validarMimeArquivo(file, ["image/png"])) {
      return cb(new Error("Envie apenas PNG para o carimbo"))
    }
    cb(null, true)
  }
})

const uploadAssinatura = multer({
  storage: criarStorageUpload("uploads/assinaturas"),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase()
    if (ext !== ".png" || !validarMimeArquivo(file, ["image/png"])) {
      return cb(new Error("Envie apenas PNG para a assinatura"))
    }
    cb(null, true)
  }
})

app.post("/api/upload/modelo-pdf", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  uploadModeloPdf.single("arquivo")(req, res, function (error) {
    if (error) {
      return res.status(400).json({ erro: error.message })
    }

    if (!req.file) {
      return res.status(400).json({ erro: "Nenhum arquivo enviado" })
    }

    return res.json({
      ok: true,
      caminho: `./uploads/modelos/${req.file.filename}`,
      url: `/uploads/modelos/${req.file.filename}`,
      nome: req.file.filename
    })
  })
})

app.post("/api/upload/modelo-preview", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  uploadModeloPreview.single("arquivo")(req, res, function (error) {
    if (error) {
      return res.status(400).json({ erro: error.message })
    }

    if (!req.file) {
      return res.status(400).json({ erro: "Nenhum arquivo enviado" })
    }

    return res.json({
      ok: true,
      caminho: `./uploads/modelos/${req.file.filename}`,
      url: `/uploads/modelos/${req.file.filename}`,
      nome: req.file.filename
    })
  })
})

app.post("/api/upload/carimbo", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  uploadCarimbo.single("arquivo")(req, res, function (error) {
    if (error) {
      return res.status(400).json({ erro: error.message })
    }

    if (!req.file) {
      return res.status(400).json({ erro: "Nenhum arquivo enviado" })
    }

    return res.json({
      ok: true,
      caminho: `./uploads/carimbos/${req.file.filename}`,
      url: `/uploads/carimbos/${req.file.filename}`,
      nome: req.file.filename
    })
  })
})

app.post("/api/upload/assinatura", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  uploadAssinatura.single("arquivo")(req, res, function (error) {
    if (error) {
      return res.status(400).json({ erro: error.message })
    }

    if (!req.file) {
      return res.status(400).json({ erro: "Nenhum arquivo enviado" })
    }

    return res.json({
      ok: true,
      caminho: `./uploads/assinaturas/${req.file.filename}`,
      url: `/uploads/assinaturas/${req.file.filename}`,
      nome: req.file.filename
    })
  })
})

app.post("/api/login", rateLimit({ janelaMs: 60000, limite: 10 }), (req, res) => {
  let { usuario, senha } = req.body
  let usuarioNormalizado = normalizarUsuario(usuario)
  let senhaNormalizada = String(senha || "").trim()

  let usuarios = ler(usuariosFile)
  let user = usuarios.find(
    u =>
      normalizarUsuario(u.usuario) === usuarioNormalizado &&
      String(u.senha || "").trim() === senhaNormalizada
  )

  if (!user) {
    return res.status(401).json({ erro: "Login inválido" })
  }

  if (!user.ativo) {
    return res.status(403).json({ erro: "Conta não ativada" })
  }

  const sessao = criarSessao({
    tipo: "usuario",
    usuario: user.usuario,
    email: user.usuario,
    ip: obterIp(req),
    userAgent: req.headers["user-agent"] || ""
  })

  res.json({
    ...user,
    token: sessao.token,
    tokenExpiraEm: sessao.expiraEm
  })
})

app.post("/api/logout", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 30 }), (req, res) => {
  const token = obterTokenRequest(req)
  let sessoes = ler(sessoesFile)
  sessoes = sessoes.filter(sessao => sessao.token !== token)
  salvar(sessoesFile, sessoes)
  res.json({ ok: true })
})

app.get("/api/me", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  if (req.auth.tipo === "admin") {
    return res.json({
      ok: true,
      tipo: "admin",
      email: req.auth.email,
      tokenExpiraEm: req.auth.expiraEm
    })
  }

  let usuarios = ler(usuariosFile)
  let user = usuarios.find(u => normalizarUsuario(u.usuario) === normalizarUsuario(req.auth.usuario))

  if (!user) {
    return res.status(404).json({ erro: "Usuário não encontrado" })
  }

  return res.json({
    ok: true,
    tipo: "usuario",
    usuario: user.usuario,
    saldo: user.saldo,
    ativo: user.ativo,
    documentos: user.documentos || 0,
    tokenExpiraEm: req.auth.expiraEm
  })
})

app.post("/api/cadastro", rateLimit({ janelaMs: 60000, limite: 8 }), (req, res) => {
  try {
    let { usuario, email, senha } = req.body

    let usuarioFinal = normalizarUsuario(usuario || email)
    senha = String(senha || "").trim().slice(0, 120)

    if (!usuarioFinal || !senha) {
      return res.status(400).json({ erro: "Preencha usuário e senha" })
    }

    if (usuarioFinal.length < 3) {
      return res.status(400).json({ erro: "O usuário deve ter no mínimo 3 caracteres" })
    }

    if (usuarioFinal.length > 40) {
      return res.status(400).json({ erro: "O usuário deve ter no máximo 40 caracteres" })
    }

    if (!/^[a-z0-9._-]+$/i.test(usuarioFinal)) {
      return res.status(400).json({ erro: "Usuário inválido. Use apenas letras, números, ponto, traço ou underline" })
    }

    let usuarios = ler(usuariosFile)
    let existe = usuarios.find(u => normalizarUsuario(u.usuario) === usuarioFinal)

    if (existe) {
      return res.status(400).json({ erro: "Esse usuário já está cadastrado" })
    }

    let novoUsuario = {
      usuario: usuarioFinal,
      senha: senha,
      saldo: 0,
      documentos: 0,
      recargaTotal: 0,
      ativo: false,
      criadoEm: agoraIso()
    }

    usuarios.push(novoUsuario)
    salvar(usuariosFile, usuarios)

    return res.json({
      ok: true,
      mensagem: "Cadastro realizado com sucesso. Aguarde a ativação pelo administrador."
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ erro: "Erro ao criar cadastro" })
  }
})

app.post("/api/admin/login", rateLimit({ janelaMs: 60000, limite: 8 }), (req, res) => {
  let { email, senha } = req.body

  if (email === ADMIN_EMAIL && senha === ADMIN_SENHA) {
    const sessao = criarSessao({
      tipo: "admin",
      usuario: null,
      email: ADMIN_EMAIL,
      ip: obterIp(req),
      userAgent: req.headers["user-agent"] || ""
    })

    return res.json({
      ok: true,
      admin: true,
      email: ADMIN_EMAIL,
      token: sessao.token,
      tokenExpiraEm: sessao.expiraEm
    })
  }

  return res.status(401).json({
    ok: false,
    erro: "Login admin inválido"
  })
})

app.get("/api/usuario/:usuario", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  if (!podeAcessarUsuarioLogado(req, req.params.usuario)) {
    return res.status(403).json({ erro: "Acesso não autorizado" })
  }

  let usuarios = ler(usuariosFile)
  let usuario = usuarios.find(
    u => normalizarUsuario(u.usuario) === normalizarUsuario(req.params.usuario)
  )

  if (!usuario) {
    return res.status(404).json({ erro: "Usuário não encontrado" })
  }

  res.json(usuario)
})

app.get("/api/modelos-editaveis/grupos", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  res.json(GRUPOS_MODELO)
})

app.get("/api/modelos-editaveis", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  try {
    let grupo = req.query.grupo ? sanitizarGrupoModelo(req.query.grupo) : null
    let ativos = req.query.ativos === "1"
    let estado = sanitizarTexto(req.query.estado || "", 80).toLowerCase()
    let cidade = sanitizarTexto(req.query.cidade || "", 120).toLowerCase()
    let modelos = listarModelos()

    if (grupo) modelos = modelos.filter(m => sanitizarGrupoModelo(m.grupo) === grupo)
    if (ativos) modelos = modelos.filter(m => m.ativo)
    if (estado) modelos = modelos.filter(m => String(m.estado || "").trim().toLowerCase() === estado)
    if (cidade) modelos = modelos.filter(m => String(m.cidade || "").trim().toLowerCase() === cidade)

    res.json(modelos)
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.get("/api/modelos-editaveis/:id", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  try {
    let modelos = listarModelos()
    let modelo = modelos.find(m => m.id === req.params.id)

    if (!modelo) {
      return res.status(404).json({ erro: "Modelo não encontrado" })
    }

    res.json(modelo)
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/modelos-editaveis", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  try {
    let modelos = listarModelos()
    let modelo = validarModeloPayload(req.body || {})
    modelos.push(modelo)
    salvarModelos(modelos)
    res.json({ ok: true, modelo })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.put("/api/modelos-editaveis/:id", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  try {
    let modelos = listarModelos()
    let index = modelos.findIndex(m => m.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ erro: "Modelo não encontrado" })
    }

    const atual = modelos[index]
    const atualizado = validarModeloPayload({
      ...atual,
      ...req.body,
      id: atual.id,
      criadoEm: atual.criadoEm
    })

    modelos[index] = atualizado
    salvarModelos(modelos)

    res.json({ ok: true, modelo: atualizado })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/modelos-editaveis/:id/ativar", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 30 }), (req, res) => {
  try {
    let modelos = listarModelos()
    let modelo = modelos.find(m => m.id === req.params.id)

    if (!modelo) {
      return res.status(404).json({ erro: "Modelo não encontrado" })
    }

    modelo.ativo = true
    modelo.atualizadoEm = agoraIso()
    salvarModelos(modelos)

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/modelos-editaveis/:id/desativar", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 30 }), (req, res) => {
  try {
    let modelos = listarModelos()
    let modelo = modelos.find(m => m.id === req.params.id)

    if (!modelo) {
      return res.status(404).json({ erro: "Modelo não encontrado" })
    }

    modelo.ativo = false
    modelo.atualizadoEm = agoraIso()
    salvarModelos(modelos)

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.delete("/api/modelos-editaveis/:id", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  try {
    let modelos = listarModelos()
    let index = modelos.findIndex(m => m.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ erro: "Modelo não encontrado" })
    }

    modelos.splice(index, 1)
    salvarModelos(modelos)

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.get("/api/medicos-modelos", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  try {
    let grupo = req.query.grupo ? sanitizarGrupoModelo(req.query.grupo) : null
    let medicos = listarMedicos()

    if (grupo) {
      medicos = medicos.filter(m => sanitizarGrupoModelo(m.grupo) === grupo)
    }

    res.json(medicos)
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/medicos-modelos", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  try {
    let medicos = listarMedicos()

    let item = {
      id: gerarId("med"),
      nome: sanitizarTexto(req.body.nome || "", 150),
      crm: sanitizarTexto(req.body.crm || "", 80),
      grupo: sanitizarGrupoModelo(req.body.grupo),
      modeloId: sanitizarTexto(req.body.modeloId || "", 120),
      modeloNome: sanitizarTexto(req.body.modeloNome || "", 150),
      carimboPng: sanitizarPathRelativo(req.body.carimboPng || ""),
      assinaturaPng: sanitizarPathRelativo(req.body.assinaturaPng || ""),
      carimboX: Number(req.body.carimboX || 0),
      carimboY: Number(req.body.carimboY || 0),
      carimboLargura: Number(req.body.carimboLargura || 140),
      carimboAltura: Number(req.body.carimboAltura || 70),
      ativo: req.body.ativo !== false,
      criadoEm: agoraIso()
    }

    medicos.push(item)
    salvarMedicos(medicos)

    res.json({ ok: true, medico: item })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.put("/api/medicos-modelos/:id", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  try {
    let medicos = listarMedicos()
    let index = medicos.findIndex(m => m.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ erro: "Médico não encontrado" })
    }

    medicos[index] = {
      ...medicos[index],
      ...req.body,
      nome: sanitizarTexto(req.body.nome ?? medicos[index].nome ?? "", 150),
      crm: sanitizarTexto(req.body.crm ?? medicos[index].crm ?? "", 80),
      modeloId: sanitizarTexto(req.body.modeloId ?? medicos[index].modeloId ?? "", 120),
      modeloNome: sanitizarTexto(req.body.modeloNome ?? medicos[index].modeloNome ?? "", 150),
      carimboPng: sanitizarPathRelativo(req.body.carimboPng ?? medicos[index].carimboPng ?? ""),
      assinaturaPng: sanitizarPathRelativo(req.body.assinaturaPng ?? medicos[index].assinaturaPng ?? ""),
      carimboX: Number(req.body.carimboX ?? medicos[index].carimboX ?? 0),
      carimboY: Number(req.body.carimboY ?? medicos[index].carimboY ?? 0),
      carimboLargura: Number(req.body.carimboLargura ?? medicos[index].carimboLargura ?? 140),
      carimboAltura: Number(req.body.carimboAltura ?? medicos[index].carimboAltura ?? 70),
      grupo: sanitizarGrupoModelo(req.body.grupo || medicos[index].grupo)
    }

    salvarMedicos(medicos)
    res.json({ ok: true, medico: medicos[index] })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.delete("/api/medicos-modelos/:id", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  try {
    let medicos = listarMedicos()
    let index = medicos.findIndex(m => m.id === req.params.id)

    if (index === -1) {
      return res.status(404).json({ erro: "Médico não encontrado" })
    }

    medicos.splice(index, 1)
    salvarMedicos(medicos)

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/modelos-editaveis/gerar", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 20 }), async (req, res) => {
  try {
    let { usuario, modeloId, valores } = req.body || {}

    usuario = normalizarUsuario(usuario)
    modeloId = sanitizarTexto(modeloId || "", 120)

    if (!usuario) {
      return res.status(400).json({ erro: "Usuário não informado" })
    }

    if (!podeAcessarUsuarioLogado(req, usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    if (!modeloId) {
      return res.status(400).json({ erro: "Modelo não informado" })
    }

    let modelos = listarModelos()
    let modelo = modelos.find(m => m.id === modeloId)

    if (!modelo) {
      return res.status(404).json({ erro: "Modelo não encontrado" })
    }

    if (!modelo.ativo) {
      return res.status(400).json({ erro: "Modelo desativado" })
    }

    let usuarios = ler(usuariosFile)
    let u = usuarios.find(x => normalizarUsuario(x.usuario) === usuario)

    if (!u) {
      return res.status(404).json({ erro: "Usuário não encontrado" })
    }

    if (!u.ativo) {
      return res.status(400).json({ erro: "Conta não ativada" })
    }

    const custo = Number(modelo.custoCreditos || CUSTO_PADRAO_DOCUMENTO)
    if (Number(u.saldo || 0) < custo) {
      return res.status(400).json({ erro: `Saldo insuficiente. São necessários ${custo} créditos.` })
    }

    const valoresCompletos = montarValoresCampos(modelo, valores || {})
    const faltando = validarValoresObrigatorios(modelo, valoresCompletos)

    if (faltando.length) {
      return res.status(400).json({ erro: `Preencha os campos obrigatórios: ${faltando.join(", ")}` })
    }

    const resultadoPdf = await gerarPdfPorModelo({
      modelo,
      valores: valoresCompletos
    })

    u.saldo = Number(u.saldo || 0) - custo
    u.documentos = Number(u.documentos || 0) + 1
    salvar(usuariosFile, usuarios)

    let historico = ler(docsFile)
    historico.push({
      id: gerarId("doc"),
      usuario,
      tipo: modelo.tipo || "atestado",
      grupo: modelo.grupo,
      modeloId: modelo.id,
      modeloNome: modelo.nome,
      estado: modelo.estado || "",
      cidade: modelo.cidade || "",
      valores: valoresCompletos,
      medico: valoresCompletos.medico || "",
      data: new Date().toLocaleString(),
      arquivo: resultadoPdf.arquivo
    })
    salvar(docsFile, historico)

    res.json({
      pdf: resultadoPdf.pdf,
      saldo: u.saldo,
      modelo: modelo.nome
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/gerar", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 20 }), async (req, res) => {
  try {
    let {
      usuario,
      modelo,
      medico,
      nome,
      cpf,
      data,
      dias,
      extenso,
      cid,
      hospital,
      endereco,
      cidade,
      hora1,
      hora2
    } = req.body

    const grupo = sanitizarGrupoModelo(modelo)
    const modelos = listarModelos().filter(
      m => m.ativo && sanitizarGrupoModelo(m.grupo) === grupo
    )

    if (!modelos.length) {
      return res.json({ erro: `Nenhum modelo ativo cadastrado para ${grupo}` })
    }

    const modeloEscolhido = modelos[0]

    const valores = {
      nome: sanitizarTexto(nome, 200),
      cpf: cpfSeguro(cpf),
      data: sanitizarTexto(data, 40),
      dias: sanitizarTexto(dias, 10),
      extenso: sanitizarTexto(extenso, 100),
      cid: sanitizarTexto(cid, 80),
      hospital: sanitizarTexto(hospital, 200),
      endereco: sanitizarTexto(endereco, 250),
      cidade: sanitizarTexto(cidade, 150),
      hora1: sanitizarTexto(hora1, 20),
      hora2: sanitizarTexto(hora2, 20),
      medico: sanitizarTexto(medico, 150)
    }

    req.body = {
      usuario,
      modeloId: modeloEscolhido.id,
      valores
    }

    return app._router.handle(req, res, () => {})
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: error.message })
  }
})

app.get("/api/documentos", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  let documentos = ler(docsFile)
  let usuario = normalizarUsuario(req.query.usuario)

  if (req.auth.tipo !== "admin") {
    documentos = documentos.filter(doc => normalizarUsuario(doc.usuario) === normalizarUsuario(req.auth.usuario))
  } else if (usuario) {
    documentos = documentos.filter(doc => normalizarUsuario(doc.usuario) === usuario)
  }

  res.json(documentos)
})

app.post("/api/documentos/excluir", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  try {
    const id = sanitizarTexto(req.body?.id || "", 120)

    if (!id) {
      return res.status(400).json({ erro: "ID do documento não informado" })
    }

    let documentos = ler(docsFile)
    const index = documentos.findIndex(doc => String(doc.id || "") === id)

    if (index === -1) {
      return res.status(404).json({ erro: "Documento não encontrado" })
    }

    const documento = documentos[index]

    if (!podeAcessarUsuarioLogado(req, documento.usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    const arquivoRemovido = removerArquivoSeExistir(documento.arquivo)

    documentos.splice(index, 1)
    salvar(docsFile, documentos)

    return res.json({
      ok: true,
      removido: true,
      arquivoRemovido
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ erro: "Erro ao excluir documento" })
  }
})

app.get("/api/usuarios", authAdminObrigatoria, rateLimit(), (req, res) => {
  res.json(ler(usuariosFile))
})

app.post("/api/addsaldo", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  let { usuario, valor } = req.body
  let usuarios = ler(usuariosFile)
  let u = usuarios.find(x => normalizarUsuario(x.usuario) === normalizarUsuario(usuario))

  if (!u) {
    return res.json({ erro: "Usuário não encontrado" })
  }

  u.saldo = Number(u.saldo || 0) + Number(valor || 0)
  salvar(usuariosFile, usuarios)

  res.json({ ok: true })
})

app.post("/api/bloquear", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  let { usuario } = req.body
  let usuarios = ler(usuariosFile)
  let u = usuarios.find(x => normalizarUsuario(x.usuario) === normalizarUsuario(usuario))

  if (!u) {
    return res.json({ erro: "Usuário não encontrado" })
  }

  u.ativo = false
  salvar(usuariosFile, usuarios)

  res.json({ ok: true })
})

app.post("/api/recarga/criar", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 10 }), async (req, res) => {
  try {
    let { usuario, valor } = req.body
    let valorNumerico = Number(valor)

    if (!podeAcessarUsuarioLogado(req, usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    let usuarios = ler(usuariosFile)
    let user = usuarios.find(u => normalizarUsuario(u.usuario) === normalizarUsuario(usuario))

    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" })
    }

    if (!valorNumerico || valorNumerico < 20) {
      return res.status(400).json({ erro: "Valor mínimo da recarga é 20" })
    }

    let creditos = Math.round(valorNumerico * CREDITS_PER_REAL)

    let resultado = await criarPixMercadoPago({
      usuario: normalizarUsuario(usuario),
      valor: valorNumerico,
      creditos
    })

    res.json({
      ok: true,
      payment_id: resultado.paymentId,
      reference_id: resultado.referenceId,
      qr_code: resultado.qrCode,
      qr_code_base64: resultado.qrCodeBase64,
      ticket_url: resultado.ticketUrl,
      status: resultado.status,
      creditos
    })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/recarga/sincronizar", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 20 }), async (req, res) => {
  try {
    let { payment_id, reference_id } = req.body

    if (reference_id) {
      let recargas = ler(recargasFile)
      let recarga = recargas.find(r => r.referencia === reference_id)

      if (!recarga) {
        return res.status(404).json({ erro: "Recarga não encontrada" })
      }

      if (req.auth.tipo !== "admin" && normalizarUsuario(recarga.usuario) !== normalizarUsuario(req.auth.usuario)) {
        return res.status(403).json({ erro: "Acesso não autorizado" })
      }

      if (recarga.processada) {
        let usuarios = ler(usuariosFile)
        let usuario = usuarios.find(
          u => normalizarUsuario(u.usuario) === normalizarUsuario(recarga.usuario)
        )

        return res.json({
          ok: true,
          status: recarga.status,
          saldo: usuario ? usuario.saldo : 0,
          recarga
        })
      }

      if (!recarga.payment_id) {
        return res.json({
          ok: true,
          status: recarga.status || "pending",
          recarga
        })
      }

      const pagamento = await consultarPagamentoMercadoPago(recarga.payment_id)

      if (!statusMercadoPagoEhAprovado(pagamento.status)) {
        recarga.status = pagamento.status || recarga.status || "pending"
        salvar(recargasFile, recargas)

        return res.json({
          ok: true,
          status: pagamento.status || "pending",
          recarga
        })
      }

      const resultado = processarRecargaAprovada(recarga.referencia, {
        id: pagamento.id,
        status: pagamento.status
      })

      return res.json({
        ok: true,
        status: pagamento.status,
        saldo: resultado.saldo,
        recarga: resultado.recarga
      })
    }

    if (payment_id) {
      const pagamento = await consultarPagamentoMercadoPago(payment_id)

      if (!pagamento.external_reference) {
        return res.status(400).json({ erro: "Pagamento sem referência externa" })
      }

      let recargas = ler(recargasFile)
      let recarga = recargas.find(r => r.referencia === pagamento.external_reference)

      if (!recarga) {
        return res.status(404).json({ erro: "Recarga não encontrada" })
      }

      if (req.auth.tipo !== "admin" && normalizarUsuario(recarga.usuario) !== normalizarUsuario(req.auth.usuario)) {
        return res.status(403).json({ erro: "Acesso não autorizado" })
      }

      if (!statusMercadoPagoEhAprovado(pagamento.status)) {
        recarga.status = pagamento.status || recarga.status || "pending"
        salvar(recargasFile, recargas)

        return res.json({
          ok: true,
          status: pagamento.status || "pending",
          recarga
        })
      }

      let resultado = processarRecargaAprovada(pagamento.external_reference, {
        id: pagamento.id,
        status: pagamento.status
      })

      return res.json({
        ok: true,
        status: pagamento.status,
        saldo: resultado.saldo,
        recarga: resultado.recarga
      })
    }

    return res.status(400).json({ erro: "payment_id ou reference_id não informado" })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.get("/api/recarga/historico/:usuario", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  let usuario = req.params.usuario

  if (!podeAcessarUsuarioLogado(req, usuario)) {
    return res.status(403).json({ erro: "Acesso não autorizado" })
  }

  let recargas = ler(recargasFile)
  let historico = recargas.filter(
    r => normalizarUsuario(r.usuario) === normalizarUsuario(usuario) && r.processada
  )
  res.json(historico)
})

app.post("/api/mercadopago/webhook", rateLimit({ janelaMs: 60000, limite: 60 }), async (req, res) => {
  try {
    if (MERCADO_PAGO_WEBHOOK_SECRET) {
      const recebido = String(req.headers["x-signature"] || "").trim()
      if (!recebido) {
        return res.status(401).json({ erro: "Assinatura ausente" })
      }
    }

    const body = req.body || {}

    let paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.split("/")?.pop() ||
      req.query?.["data.id"] ||
      req.query?.id

    const topic = String(body?.type || body?.topic || req.query?.type || req.query?.topic || "").toLowerCase()

    if (topic && topic !== "payment") {
      return res.json({ ok: true, ignorado: true, motivo: "topic diferente de payment" })
    }

    if (!paymentId) {
      return res.json({ ok: true, ignorado: true, motivo: "payment_id ausente" })
    }

    const pagamento = await consultarPagamentoMercadoPago(paymentId)

    if (!pagamento.external_reference) {
      return res.json({ ok: true, ignorado: true, motivo: "sem external_reference" })
    }

    let recargas = ler(recargasFile)
    let recarga = recargas.find(r => r.referencia === pagamento.external_reference)

    if (!recarga) {
      return res.json({ ok: true, ignorado: true, motivo: "recarga não encontrada" })
    }

    recarga.status = pagamento.status || recarga.status || "pending"
    recarga.payment_id = pagamento.id || recarga.payment_id || null
    salvar(recargasFile, recargas)

    if (statusMercadoPagoEhAprovado(pagamento.status)) {
      processarRecargaAprovada(pagamento.external_reference, {
        id: pagamento.id,
        status: pagamento.status
      })
    }

    res.json({ ok: true })
  } catch (error) {
    console.error("Erro webhook Mercado Pago:", error)
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/salvar-usuarios", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 10 }), (req, res) => {
  try {
    let { usuarios } = req.body

    if (!Array.isArray(usuarios)) {
      return res.status(400).json({ erro: "Lista de usuários inválida" })
    }

    salvar(usuariosFile, usuarios)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/ativar", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  let { usuario } = req.body
  let usuarios = ler(usuariosFile)
  let u = usuarios.find(x => normalizarUsuario(x.usuario) === normalizarUsuario(usuario))

  if (!u) {
    return res.json({ erro: "Usuário não encontrado" })
  }

  u.ativo = true
  salvar(usuariosFile, usuarios)

  res.json({ ok: true })
})

app.post("/api/excluir-usuario", authAdminObrigatoria, rateLimit({ janelaMs: 60000, limite: 20 }), (req, res) => {
  let { usuario } = req.body
  let usuarios = ler(usuariosFile)
  let index = usuarios.findIndex(
    x => normalizarUsuario(x.usuario) === normalizarUsuario(usuario)
  )

  if (index === -1) {
    return res.json({ erro: "Usuário não encontrado" })
  }

  usuarios.splice(index, 1)
  salvar(usuariosFile, usuarios)

  res.json({ ok: true })
})

app.post("/api/cnh-digital/criar", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 15 }), async (req, res) => {
  try {
    let {
      usuario,
      nomeCompleto,
      primeiraHabilitacao,
      dataNascimento,
      cidadeNascimento,
      ufNascimento,
      dataEmissao,
      validade,
      tipoDocumento,
      numeroDocumento,
      orgaoEmissor,
      ufEmissao,
      cpf,
      numeroRegistro,
      numeroFormulario,
      categoria,
      nacionalidade,
      nomePai,
      nomeMae,
      observacoes,
      codigoSeguranca,
      cidadeEmissao,
      renach,
      fotoRosto,
      fotoAssinatura,
      categoriasAdicionais,
      sexo,
      ufCnh,
      ufLocalHabilitacao
    } = req.body

    usuario = normalizarUsuario(usuario)

    if (!usuario) {
      return res.status(400).json({ erro: "Usuário não informado" })
    }

    if (!podeAcessarUsuarioLogado(req, usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    if (!nomeCompleto || !cpf || !numeroFormulario) {
      return res.status(400).json({ erro: "Preencha nome completo, CPF e número de formulário" })
    }

    let usuarios = ler(usuariosFile)
    let user = usuarios.find(u => normalizarUsuario(u.usuario) === usuario)

    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" })
    }

    if (!user.ativo) {
      return res.status(400).json({ erro: "Usuário inativo" })
    }

    if (Number(user.saldo || 0) < 20) {
      return res.status(400).json({ erro: "Saldo insuficiente. São necessários 20 créditos." })
    }

    let lista = limparCnhsExpiradas()

    let agora = new Date()
    let expira = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000)
    let id = gerarIdCnh()

    let novoCadastro = {
      id,
      usuario,
      nomeCompleto: sanitizarTexto(nomeCompleto || "", 200),
      primeiraHabilitacao: sanitizarTexto(primeiraHabilitacao || "", 40),
      dataNascimento: sanitizarTexto(dataNascimento || "", 40),
      cidadeNascimento: sanitizarTexto(cidadeNascimento || "", 100),
      ufNascimento: sanitizarTexto(ufNascimento || "", 10),
      dataEmissao: sanitizarTexto(dataEmissao || "", 40),
      validade: sanitizarTexto(validade || "", 40),
      tipoDocumento: sanitizarTexto(tipoDocumento || "", 50),
      numeroDocumento: somenteNumeroTexto(numeroDocumento || "", 50),
      orgaoEmissor: sanitizarTexto(orgaoEmissor || "", 50),
      ufEmissao: sanitizarTexto(ufEmissao || "", 10),
      cpf: cpfSeguro(cpf || ""),
      numeroRegistro: somenteNumeroTexto(numeroRegistro || "", 50),
      numeroFormulario: somenteNumeroTexto(numeroFormulario || "", 50),
      categoria: sanitizarTexto(categoria || "", 20),
      nacionalidade: sanitizarTexto(nacionalidade || "", 60),
      nomePai: sanitizarTexto(nomePai || "", 200),
      nomeMae: sanitizarTexto(nomeMae || "", 200),
      observacoes: sanitizarTexto(observacoes || "", 500),
      codigoSeguranca: somenteNumeroTexto(codigoSeguranca || "", 50),
      cidadeEmissao: sanitizarTexto(cidadeEmissao || "", 100),
      renach: somenteNumeroTexto(renach || "", 50),
      fotoRosto: String(fotoRosto || "").slice(0, 3000000),
      fotoAssinatura: String(fotoAssinatura || "").slice(0, 3000000),
      categoriasAdicionais: normalizarCategoriasAdicionais(categoriasAdicionais),
      sexo: sanitizarTexto(sexo || "", 20),
      ufCnh: sanitizarTexto(ufCnh || "", 10),
      ufLocalHabilitacao: sanitizarTexto(ufLocalHabilitacao || "", 10),
      criadaEm: agora.toISOString(),
      expiraEm: expira.toISOString(),
      urlValidacao: `${APP_VALIDATION_BASE_URL}/app/validacao.html?id=${id}`
    }

    const resultadoGeracao = await gerarArquivosCracha({
      id,
      dados: novoCadastro,
      urlValidacao: novoCadastro.urlValidacao
    })

    novoCadastro.senhaApp = resultadoGeracao.senhaApp
    novoCadastro.imagensCracha = Array.isArray(resultadoGeracao.imagensCracha) ? resultadoGeracao.imagensCracha : []

    const resultadoPdf = await gerarPdfCnh({
      id,
      dados: novoCadastro,
      urlValidacao: novoCadastro.urlValidacao
    })

    novoCadastro.pdfCnh = "/" + path.relative(process.cwd(), resultadoPdf).replace(/\\/g, "/")

    user.saldo = Number(user.saldo || 0) - 20
    salvar(usuariosFile, usuarios)

    lista.push(novoCadastro)
    salvar(cnhDigitalFile, lista)

    res.json({
      ok: true,
      id,
      saldo: user.saldo,
      expiraEm: novoCadastro.expiraEm,
      urlValidacao: novoCadastro.urlValidacao,
      cpf: novoCadastro.cpf,
      senhaApp: novoCadastro.senhaApp,
      imagensCracha: novoCadastro.imagensCracha,
      pdfCnh: novoCadastro.pdfCnh
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: error.message })
  }
})

app.get("/api/cnh-digital/:usuario", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  try {
    let usuario = req.params.usuario

    if (!podeAcessarUsuarioLogado(req, usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    let lista = limparCnhsExpiradas()
    let itens = lista.filter(
      item => normalizarUsuario(item.usuario) === normalizarUsuario(usuario)
    )
    res.json(itens)
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.get("/api/app/validacao/:id", rateLimit({ janelaMs: 60000, limite: 60 }), (req, res) => {
  try {
    let lista = limparCnhsExpiradas()
    let item = lista.find(x => x.id === req.params.id)

    if (!item) {
      return res.status(404).json({ erro: "Cadastro não encontrado ou expirado" })
    }

    return res.json({
      id: item.id,
      nomeCompleto: item.nomeCompleto || "",
      numeroDocumento: item.numeroDocumento || "",
      orgaoEmissor: item.orgaoEmissor || "",
      ufEmissao: item.ufEmissao || "",
      cpf: item.cpf || "",
      dataNascimento: item.dataNascimento || "",
      nomePai: item.nomePai || "",
      nomeMae: item.nomeMae || "",
      tipoDocumento: item.tipoDocumento || "",
      acc: item.acc || "NÃO",
      categoria: item.categoria || "",
      numeroRegistro: item.numeroRegistro || "",
      validade: item.validade || "",
      primeiraHabilitacao: item.primeiraHabilitacao || "",
      observacoes: item.observacoes || "",
      cidadeEmissao: item.cidadeEmissao || "",
      ufCnh: item.ufCnh || "",
      dataEmissao: item.dataEmissao || "",
      codigoSeguranca: item.codigoSeguranca || "",
      renach: item.renach || "",
      fotoRosto: item.fotoRosto || ""
    })
  } catch (error) {
    res.status(500).json({ erro: "Erro ao carregar validação" })
  }
})

app.get("/api/cnh-digital/item/:id", authUsuarioOuAdmin, rateLimit(), (req, res) => {
  try {
    let lista = limparCnhsExpiradas()
    let item = lista.find(x => x.id === req.params.id)

    if (!item) {
      return res.status(404).json({ erro: "Cadastro não encontrado ou expirado" })
    }

    if (!podeAcessarUsuarioLogado(req, item.usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    res.json(item)
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/cnh-digital/editar", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 15 }), async (req, res) => {
  try {
    let {
      id,
      usuario,
      nomeCompleto,
      primeiraHabilitacao,
      dataNascimento,
      cidadeNascimento,
      ufNascimento,
      dataEmissao,
      validade,
      tipoDocumento,
      numeroDocumento,
      orgaoEmissor,
      ufEmissao,
      cpf,
      numeroRegistro,
      numeroFormulario,
      categoria,
      nacionalidade,
      nomePai,
      nomeMae,
      observacoes,
      codigoSeguranca,
      cidadeEmissao,
      renach,
      fotoRosto,
      fotoAssinatura,
      categoriasAdicionais,
      sexo,
      ufCnh,
      ufLocalHabilitacao
    } = req.body

    usuario = normalizarUsuario(usuario)

    if (!id || !usuario) {
      return res.status(400).json({ erro: "ID e usuário são obrigatórios" })
    }

    if (!podeAcessarUsuarioLogado(req, usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    let lista = limparCnhsExpiradas()
    let index = lista.findIndex(
      item => item.id === id && normalizarUsuario(item.usuario) === normalizarUsuario(usuario)
    )

    if (index === -1) {
      return res.status(404).json({ erro: "Cadastro não encontrado" })
    }

    let cadastroAtual = lista[index]

    let cadastroAtualizado = {
      ...cadastroAtual,
      nomeCompleto: sanitizarTexto(nomeCompleto || "", 200),
      primeiraHabilitacao: sanitizarTexto(primeiraHabilitacao || "", 40),
      dataNascimento: sanitizarTexto(dataNascimento || "", 40),
      cidadeNascimento: sanitizarTexto(cidadeNascimento || "", 100),
      ufNascimento: sanitizarTexto(ufNascimento || "", 10),
      dataEmissao: sanitizarTexto(dataEmissao || "", 40),
      validade: sanitizarTexto(validade || "", 40),
      tipoDocumento: sanitizarTexto(tipoDocumento || "", 50),
      numeroDocumento: somenteNumeroTexto(numeroDocumento || "", 50),
      orgaoEmissor: sanitizarTexto(orgaoEmissor || "", 50),
      ufEmissao: sanitizarTexto(ufEmissao || "", 10),
      cpf: cpfSeguro(cpf || cadastroAtual.cpf || ""),
      numeroRegistro: somenteNumeroTexto(numeroRegistro || "", 50),
      numeroFormulario: somenteNumeroTexto(numeroFormulario || "", 50),
      categoria: sanitizarTexto(categoria || "", 20),
      nacionalidade: sanitizarTexto(nacionalidade || "", 60),
      nomePai: sanitizarTexto(nomePai || "", 200),
      nomeMae: sanitizarTexto(nomeMae || "", 200),
      observacoes: sanitizarTexto(observacoes || "", 500),
      codigoSeguranca: somenteNumeroTexto(codigoSeguranca || "", 50),
      cidadeEmissao: sanitizarTexto(cidadeEmissao || "", 100),
      renach: somenteNumeroTexto(renach || "", 50),
      fotoRosto: String(fotoRosto || cadastroAtual.fotoRosto || "").slice(0, 3000000),
      fotoAssinatura: String(fotoAssinatura || cadastroAtual.fotoAssinatura || "").slice(0, 3000000),
      categoriasAdicionais: normalizarCategoriasAdicionais(categoriasAdicionais),
      sexo: sanitizarTexto(sexo || "", 20),
      ufCnh: sanitizarTexto(ufCnh || "", 10),
      ufLocalHabilitacao: sanitizarTexto(ufLocalHabilitacao || "", 10),
      atualizadaEm: agoraIso()
    }

    const senhaAnterior = cadastroAtual.senhaApp || ""

    const resultadoGeracao = await gerarArquivosCracha({
      id: cadastroAtualizado.id,
      dados: {
        ...cadastroAtualizado,
        senhaApp: senhaAnterior
      },
      urlValidacao: cadastroAtualizado.urlValidacao
    })

    cadastroAtualizado.senhaApp = senhaAnterior || resultadoGeracao.senhaApp
    cadastroAtualizado.imagensCracha = Array.isArray(resultadoGeracao.imagensCracha) ? resultadoGeracao.imagensCracha : []

    const resultadoPdf = await gerarPdfCnh({
      id: cadastroAtualizado.id,
      dados: cadastroAtualizado,
      urlValidacao: cadastroAtualizado.urlValidacao
    })

    cadastroAtualizado.pdfCnh = "/" + path.relative(process.cwd(), resultadoPdf).replace(/\\/g, "/")

    lista[index] = cadastroAtualizado
    salvar(cnhDigitalFile, lista)

    res.json({
      ok: true,
      item: cadastroAtualizado
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/cnh-digital/excluir", authUsuarioOuAdmin, rateLimit({ janelaMs: 60000, limite: 15 }), (req, res) => {
  try {
    let { id, usuario } = req.body

    if (!podeAcessarUsuarioLogado(req, usuario)) {
      return res.status(403).json({ erro: "Acesso não autorizado" })
    }

    let lista = limparCnhsExpiradas()

    let index = lista.findIndex(
      x => x.id === id && normalizarUsuario(x.usuario) === normalizarUsuario(usuario)
    )

    if (index === -1) {
      return res.status(404).json({ erro: "Cadastro não encontrado" })
    }

    lista.splice(index, 1)
    salvar(cnhDigitalFile, lista)

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.post("/api/app/login", rateLimit({ janelaMs: 60000, limite: 10 }), (req, res) => {
  try {
    let { cpf, senha } = req.body

    if (!cpf || !senha) {
      return res.status(400).json({ erro: "CPF e senha são obrigatórios" })
    }

    const cpfNormalizado = cpfSeguro(cpf)
    const senhaNormalizada = String(senha || "").trim()

    let lista = limparCnhsExpiradas()

    let cadastro = lista.find(item =>
      cpfSeguro(item.cpf || "") === cpfNormalizado &&
      String(item.senhaApp || "").trim() === senhaNormalizada
    )

    if (!cadastro) {
      return res.status(401).json({ erro: "CPF ou senha inválidos" })
    }

    res.json({
      ok: true,
      id: cadastro.id,
      cpf: cadastro.cpf || "",
      senhaApp: cadastro.senhaApp || "",
      nomeCompleto: cadastro.nomeCompleto || "",
      categoria: cadastro.categoria || "",
      validade: cadastro.validade || "",
      usuario: cadastro.usuario || "",
      urlValidacao: cadastro.urlValidacao || "",
      imagensCracha: cadastro.imagensCracha || [],
      pdfCnh: cadastro.pdfCnh || "",
      numeroDocumento: cadastro.numeroDocumento || "",
      orgaoEmissor: cadastro.orgaoEmissor || "",
      ufEmissao: cadastro.ufEmissao || "",
      dataNascimento: cadastro.dataNascimento || "",
      nomePai: cadastro.nomePai || "",
      nomeMae: cadastro.nomeMae || "",
      tipoDocumento: cadastro.tipoDocumento || "",
      numeroRegistro: cadastro.numeroRegistro || "",
      primeiraHabilitacao: cadastro.primeiraHabilitacao || "",
      observacoes: cadastro.observacoes || "",
      cidadeEmissao: cadastro.cidadeEmissao || "",
      ufCnh: cadastro.ufCnh || "",
      dataEmissao: cadastro.dataEmissao || "",
      codigoSeguranca: cadastro.codigoSeguranca || "",
      renach: cadastro.renach || "",
      sexo: cadastro.sexo || "",
      fotoRosto: cadastro.fotoRosto || "",
      nacionalidade: cadastro.nacionalidade || "",
      ufNascimento: cadastro.ufNascimento || "",
      cidadeNascimento: cadastro.cidadeNascimento || "",
      fotoAssinatura: cadastro.fotoAssinatura || "",
      categoriasAdicionais: cadastro.categoriasAdicionais || []
    })
  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.use((req, res) => {
  res.status(404).json({ erro: "Rota não encontrada" })
})

app.use((error, req, res, next) => {
  console.error(error)
  if (res.headersSent) return next(error)
  res.status(500).json({ erro: "Erro interno do servidor" })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor rodando em ${APP_BASE_URL}`)
})