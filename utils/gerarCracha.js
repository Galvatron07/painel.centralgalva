const fs = require("fs")
const path = require("path")
const { createCanvas, loadImage } = require("canvas")
const QRCode = require("qrcode")

const WIDTH = 745
const HEIGHT = 1010

function garantirPasta(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function gerarSenha4Digitos() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function abreviarNome(nome = "") {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 2) return String(nome || "").toUpperCase()

  const primeiro = partes[0]
  const ultimo = partes[partes.length - 1]
  const meio = partes.slice(1, -1).map(p => p[0] + ".").join(" ")

  return `${primeiro} ${meio} ${ultimo}`.toUpperCase()
}

function formatarCPF(valor = "") {
  const numeros = String(valor || "").replace(/\D/g, "").slice(0, 11)

  if (!numeros) return ""
  if (numeros.length <= 3) return numeros
  if (numeros.length <= 6) return numeros.replace(/^(\d{3})(\d+)/, "$1.$2")
  if (numeros.length <= 9) return numeros.replace(/^(\d{3})(\d{3})(\d+)/, "$1.$2.$3")

  return numeros.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, "$1.$2.$3-$4")
}

function degToRad(deg) {
  return (deg * Math.PI) / 180
}

function drawRotatedText(
  ctx,
  text,
  x,
  y,
  angleDeg,
  font = "32px Arial",
  color = "#111",
  align = "left"
) {
  if (!text || !String(text).trim()) return

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(degToRad(angleDeg))
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = "top"
  ctx.fillText(String(text || ""), 0, 0)
  ctx.restore()
}

function quebrarTextoPorCaracteres(texto = "", limite = 25) {
  const textoLimpo = String(texto || "").trim()
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

function drawRotatedWrappedText(
  ctx,
  text,
  x,
  y,
  angleDeg,
  {
    font = "26px Arial",
    color = "#111",
    align = "left",
    limiteCaracteres = 25,
    espacamento = 28
  } = {}
) {
  if (!text || !String(text).trim()) return

  const linhas = quebrarTextoPorCaracteres(String(text || ""), limiteCaracteres)

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(degToRad(angleDeg))
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = "top"

  linhas.forEach((linha, index) => {
    ctx.fillText(linha, 0, index * espacamento)
  })

  ctx.restore()
}

async function drawImageBase64(ctx, base64, x, y, w, h, angleDeg = 0) {
  if (!base64) return

  try {
    const img = await loadImage(base64)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(degToRad(angleDeg))
    ctx.drawImage(img, 0, 0, w, h)
    ctx.restore()
  } catch (e) {
    console.error("Erro ao desenhar imagem base64:", e.message)
  }
}

async function gerarQrDataUrl(texto) {
  return QRCode.toDataURL(texto, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320
  })
}

