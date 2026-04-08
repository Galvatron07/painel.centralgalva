const categoriasFixas = ["A", "A1", "B", "B1", "C", "C1", "D", "D1", "BE", "CE", "C1E", "DE", "D1E", "ACC"]

function getUsuarioCompleto() {
  try {
    const salvo = localStorage.getItem("usuario")
    if (!salvo) return null

    const usuario = JSON.parse(salvo)
    if (usuario && typeof usuario === "object") {
      return usuario
    }

    return null
  } catch (e) {
    return null
  }
}

function getUsuarioLogado() {
  const usuarioCompleto = getUsuarioCompleto()

  if (usuarioCompleto && usuarioCompleto.usuario) {
    return String(usuarioCompleto.usuario).trim()
  }

  const usuarioAvulso = localStorage.getItem("usuarioLogado") || ""
  return String(usuarioAvulso).trim()
}

function getUsuarioToken() {
  const usuarioCompleto = getUsuarioCompleto()

  if (usuarioCompleto && usuarioCompleto.token) {
    return String(usuarioCompleto.token).trim()
  }

  return localStorage.getItem("usuarioToken") || ""
}

function salvarSessaoUsuario(dadosAtualizados = {}) {
  const usuarioAtual = getUsuarioCompleto() || {}
  const usuarioFinal = {
    ...usuarioAtual,
    ...dadosAtualizados
  }

  if (usuarioFinal && usuarioFinal.usuario) {
    localStorage.setItem("usuario", JSON.stringify(usuarioFinal))
    localStorage.setItem("usuarioLogado", usuarioFinal.usuario)

    if (usuarioFinal.token) {
      localStorage.setItem("usuarioToken", usuarioFinal.token)
    }
  }
}

function limparSessaoUsuario() {
  localStorage.removeItem("usuario")
  localStorage.removeItem("usuarioLogado")
  localStorage.removeItem("usuarioToken")
}

function getUsuarioHeaders(extra = {}) {
  const token = getUsuarioToken()

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...extra
  }
}

async function tratarRespostaUsuario(res) {
  let data = {}

  try {
    data = await res.json()
  } catch (error) {
    data = {}
  }

  if (res.status === 401) {
    limparSessaoUsuario()
    alert(data.erro || "Sessão expirada. Faça login novamente.")
    window.location.href = "login.html"
    throw new Error(data.erro || "Sessão expirada")
  }

  if (res.status === 403) {
    alert(data.erro || "Acesso não autorizado")
    throw new Error(data.erro || "Acesso não autorizado")
  }

  if (!res.ok) {
    throw new Error(data.erro || "Erro na requisição")
  }

  return data
}

async function logout() {
  try {
    const token = getUsuarioToken()

    if (token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: getUsuarioHeaders()
      })
    }
  } catch (error) {
    console.error("Erro ao finalizar sessão:", error)
  }

  limparSessaoUsuario()
  window.location.href = "login.html"
}

async function verificarSessaoUsuario() {
  const usuario = getUsuarioLogado()
  const token = getUsuarioToken()

  if (!usuario || !token) {
    limparSessaoUsuario()
    window.location.href = "login.html"
    return false
  }

  return true
}

function mostrarModalCriandoApp() {
  const modal = document.getElementById("modalCriandoApp")
  if (modal) {
    modal.classList.add("ativo")
    modal.setAttribute("aria-hidden", "false")
  }
}

function ocultarModalCriandoApp() {
  const modal = document.getElementById("modalCriandoApp")
  if (modal) {
    modal.classList.remove("ativo")
    modal.setAttribute("aria-hidden", "true")
  }
}

function aplicarMaiusculoAutomatico() {
  const campos = document.querySelectorAll("input:not([type='file']):not([type='email']), textarea")

  campos.forEach((campo) => {
    campo.addEventListener("input", () => {
      const inicio = campo.selectionStart
      const fim = campo.selectionEnd
      campo.value = String(campo.value || "").toUpperCase()
      if (typeof inicio === "number" && typeof fim === "number") {
        campo.setSelectionRange(inicio, fim)
      }
    })
  })
}

