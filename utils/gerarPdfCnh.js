const fs = require("fs")
const path = require("path")
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib")
const QRCode = require("qrcode")

module.exports = async function gerarPdfCnh({ id, dados, urlValidacao }) {
  const modeloPath = path.join(__dirname, "../models/posicionamento.pdf")

  if (!fs.existsSync(modeloPath)) {
    throw new Error("Modelo PDF da CNH não encontrado em /models/posicionamento.pdf")
  }

  const modeloBytes = fs.readFileSync(modeloPath)
  const pdfDoc = await PDFDocument.load(modeloBytes)
  const page = pdfDoc.getPages()[0]

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier)

  const corTexto = rgb(0, 0, 0)
  const corVermelha = rgb(1, 0.184, 0.184)

  function texto(valor, x, y, size = 10, bold = false, color = corTexto, font = null) {
    const textoFinal = String(valor || "").trim()
    if (!textoFinal) return

    page.drawText(textoFinal, {
      x,
      y,
      size,
      font: font || (bold ? fontBold : fontRegular),
      color
    })
  }

  function textoRotacionado(valor, x, y, angle = 270, size = 10, bold = false, color = corTexto, font = null) {
    const textoFinal = String(valor || "").trim()
    if (!textoFinal) return

    page.drawText(textoFinal, {
      x,
      y,
      size,
      rotate: degrees(angle),
      font: font || (bold ? fontBold : fontRegular),
      color
    })
  }

  function quebrarTextoPorCaracteres(valor = "", limite = 25) {
    const textoLimpo = String(valor || "").trim()
    if (!textoLimpo) return []

    if (textoLimpo.length <= limite) {
      return [textoLimpo]
    }

    const palavras = textoLimpo.split(/\s+/).filter(Boolean)
    const linhas = []
    let linhaAtual = ""

    for (const palavra of palavras) {
      const teste = linhaAtual ? `${linhaAtual} ${palavra}` : palavra

      if (teste.length <= limite) {
        linhaAtual = teste
      } else {
        if (linhaAtual) {
          linhas.push(linhaAtual)
          linhaAtual = palavra
        } else {
          linhas.push(palavra)
          linhaAtual = ""
        }
      }
    }

    if (linhaAtual) {
      linhas.push(linhaAtual)
    }

    return linhas
  }

  function textoMultilinha(valor, x, y, size = 6, bold = false, color = corTexto, limiteCaracteres = 25, espacamento = 7) {
    const textoFinal = String(valor || "").trim()
    if (!textoFinal) return

    const fonte = bold ? fontBold : fontRegular
    const linhas = quebrarTextoPorCaracteres(textoFinal, limiteCaracteres)

    linhas.forEach((linha, index) => {
      page.drawText(linha, {
        x,
        y: y - (index * espacamento),
        size,
        font: fonte,
        color
      })
    })
  }

  async function embedImageFromBase64(base64) {
    if (!base64 || typeof base64 !== "string") return null

    const match = base64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) return null

    const mime = match[1]
    const bytes = Buffer.from(match[2], "base64")

    if (mime.includes("png")) return await pdfDoc.embedPng(bytes)
    if (mime.includes("jpeg") || mime.includes("jpg")) return await pdfDoc.embedJpg(bytes)

    return null
  }

  function normalizarData(valor) {
    return String(valor || "").trim()
  }

  function montarCidadeUf(cidade, uf) {
    const c = String(cidade || "").trim()
    const u = String(uf || "").trim()
    if (c && u) return `${c}, ${u}`
    return c || u || ""
  }

  function montarDocumento(numero, orgao, uf) {
    const n = String(numero || "").trim()
    const o = String(orgao || "").trim()
    const u = String(uf || "").trim()
    return [n, o, u].filter(Boolean).join(" ")
  }

  function formatarCPF(valor = "") {
    const numeros = String(valor || "").replace(/\D/g, "").slice(0, 11)

    if (!numeros) return ""
    if (numeros.length <= 3) return numeros
    if (numeros.length <= 6) return numeros.replace(/^(\d{3})(\d+)/, "$1.$2")
    if (numeros.length <= 9) return numeros.replace(/^(\d{3})(\d{3})(\d+)/, "$1.$2.$3")

    return numeros.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, "$1.$2.$3-$4")
  }

  function nomeEstadoPorUF(uf = "") {
    const estados = {
      AC: "ACRE",
      AL: "ALAGOAS",
      AP: "AMAPÁ",
      AM: "AMAZONAS",
      BA: "BAHIA",
      CE: "CEARÁ",
      DF: "DISTRITO FEDERAL",
      ES: "ESPÍRITO SANTO",
      GO: "GOIÁS",
      MA: "MARANHÃO",
      MT: "MATO GROSSO",
      MS: "MATO GROSSO DO SUL",
      MG: "MINAS GERAIS",
      PA: "PARÁ",
      PB: "PARAÍBA",
      PR: "PARANÁ",
      PE: "PERNAMBUCO",
      PI: "PIAUÍ",
      RJ: "RIO DE JANEIRO",
      RN: "RIO GRANDE DO NORTE",
      RS: "RIO GRANDE DO SUL",
      RO: "RONDÔNIA",
      RR: "RORAIMA",
      SC: "SANTA CATARINA",
      SP: "SÃO PAULO",
      SE: "SERGIPE",
      TO: "TOCANTINS"
    }

    return estados[String(uf || "").toUpperCase()] || String(uf || "").toUpperCase()
  }

  function abreviarNome(nome = "") {
    const partes = String(nome || "").trim().split(/\s+/).filter(Boolean)
    if (partes.length <= 2) return String(nome || "").toUpperCase()

    const primeiro = partes[0]
    const ultimo = partes[partes.length - 1]
    const meio = partes.slice(1, -1).map(p => p[0] + ".").join(" ")

    return `${primeiro} ${meio} ${ultimo}`.toUpperCase()
  }

  function getTipoDocumentoCracha() {
    return String(dados.tipoDocumento || "").toUpperCase().includes("PERMISSÃO") ? "P" : "D"
  }

  function getLinhaMrz1() {
    return `${dados.numeroDocumento || ""}${dados.ufEmissao || ""}${dados.orgaoEmissor || ""}`.toUpperCase()
  }

  function getLinhaMrz2() {
    return `${dados.numeroFormulario || ""}${String(dados.cpf || "").replace(/\D/g, "")}`
  }

  function getLinhaMrz3() {
    return abreviarNome(dados.nomeCompleto).replace(/\s+/g, "<")
  }

  const cpfFormatado = formatarCPF(dados.cpf)

  const categoriasAdicionaisOriginais = Array.isArray(dados.categoriasAdicionais)
    ? dados.categoriasAdicionais
    : []

  const validade0 = String(categoriasAdicionaisOriginais[0]?.validade || "").trim()
  const validade1 = String(categoriasAdicionaisOriginais[1]?.validade || "").trim()
  const validade2 = String(categoriasAdicionaisOriginais[2]?.validade || "").trim()
  const validade3 = String(categoriasAdicionaisOriginais[3]?.validade || "").trim()
  const validade4 = String(categoriasAdicionaisOriginais[4]?.validade || "").trim()
  const validade5 = String(categoriasAdicionaisOriginais[5]?.validade || "").trim()
  const validade6 = String(categoriasAdicionaisOriginais[6]?.validade || "").trim()
  const validade7 = String(categoriasAdicionaisOriginais[7]?.validade || "").trim()
  const validade8 = String(categoriasAdicionaisOriginais[8]?.validade || "").trim()
  const validade9 = String(categoriasAdicionaisOriginais[9]?.validade || "").trim()
  const validade10 = String(categoriasAdicionaisOriginais[10]?.validade || "").trim()
  const validade11 = String(categoriasAdicionaisOriginais[11]?.validade || "").trim()
  const validade12 = String(categoriasAdicionaisOriginais[12]?.validade || "").trim()
  const validade13 = String(categoriasAdicionaisOriginais[13]?.validade || "").trim()

  texto(String(dados.categoria || "").trim(), 243, 669, 7, true, corVermelha)

  texto(dados.nomeCompleto, 76, 727, 6, false, corTexto)
  texto(normalizarData(dados.primeiraHabilitacao), 230, 727, 6, false, corTexto)

  texto(
    `${normalizarData(dados.dataNascimento)}${dados.cidadeNascimento || dados.ufNascimento ? ", " : ""}${montarCidadeUf(dados.cidadeNascimento, dados.ufNascimento)}`,
    145,
    712,
    6,
    false,
    corTexto
  )

  texto(normalizarData(dados.dataEmissao), 143, 697, 6, false, corTexto)
  texto(normalizarData(dados.validade), 188, 697, 6, false, corVermelha)

  texto(montarDocumento(dados.numeroDocumento, dados.orgaoEmissor, dados.ufEmissao), 143, 682, 6, false, corTexto)
  texto(cpfFormatado, 143, 669, 6, false, corTexto)
  texto(dados.numeroRegistro, 194, 669, 6, false, corVermelha)

  textoRotacionado(dados.numeroFormulario, 60, 611, 90, 10, false, corTexto)
  textoRotacionado(dados.numeroFormulario, 60, 438, 90, 10, false, corTexto)

  texto(dados.codigoSeguranca, 215, 470, 5, false, corTexto)
  texto(dados.renach, 215, 465, 5, false, corTexto)

  texto(dados.nacionalidade, 142, 655, 5, false, corTexto)

  textoMultilinha(dados.nomePai, 145, 639, 6, false, corTexto, 25, 7)
  textoMultilinha(dados.nomeMae, 145, 623, 6, false, corTexto, 25, 7)

  texto(dados.observacoes, 74, 515, 7, false, corTexto)

  texto(getTipoDocumentoCracha(), 256, 698, 9, true, corTexto)

  texto(nomeEstadoPorUF(dados.ufEmissao || dados.ufCnh || dados.ufLocalHabilitacao || ""), 124, 437, 9, true, corTexto)
  texto(`${dados.cidadeEmissao || ""}, ${dados.ufEmissao || ""}`, 73, 459, 5, false, corTexto)

  texto(getLinhaMrz1() + "<<<<<<<<", 87, 312, 8, false, corTexto, fontMono)
  texto(getLinhaMrz2() + "<<<<<<<2<", 87, 300, 8, false, corTexto, fontMono)
  texto(getLinhaMrz3() + "<<<<<<", 87, 288, 8, false, corTexto, fontMono)

  texto(validade0, 128, 575, 4, false, corTexto)
  texto(validade1, 128, 567, 4, false, corTexto)
  texto(validade2, 128, 559, 4, false, corTexto)
  texto(validade3, 128, 551, 4, false, corTexto)
  texto(validade4, 128, 543, 4, false, corTexto)
  texto(validade5, 128, 535, 4, false, corTexto)
  texto(validade6, 229, 583, 4, false, corTexto)
  texto(validade7, 229, 575, 4, false, corTexto)
  texto(validade8, 229, 567, 4, false, corTexto)
  texto(validade9, 229, 559, 4, false, corTexto)
  texto(validade10, 229, 551, 4, false, corTexto)
  texto(validade11, 229, 543, 4, false, corTexto)
  texto(validade12, 229, 535, 4, false, corTexto)
  texto(validade13, 128, 583, 4, false, corTexto)

  const foto = await embedImageFromBase64(dados.fotoRosto)
  if (foto) {
    page.drawImage(foto, {
      x: 74,
      y: 633,
      width: 61,
      height: 82
    })
  }

  const assinatura = await embedImageFromBase64(dados.fotoAssinatura)
  if (assinatura) {
    page.drawImage(assinatura, {
      x: 74,
      y: 615,
      width: 55,
      height: 20
    })
  }

  if (urlValidacao) {
    const qrDataUrl = await QRCode.toDataURL(urlValidacao, {
      margin: 1,
      width: 220
    })

    const qrBase64 = qrDataUrl.split(",")[1]
    const qrBytes = Buffer.from(qrBase64, "base64")
    const qrImage = await pdfDoc.embedPng(qrBytes)

    page.drawImage(qrImage, {
      x: 344,
      y: 562,
      width: 180,
      height: 180
    })
  }

  const pastaSaida = path.join(__dirname, "../generated/cnh-pdf")
  if (!fs.existsSync(pastaSaida)) {
    fs.mkdirSync(pastaSaida, { recursive: true })
  }

  const nomeArquivo = `cnh_${id}.pdf`
  const caminhoCompleto = path.join(pastaSaida, nomeArquivo)

  const finalBytes = await pdfDoc.save()
  fs.writeFileSync(caminhoCompleto, finalBytes)

  return caminhoCompleto
}