async function gerarLado(basePath, outputPath, desenhoFn) {
  const base = await loadImage(basePath)
  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext("2d")

  ctx.drawImage(base, 0, 0, WIDTH, HEIGHT)
  await desenhoFn(ctx)

  const buffer = canvas.toBuffer("image/png")
  fs.writeFileSync(outputPath, buffer)
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

async function gerarArquivosCracha({
  id,
  dados,
  urlValidacao
}) {
  garantirPasta(path.join(process.cwd(), "generated", "crachas"))

  const senhaApp = String(dados?.senhaApp || "").trim() || gerarSenha4Digitos()
  const cpfFormatado = formatarCPF(dados.cpf)

  const out1 = path.join("generated", "crachas", `${id}-1.png`)
  const out2 = path.join("generated", "crachas", `${id}-2.png`)
  const out3 = path.join("generated", "crachas", `${id}-3.png`)
  const out4 = path.join("generated", "crachas", `${id}-4.png`)

  const base1 = path.join(process.cwd(), "models", "cracha-1-base.png")
  const base2 = path.join(process.cwd(), "models", "cracha-2-base.png")
  const base3 = path.join(process.cwd(), "models", "cracha-3-base.png")

  const qrDataUrl = await gerarQrDataUrl(urlValidacao)

  await gerarLado(base1, out1, async (ctx) => {
    drawRotatedText(ctx, dados.numeroFormulario, 50, 62, 0, "bold 45px Arial", "#111")

    await drawImageBase64(ctx, dados.fotoAssinatura, 140, 220, 180, 100, 90)
    await drawImageBase64(ctx, dados.fotoRosto, 470, 180, 250, 350, 90)

    drawRotatedText(ctx, dados.nomeCompleto, 538, 190, 90, "26px Arial", "#111")

    drawRotatedWrappedText(ctx, dados.nomeMae, 120, 475, 90, {
      font: "26px Arial",
      color: "#111",
      limiteCaracteres: 25,
      espacamento: 28
    })

    drawRotatedWrappedText(ctx, dados.nomePai, 175, 475, 90, {
      font: "26px Arial",
      color: "#111",
      limiteCaracteres: 25,
      espacamento: 28
    })

    drawRotatedText(ctx, dados.nacionalidade, 240, 475, 90, "26px Arial", "#111")
    drawRotatedText(ctx, cpfFormatado, 295, 475, 90, "25px Arial", "#111")
    drawRotatedText(ctx, dados.numeroRegistro, 295, 675, 90, "26px Arial", "#ff2f2f")
    drawRotatedText(ctx, dados.categoria, 295, 895, 90, "27px Arial", "#ff2f2f")

    drawRotatedText(
      ctx,
      `${dados.numeroDocumento || ""} ${dados.orgaoEmissor || ""} ${dados.ufEmissao || ""}`,
      355,
      475,
      90,
      "24px Arial",
      "#111"
    )

    drawRotatedText(ctx, dados.validade, 420, 655, 90, "26px Arial", "#ff2f2f")
    drawRotatedText(ctx, dados.dataEmissao, 420, 475, 90, "26px Arial", "#111")

    drawRotatedText(
      ctx,
      `${dados.dataNascimento || ""}, ${dados.cidadeNascimento || ""}/${dados.ufNascimento || ""}`,
      475,
      475,
      90,
      "24px Arial",
      "#111"
    )

    drawRotatedText(ctx, dados.primeiraHabilitacao, 535, 850, 90, "24px Arial", "#111")

    const tipoDocumentoCracha =
      String(dados.tipoDocumento || "").toUpperCase().includes("PERMISSÃO")
        ? "P"
        : "D"

    drawRotatedText(ctx, tipoDocumentoCracha, 425, 940, 90, "bold 34px Arial", "#111")
  })

  await gerarLado(base2, out2, async (ctx) => {
    drawRotatedText(ctx, dados.numeroFormulario, 50, 62, 0, "bold 45px Arial", "#111")
    drawRotatedText(ctx, dados.observacoes || "EAR", 410, 190, 90, "24px Arial", "#111")
    drawRotatedText(ctx, `${dados.cidadeEmissao || ""}, ${dados.ufEmissao || ""}`, 180, 190, 90, "24px Arial", "#111")

    const nomeEstado = nomeEstadoPorUF(dados.ufEmissao || dados.ufCnh || dados.ufLocalHabilitacao || "")
    drawRotatedText(ctx, nomeEstado, 78, 460, 90, "bold 34px Arial", "#111")

    const allCats = Array.isArray(dados.categoriasAdicionais)
      ? dados.categoriasAdicionais.slice(0, 14)
      : []

    const posicoesValidades = [
      { x: 660, y: 405, angle: 90, font: "18px Arial" },
      { x: 627, y: 405, angle: 90, font: "18px Arial" },
      { x: 595, y: 405, angle: 90, font: "18px Arial" },
      { x: 560, y: 405, angle: 90, font: "18px Arial" },
      { x: 525, y: 405, angle: 90, font: "18px Arial" },
      { x: 490, y: 405, angle: 90, font: "18px Arial" },
      { x: 695, y: 826, angle: 90, font: "18px Arial" },
      { x: 660, y: 826, angle: 90, font: "18px Arial" },
      { x: 627, y: 826, angle: 90, font: "18px Arial" },
      { x: 595, y: 826, angle: 90, font: "18px Arial" },
      { x: 560, y: 826, angle: 90, font: "18px Arial" },
      { x: 525, y: 826, angle: 90, font: "18px Arial" },
      { x: 490, y: 826, angle: 90, font: "18px Arial" },
      { x: 695, y: 405, angle: 90, font: "18px Arial" }
    ]

    allCats.forEach((c, i) => {
      if (!c) return
      if (!c.validade || !String(c.validade).trim()) return

      const pos = posicoesValidades[i]
      if (!pos) return

      drawRotatedText(
        ctx,
        c.validade,
        pos.x,
        pos.y,
        pos.angle,
        pos.font,
        "#111"
      )
    })

    drawRotatedText(ctx, dados.codigoSeguranca, 220, 755, 90, "22px Arial", "#111")
    drawRotatedText(ctx, dados.renach, 195, 755, 90, "22px Arial", "#111")
  })

  await gerarLado(base3, out3, async (ctx) => {
    const nomeLinha = abreviarNome(dados.nomeCompleto)
    const linha1 = `${dados.numeroDocumento || ""}${dados.ufEmissao || ""}${dados.orgaoEmissor || ""}`.toUpperCase()
    const linha2 = `${dados.numeroFormulario || ""}${String(dados.cpf || "").replace(/\D/g, "")}`

    drawRotatedText(ctx, linha1 + "<<<<<<<<<", 310, 190, 90, "26px Courier New", "#111")
    drawRotatedText(ctx, linha2 + "<<<<<<<2<", 275, 190, 90, "26px Courier New", "#111")
    drawRotatedText(ctx, nomeLinha.replace(/\s+/g, "<") + "<<<<<<", 240, 190, 90, "26px Courier New", "#111")
  })

  const canvas4 = createCanvas(450, 450)
  const ctx4 = canvas4.getContext("2d")
  const qrImg = await loadImage(qrDataUrl)
  ctx4.fillStyle = "#ffffff"
  ctx4.fillRect(0, 0, 450, 450)
  ctx4.drawImage(qrImg, 22, 40, 405, 360)
  fs.writeFileSync(out4, canvas4.toBuffer("image/png"))

  return {
    senhaApp,
    imagensCracha: [
      `/${out1.replace(/\\/g, "/")}`,
      `/${out2.replace(/\\/g, "/")}`,
      `/${out3.replace(/\\/g, "/")}`,
      `/${out4.replace(/\\/g, "/")}`
    ]
  }
}

module.exports = {
  gerarArquivosCracha
}