function formatarCPF(valor = "") {
  const numeros = String(valor || "").replace(/\D/g, "").slice(0, 11)

  if (!numeros) return ""
  if (numeros.length <= 3) return numeros
  if (numeros.length <= 6) return numeros.replace(/^(\d{3})(\d+)/, "$1.$2")
  if (numeros.length <= 9) return numeros.replace(/^(\d{3})(\d{3})(\d+)/, "$1.$2.$3")

  return numeros.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, "$1.$2.$3-$4")
}

function aplicarMascaraCpf() {
  const campo = document.getElementById("cpf")
  if (!campo) return

  campo.addEventListener("input", () => {
    const posicao = campo.selectionStart || 0
    const valorAntes = campo.value
    campo.value = formatarCPF(campo.value)

    const diferenca = campo.value.length - valorAntes.length
    const novaPosicao = Math.max(0, posicao + diferenca)

    try {
      campo.setSelectionRange(novaPosicao, novaPosicao)
    } catch (e) {}
  })

  campo.value = formatarCPF(campo.value)
}

function formatarData(valor = "") {
  const numeros = String(valor || "").replace(/\D/g, "").slice(0, 8)

  if (!numeros) return ""
  if (numeros.length <= 2) return numeros
  if (numeros.length <= 4) return numeros.replace(/^(\d{2})(\d+)/, "$1/$2")

  return numeros.replace(/^(\d{2})(\d{2})(\d+)/, "$1/$2/$3")
}

function aplicarMascaraDataNoCampo(campo) {
  if (!campo || campo.dataset.mascaraDataAplicada === "1") return

  campo.dataset.mascaraDataAplicada = "1"

  campo.addEventListener("input", () => {
    const posicao = campo.selectionStart || 0
    const valorAntes = campo.value
    campo.value = formatarData(campo.value)

    const diferenca = campo.value.length - valorAntes.length
    const novaPosicao = Math.max(0, posicao + diferenca)

    try {
      campo.setSelectionRange(novaPosicao, novaPosicao)
    } catch (e) {}
  })

  campo.value = formatarData(campo.value)
}

function aplicarMascarasDatas() {
  const idsDatas = [
    "primeiraHabilitacao",
    "dataNascimento",
    "dataEmissao",
    "validade"
  ]

  idsDatas.forEach((id) => {
    const campo = document.getElementById(id)
    aplicarMascaraDataNoCampo(campo)
  })

  const camposCategorias = document.querySelectorAll(".catExtraValidade")
  camposCategorias.forEach((campo) => aplicarMascaraDataNoCampo(campo))
}

async function inicializarCnhDigital() {
  const sessaoOk = await verificarSessaoUsuario()
  if (!sessaoOk) return

  const usuarioLogado = getUsuarioLogado()
  const saldoSidebar = document.getElementById("saldoSidebar")
  const usuarioLocal = getUsuarioCompleto()

  if (saldoSidebar && usuarioLocal) {
    saldoSidebar.innerText = "R$ " + Number(usuarioLocal.saldo || 0).toFixed(2).replace(".", ",")
  }

  try {
    const res = await fetch("/api/usuario/" + encodeURIComponent(usuarioLogado), {
      headers: getUsuarioHeaders()
    })

    const data = await tratarRespostaUsuario(res)

    if (saldoSidebar) {
      saldoSidebar.innerText = "R$ " + Number(data.saldo || 0).toFixed(2).replace(".", ",")
    }

    salvarSessaoUsuario(data)
  } catch (error) {
    console.error("[CNH DIGITAL] erro ao carregar usuário", error)
  }

  aplicarMaiusculoAutomatico()
  aplicarMascaraCpf()

  const wrap = document.getElementById("categoriasExtrasWrap")
  if (wrap && wrap.querySelectorAll(".categoria-extra-linha").length === 0) {
    adicionarCategoriaExtra()
  }

  aplicarMascarasDatas()
}

function randomDigits(qtd) {
  let out = ""
  for (let i = 0; i < qtd; i++) {
    out += Math.floor(Math.random() * 10)
  }
  return out
}

function gerarNumeroEspelho() {
  document.getElementById("numeroEspelho").value = randomDigits(10)
}

function gerarCodigoValidacao() {
  document.getElementById("codigoValidacao").value = randomDigits(11)
}

function gerarNumeroRegistro() {
  document.getElementById("numeroRegistro").value = "0" + randomDigits(10)
}

function gerarRenach() {
  const uf = (
    document.getElementById("ufCnh").value ||
    document.getElementById("ufEmissao").value ||
    "SP"
  ).toUpperCase()

  document.getElementById("renach").value = uf + randomDigits(9)
}

function arquivoParaBase64(inputId) {
  return new Promise((resolve) => {
    const input = document.getElementById(inputId)
    const file = input && input.files && input.files[0]

    if (!file) {
      resolve("")
      return
    }

    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => resolve("")
    reader.readAsDataURL(file)
  })
}

function adicionarCategoriaExtra() {
  const wrap = document.getElementById("categoriasExtrasWrap")
  const atuais = wrap.querySelectorAll(".categoria-extra-linha").length

  if (atuais >= categoriasFixas.length) {
    alert("Você já adicionou o máximo de categorias.")
    return
  }

  const categoria = categoriasFixas[atuais]

  const linha = document.createElement("div")
  linha.className = "categoria-extra-linha"
  linha.innerHTML = `
    <select class="catExtraNome" disabled>
      <option value="${categoria}" selected>${categoria}</option>
    </select>
    <input class="catExtraValidade" placeholder="dd/mm/aaaa">
    <button type="button" class="btn-remover-cat" onclick="removerCategoriaExtra(this)">Remover</button>
  `

  wrap.appendChild(linha)

  const novoCampoValidade = linha.querySelector(".catExtraValidade")
  aplicarMascaraDataNoCampo(novoCampoValidade)
}

function removerCategoriaExtra(botao) {
  const linha = botao.closest(".categoria-extra-linha")
  if (!linha) return
  linha.remove()
  reordenarCategoriasExtras()
}

function reordenarCategoriasExtras() {
  const linhas = document.querySelectorAll("#categoriasExtrasWrap .categoria-extra-linha")

  linhas.forEach((linha, i) => {
    const select = linha.querySelector(".catExtraNome")
    if (select) {
      select.innerHTML = `<option value="${categoriasFixas[i]}" selected>${categoriasFixas[i]}</option>`
    }
  })
}

async function criarCnhDigital() {
  const sessaoOk = await verificarSessaoUsuario()
  if (!sessaoOk) return

  const usuario = getUsuarioLogado()

  if (!usuario) {
    alert("Usuário não encontrado")
    window.location.href = "login.html"
    return
  }

  try {
    mostrarModalCriandoApp()

    const categoriasExtrasNomes = document.querySelectorAll(".catExtraNome")
    const categoriasExtrasValidades = document.querySelectorAll(".catExtraValidade")

    const categoriasAdicionais = []

    categoriasExtrasNomes.forEach((campoNome, i) => {
      const categoria = campoNome.value.trim().toUpperCase()
      const validade = categoriasExtrasValidades[i] ? formatarData(categoriasExtrasValidades[i].value).trim().toUpperCase() : ""

      if (categoria || validade) {
        categoriasAdicionais.push({ categoria, validade })
      }
    })

    const fotoRosto = await arquivoParaBase64("fotoRosto")
    const fotoAssinatura = await arquivoParaBase64("fotoAssinatura")

    const payload = {
      usuario,
      nomeCompleto: document.getElementById("nomeCompleto").value.trim().toUpperCase(),
      primeiraHabilitacao: formatarData(document.getElementById("primeiraHabilitacao").value).trim().toUpperCase(),
      dataNascimento: formatarData(document.getElementById("dataNascimento").value).trim().toUpperCase(),
      cidadeNascimento: document.getElementById("cidadeNascimento").value.trim().toUpperCase(),
      ufNascimento: document.getElementById("ufNascimento").value.trim().toUpperCase(),
      dataEmissao: formatarData(document.getElementById("dataEmissao").value).trim().toUpperCase(),
      validade: formatarData(document.getElementById("validade").value).trim().toUpperCase(),
      tipoDocumento: document.getElementById("tipoDocumento").value.trim().toUpperCase(),
      numeroDocumento: document.getElementById("numeroDocumento").value.trim().toUpperCase(),
      orgaoEmissor: document.getElementById("orgaoEmissor").value.trim().toUpperCase(),
      ufEmissao: document.getElementById("ufEmissao").value.trim().toUpperCase(),
      cpf: formatarCPF(document.getElementById("cpf").value),
      numeroRegistro: document.getElementById("numeroRegistro").value.trim().toUpperCase(),
      numeroFormulario: document.getElementById("numeroEspelho").value.trim().toUpperCase(),
      categoria: document.getElementById("categoria").value.trim().toUpperCase(),
      nacionalidade: document.getElementById("nacionalidade").value.trim().toUpperCase(),
      nomePai: document.getElementById("nomePai").value.trim().toUpperCase(),
      nomeMae: document.getElementById("nomeMae").value.trim().toUpperCase(),
      observacoes: document.getElementById("observacoes").value.trim().toUpperCase(),
      codigoSeguranca: document.getElementById("codigoValidacao").value.trim().toUpperCase(),
      cidadeEmissao: document.getElementById("cidadeEmissao").value.trim().toUpperCase(),
      renach: document.getElementById("renach").value.trim().toUpperCase(),
      fotoRosto,
      fotoAssinatura,
      sexo: document.getElementById("sexo").value.trim().toUpperCase(),
      ufCnh: document.getElementById("ufCnh").value.trim().toUpperCase(),
      ufLocalHabilitacao: document.getElementById("ufLocalHabilitacao").value.trim().toUpperCase(),
      categoriasAdicionais
    }

    const res = await fetch("/api/cnh-digital/criar", {
      method: "POST",
      headers: getUsuarioHeaders(),
      body: JSON.stringify(payload)
    })

    const data = await tratarRespostaUsuario(res)
    console.log("[CRIAR CNH]", { status: res.status, resposta: data })

    if (!data.ok) {
      ocultarModalCriandoApp()
      alert(data.erro || "Erro ao criar cadastro")
      return
    }

    const usuarioAtual = getUsuarioCompleto() || {}
    salvarSessaoUsuario({
      ...usuarioAtual,
      saldo: Number(data.saldo || usuarioAtual.saldo || 0)
    })

    const resultado = document.getElementById("resultadoCnh")
    if (resultado) {
      resultado.innerHTML = `
        <div style="padding:16px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;background:#0b1527;">
          <div style="font-size:16px;"><strong>CNH criada com sucesso</strong></div>

          <div style="margin-top:12px;">
            <strong>CPF para acesso:</strong><br>
            ${data.cpf}
          </div>

          <div style="margin-top:10px;">
            <strong>Senha gerada:</strong><br>
            ${data.senhaApp}
          </div>

          <div style="margin-top:10px;">
            <strong>Expira em:</strong><br>
            ${new Date(data.expiraEm).toLocaleString()}
          </div>

          <div style="margin-top:10px;">
            <strong>Validação QR:</strong><br>
            ${data.urlValidacao}
          </div>

          <div style="margin-top:10px;">
            <strong>Saldo restante:</strong><br>
            R$ ${Number(data.saldo || 0).toFixed(2).replace(".", ",")}
          </div>
        </div>
      `
    }

    const saldoSidebar = document.getElementById("saldoSidebar")
    if (saldoSidebar) {
      saldoSidebar.innerText = "R$ " + Number(data.saldo || 0).toFixed(2).replace(".", ",")
    }

    setTimeout(() => {
      window.location.href = "historico-cnh.html"
    }, 900)
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao criar cadastro")
  } finally {
    setTimeout(() => {
      ocultarModalCriandoApp()
    }, 300)
  }
}