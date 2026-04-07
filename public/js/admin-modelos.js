let modelosCache = []
let medicosCache = []
let campoIndex = 0
let medicoIndex = 0
let previewGradeAtiva = true
let campoSelecionadoPreview = null
let dragPreviewState = null

function getAdminToken() {
  return localStorage.getItem("adminToken") || ""
}

function getAdminHeaders(extra = {}) {
  const token = getAdminToken()

  return {
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...extra
  }
}

async function tratarRespostaAdmin(res) {
  let data = {}

  try {
    data = await res.json()
  } catch (error) {
    data = {}
  }

  if (res.status === 401) {
    localStorage.removeItem("adminLogado")
    localStorage.removeItem("adminToken")
    localStorage.removeItem("adminEmail")
    alert(data.erro || "Sessão expirada. Faça login novamente.")
    window.location = "admin-loguin.html"
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

function verificarAdmin() {
  let adminLogado = localStorage.getItem("adminLogado")
  let adminToken = localStorage.getItem("adminToken")

  if (adminLogado !== "true" || !adminToken) {
    localStorage.removeItem("adminLogado")
    localStorage.removeItem("adminToken")
    localStorage.removeItem("adminEmail")
    window.location = "admin-loguin.html"
    return false
  }

  return true
}

function iniciarPaginaModelos() {
  if (!verificarAdmin()) return
  carregarModelos()
}

async function carregarModelos() {
  if (!verificarAdmin()) return

  try {
    const [resModelos, resMedicos] = await Promise.all([
      fetch("/api/modelos-editaveis", {
        headers: getAdminHeaders()
      }),
      fetch("/api/medicos-modelos", {
        headers: getAdminHeaders()
      })
    ])

    modelosCache = await tratarRespostaAdmin(resModelos)
    medicosCache = await tratarRespostaAdmin(resMedicos)

    if (!Array.isArray(modelosCache)) modelosCache = []
    if (!Array.isArray(medicosCache)) medicosCache = []

    renderizarModelos(modelosCache)
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao carregar modelos")
  }
}

function filtrarModelos() {
  const busca = (document.getElementById("filtroBuscaModelo")?.value || "").trim().toLowerCase()
  const grupo = document.getElementById("filtroGrupoModelo")?.value || ""

  let lista = [...modelosCache]

  if (busca) {
    lista = lista.filter(modelo =>
      String(modelo.nome || "").toLowerCase().includes(busca)
    )
  }

  if (grupo) {
    lista = lista.filter(modelo =>
      String(modelo.grupo || "").toUpperCase() === grupo
    )
  }

  renderizarModelos(lista)
}

function renderizarModelos(lista) {
  const container = document.getElementById("listaModelos")
  if (!container) return

  if (!lista.length) {
    container.innerHTML = `
      <div class="empty-state">
        Nenhum modelo encontrado.
      </div>
    `
    return
  }

  container.innerHTML = lista.map(modelo => {
    const medicosDoModelo = obterMedicosDoModelo(modelo)
    const qtdCampos = Array.isArray(modelo.campos) ? modelo.campos.length : 0
    const statusBadge = modelo.ativo
      ? `<span class="badge badge-active">ATIVO</span>`
      : `<span class="badge badge-inactive">INATIVO</span>`

    return `
      <div class="model-card">
        <div class="model-card-top">
          <div>
            <h3>${esc(modelo.nome)}</h3>
            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
              <span class="badge badge-group">${esc(modelo.grupo || "-")}</span>
              ${statusBadge}
            </div>
          </div>
        </div>

        <div class="model-info">
          <div class="info-box">
            <span>Tipo</span>
            <strong>${esc(modelo.tipo || "-")}</strong>
          </div>

          <div class="info-box">
            <span>Estado</span>
            <strong>${esc(modelo.estado || "-")}</strong>
          </div>

          <div class="info-box">
            <span>Cidade</span>
            <strong>${esc(modelo.cidade || "-")}</strong>
          </div>

          <div class="info-box">
            <span>Campos</span>
            <strong>${qtdCampos}</strong>
          </div>

          <div class="info-box">
            <span>Médicos</span>
            <strong>${medicosDoModelo.length}</strong>
          </div>

          <div class="info-box">
            <span>Custo</span>
            <strong>${Number(modelo.custoCreditos || 0)} créditos</strong>
          </div>

          <div class="info-box">
            <span>Atualização</span>
            <strong>${formatarData(modelo.atualizadoEm || modelo.criadoEm)}</strong>
          </div>

          <div class="info-box">
            <span>Arquivo base</span>
            <strong>${esc(modelo.arquivoBase || "-")}</strong>
          </div>
        </div>

        <div class="model-actions">
          <button class="btn-primary" onclick="editarModelo('${escapeAspas(modelo.id)}')">Editar</button>
          <button class="${modelo.ativo ? "btn-secondary" : "btn-success"}" onclick="alternarStatusModelo('${escapeAspas(modelo.id)}', ${modelo.ativo ? "false" : "true"})">
            ${modelo.ativo ? "Desativar" : "Ativar"}
          </button>
          <button class="btn-danger" onclick="excluirModelo('${escapeAspas(modelo.id)}')">Excluir</button>
        </div>
      </div>
    `
  }).join("")
}

function obterMedicosDoModelo(modelo) {
  const modeloId = String(modelo?.id || "").trim()
  const modeloNome = String(modelo?.nome || "").trim().toLowerCase()

  return medicosCache.filter(m => {
    const medicoModeloId = String(m.modeloId || "").trim()
    const medicoModeloNome = String(m.modeloNome || "").trim().toLowerCase()
    return medicoModeloId === modeloId || medicoModeloNome === modeloNome
  })
}

function abrirModalModelo() {
  limparFormularioModelo()

  const titulo = document.getElementById("tituloModalModelo")
  const modal = document.getElementById("modalModelo")

  if (titulo) titulo.innerText = "Novo Modelo"
  if (modal) modal.classList.add("active")

  adicionarCampoModelo()
  adicionarMedicoModelo()
  atualizarPreviewModelo()
}

function fecharModalModelo() {
  liberarBloqueiosDeDrag()

  const modal = document.getElementById("modalModelo")
  if (modal) modal.classList.remove("active")
}

function limparFormularioModelo() {
  campoIndex = 0
  medicoIndex = 0
  campoSelecionadoPreview = null
  dragPreviewState = null

  setValor("modeloId", "")
  setValor("modeloNome", "")
  setValor("modeloGrupo", "UPA")
  setValor("modeloTipo", "atestado")
  setValor("modeloEstado", "")
  setValor("modeloCidade", "")
  setValor("modeloArquivoBase", "")
  setValor("modeloPreviewImagem", "")
  setValor("modeloDescricao", "")
  setValor("modeloCustoCreditos", "20")
  setValor("modeloAtivo", "true")

  const campos = document.getElementById("camposModeloContainer")
  const medicos = document.getElementById("medicosModeloContainer")

  if (campos) campos.innerHTML = ""
  if (medicos) medicos.innerHTML = ""

  atualizarPreviewModelo()
}

function setValor(id, valor) {
  const el = document.getElementById(id)
  if (el) el.value = valor
}

function adicionarCampoModelo(dados = {}) {
  const container = document.getElementById("camposModeloContainer")
  if (!container) return

  const idx = campoIndex++
  const bloco = document.createElement("div")
  bloco.className = "field-block"
  bloco.setAttribute("data-campo-idx", idx)

  const nomeResumo = escAttr(dados.label || dados.nome || `Campo ${idx + 1}`)

  bloco.innerHTML = `
    <div class="field-block-top">
      <strong class="field-title">Campo ${idx + 1}</strong>
      <div class="field-actions-top">
        <button type="button" class="btn-minimizar" onclick="toggleMinimizarCampo(this)">Minimizar</button>
        <button type="button" class="btn-danger" onclick="removerBloco(this)">Remover</button>
      </div>
    </div>

    <div class="field-resumo">${nomeResumo}</div>

    <div class="field-body">
      <div class="field-help">
        <strong>Como ajustar esse campo:</strong><br>
        • <strong>Nome interno do sistema</strong> = nome técnico usado na geração<br>
        • <strong>Nome visível do campo</strong> = nome que aparece para você e na prévia<br>
        • <strong>Posição horizontal</strong> = esquerda para a direita<br>
        • <strong>Posição vertical</strong> = cima para baixo<br>
        • <strong>Comprimento visual</strong> = só referência visual, não corta texto real<br>
        • Você também pode <strong>arrastar o texto no preview com o mouse</strong>
      </div>

      <div class="mini-title">Informações do campo</div>
      <div class="grid-4">
        <div>
          <label>Nome interno do sistema</label>
          <input type="text" class="campo-nome" value="${escAttr(dados.nome || "")}" placeholder="ex: nome_paciente" />
        </div>
        <div>
          <label>Nome visível do campo</label>
          <input type="text" class="campo-label" value="${escAttr(dados.label || "")}" placeholder="ex: Nome Completo" />
        </div>
        <div>
          <label>Tipo do campo</label>
          <select class="campo-tipo">
            ${montarOptions([
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
            ], dados.tipo || "texto")}
          </select>
        </div>
        <div>
          <label>Campo obrigatório?</label>
          <select class="campo-obrigatorio">
            ${montarOptionsBoolean(dados.obrigatorio === true)}
          </select>
        </div>
      </div>

      <div class="mini-title">Posição no documento</div>
      <div class="grid-5">
        <div>
          <label>Página do PDF</label>
          <input type="number" class="campo-pagina" value="${num(dados.pagina, 1)}" />
        </div>
        <div>
          <label>Posição horizontal</label>
          <input type="number" class="campo-x" value="${num(dados.x, 0)}" />
        </div>
        <div>
          <label>Posição vertical</label>
          <input type="number" class="campo-y" value="${num(dados.y, 0)}" />
        </div>
        <div>
          <label>Comprimento visual</label>
          <input type="number" class="campo-largura" value="${num(dados.largura, 220)}" />
        </div>
        <div>
          <label>Altura visual</label>
          <input type="number" class="campo-altura" value="${num(dados.altura, 24)}" />
        </div>
      </div>

      <div class="mini-title">Texto</div>
      <div class="grid-5">
        <div>
          <label>Tamanho do texto</label>
          <input type="number" class="campo-tamanho" value="${num(dados.tamanho, 10)}" />
        </div>
        <div>
          <label>Fonte</label>
          <input type="text" class="campo-fonte" value="${escAttr(dados.fonte || "Helvetica")}" placeholder="Helvetica" />
        </div>
        <div>
          <label>Alinhamento do texto</label>
          <select class="campo-alinhamento">
            ${montarOptions(["left", "center", "right"], dados.alinhamento || "left")}
          </select>
        </div>
        <div>
          <label>Texto de ajuda</label>
          <input type="text" class="campo-placeholder" value="${escAttr(dados.placeholder || "")}" placeholder="texto que aparece antes de preencher" />
        </div>
        <div>
          <label>Valor inicial</label>
          <input type="text" class="campo-valorPadrao" value="${escAttr(dados.valorPadrao || "")}" placeholder="valor que já vem preenchido" />
        </div>
      </div>

      <div class="mini-title">Comportamento</div>
      <div class="grid-4">
        <div>
          <label>Máscara</label>
          <input type="text" class="campo-mascara" value="${escAttr(dados.mascara || "")}" placeholder="ex: CPF, data..." />
        </div>
        <div>
          <label>Opções do select</label>
          <input type="text" class="campo-opcoes" value="${escAttr(Array.isArray(dados.opcoes) ? dados.opcoes.join(", ") : "")}" placeholder="Opção 1, Opção 2" />
        </div>
        <div>
          <label>Mostrar no formulário?</label>
          <select class="campo-exibirNoFormulario">
            ${montarOptionsBoolean(dados.exibirNoFormulario !== false)}
          </select>
        </div>
        <div>
          <label>Vai para o PDF?</label>
          <select class="campo-renderizarNoPdf">
            ${montarOptionsBoolean(dados.renderizarNoPdf !== false)}
          </select>
        </div>
      </div>

      <div class="mini-title">Campo automático / Médico</div>
      <div class="grid-4">
        <div>
          <label>Tipo automático</label>
          <input type="text" class="campo-autoTipo" value="${escAttr(dados.autoTipo || "")}" placeholder="sequencial, protocolo, hashcurta..." />
        </div>
        <div>
          <label>Posição horizontal do CRM</label>
          <input type="number" class="campo-crmX" value="${num(dados.crmX, 0)}" />
        </div>
        <div>
          <label>Posição vertical do CRM</label>
          <input type="number" class="campo-crmY" value="${num(dados.crmY, 0)}" />
        </div>
        <div>
          <label>Tamanho do CRM</label>
          <input type="number" class="campo-crmTamanho" value="${num(dados.crmTamanho, 10)}" />
        </div>
      </div>

      <div class="grid-4">
        <div>
          <label>Posição horizontal do carimbo</label>
          <input type="number" class="campo-carimboX" value="${num(dados.carimboX, 0)}" />
        </div>
        <div>
          <label>Posição vertical do carimbo</label>
          <input type="number" class="campo-carimboY" value="${num(dados.carimboY, 0)}" />
        </div>
        <div>
          <label>Largura do carimbo</label>
          <input type="number" class="campo-carimboLargura" value="${num(dados.carimboLargura, 120)}" />
        </div>
        <div>
          <label>Altura do carimbo</label>
          <input type="number" class="campo-carimboAltura" value="${num(dados.carimboAltura, 60)}" />
        </div>
      </div>
    </div>
  `

  container.appendChild(bloco)
  atualizarResumoCampo(bloco)
  vincularEventosCampo(bloco)
  atualizarPreviewModelo()
}

function adicionarMedicoModelo(dados = {}) {
  const container = document.getElementById("medicosModeloContainer")
  if (!container) return

  const idx = medicoIndex++
  const bloco = document.createElement("div")
  bloco.className = "doctor-block"

  bloco.innerHTML = `
    <div class="doctor-block-top">
      <strong>Médico ${idx + 1}</strong>
      <button type="button" class="btn-danger" onclick="removerBloco(this)">Remover</button>
    </div>

    <div class="grid-3">
      <div>
        <label>Nome completo do médico</label>
        <input type="text" class="medico-nome" value="${escAttr(dados.nome || "")}" placeholder="Dr. João da Silva" />
      </div>
      <div>
        <label>CRM do médico</label>
        <input type="text" class="medico-crm" value="${escAttr(dados.crm || "")}" placeholder="CRM 123456" />
      </div>
      <div>
        <label>Status</label>
        <select class="medico-ativo">
          ${montarOptionsBoolean(dados.ativo !== false)}
        </select>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <label>Carimbo PNG</label>
        <div style="display:flex; gap:10px;">
          <input type="text" class="medico-carimboPng" value="${escAttr(dados.carimboPng || "")}" placeholder="./uploads/carimbos/c1.png" readonly />
          <button type="button" class="btn-secondary btn-upload-carimbo">Selecionar PNG</button>
        </div>
        <input type="file" class="medico-input-carimbo" accept="image/png" style="display:none;" />
      </div>

      <div>
        <label>Assinatura PNG</label>
        <div style="display:flex; gap:10px;">
          <input type="text" class="medico-assinaturaPng" value="${escAttr(dados.assinaturaPng || "")}" placeholder="./uploads/assinaturas/a1.png" readonly />
          <button type="button" class="btn-secondary btn-upload-assinatura">Selecionar PNG</button>
        </div>
        <input type="file" class="medico-input-assinatura" accept="image/png" style="display:none;" />
      </div>
    </div>

    <div class="mini-title">Posicionamento do carimbo do médico</div>
    <div class="grid-4">
      <div>
        <label>Posição horizontal do PNG</label>
        <input type="number" class="medico-carimboX" value="${num(dados.carimboX, 0)}" />
      </div>
      <div>
        <label>Posição vertical do PNG</label>
        <input type="number" class="medico-carimboY" value="${num(dados.carimboY, 0)}" />
      </div>
      <div>
        <label>Largura do PNG</label>
        <input type="number" class="medico-carimboLargura" value="${num(dados.carimboLargura, 140)}" />
      </div>
      <div>
        <label>Altura do PNG</label>
        <input type="number" class="medico-carimboAltura" value="${num(dados.carimboAltura, 70)}" />
      </div>
    </div>
  `

  container.appendChild(bloco)
  vincularEventosMedico(bloco)
  vincularEventosPreviewMedico(bloco)
  atualizarPreviewModelo()
}

function toggleMinimizarCampo(botao) {
  const bloco = botao.closest(".field-block")
  if (!bloco) return

  bloco.classList.toggle("minimizado")
  const minimizado = bloco.classList.contains("minimizado")
  botao.innerText = minimizado ? "Expandir" : "Minimizar"
}

function atualizarResumoCampo(bloco) {
  if (!bloco) return
  const nome = bloco.querySelector(".campo-label")?.value.trim() || bloco.querySelector(".campo-nome")?.value.trim() || "Campo sem nome"
  const resumo = bloco.querySelector(".field-resumo")
  if (resumo) resumo.innerText = nome
}

function removerBloco(btn) {
  const bloco = btn.closest(".field-block, .doctor-block")
  if (bloco) bloco.remove()
  atualizarPreviewModelo()
}

function montarOptions(lista, selecionado) {
  return lista.map(item => `
    <option value="${item}" ${String(item) === String(selecionado) ? "selected" : ""}>${item}</option>
  `).join("")
}

function montarOptionsBoolean(valor) {
  return `
    <option value="true" ${valor ? "selected" : ""}>Sim</option>
    <option value="false" ${!valor ? "selected" : ""}>Não</option>
  `
}

function coletarCamposModelo() {
  const blocos = document.querySelectorAll("#camposModeloContainer .field-block")
  const campos = Array.from(blocos).map(bloco => ({
    nome: bloco.querySelector(".campo-nome")?.value.trim() || "",
    label: bloco.querySelector(".campo-label")?.value.trim() || "",
    tipo: bloco.querySelector(".campo-tipo")?.value || "texto",
    obrigatorio: bloco.querySelector(".campo-obrigatorio")?.value === "true",
    pagina: Number(bloco.querySelector(".campo-pagina")?.value || 1),
    x: Number(bloco.querySelector(".campo-x")?.value || 0),
    y: Number(bloco.querySelector(".campo-y")?.value || 0),
    largura: Number(bloco.querySelector(".campo-largura")?.value || 220),
    altura: Number(bloco.querySelector(".campo-altura")?.value || 24),
    tamanho: Number(bloco.querySelector(".campo-tamanho")?.value || 10),
    fonte: bloco.querySelector(".campo-fonte")?.value.trim() || "Helvetica",
    alinhamento: bloco.querySelector(".campo-alinhamento")?.value || "left",
    placeholder: bloco.querySelector(".campo-placeholder")?.value.trim() || "",
    valorPadrao: bloco.querySelector(".campo-valorPadrao")?.value || "",
    mascara: bloco.querySelector(".campo-mascara")?.value.trim() || "",
    opcoes: separarLista(bloco.querySelector(".campo-opcoes")?.value || ""),
    exibirNoFormulario: bloco.querySelector(".campo-exibirNoFormulario")?.value === "true",
    renderizarNoPdf: bloco.querySelector(".campo-renderizarNoPdf")?.value === "true",
    autoTipo: bloco.querySelector(".campo-autoTipo")?.value.trim() || "",
    crmX: Number(bloco.querySelector(".campo-crmX")?.value || 0),
    crmY: Number(bloco.querySelector(".campo-crmY")?.value || 0),
    crmTamanho: Number(bloco.querySelector(".campo-crmTamanho")?.value || 10),
    carimboX: Number(bloco.querySelector(".campo-carimboX")?.value || 0),
    carimboY: Number(bloco.querySelector(".campo-carimboY")?.value || 0),
    carimboLargura: Number(bloco.querySelector(".campo-carimboLargura")?.value || 120),
    carimboAltura: Number(bloco.querySelector(".campo-carimboAltura")?.value || 60)
  }))

  const jaTemMedicoSelect = campos.some(campo => campo.tipo === "medico_select")

  if (!jaTemMedicoSelect) {
    campos.push({
      nome: "medico",
      label: "Selecionar Médico / Carimbo",
      tipo: "medico_select",
      obrigatorio: true,
      pagina: 1,
      x: 0,
      y: 0,
      largura: 220,
      altura: 24,
      tamanho: 10,
      fonte: "Helvetica",
      alinhamento: "left",
      placeholder: "",
      valorPadrao: "",
      mascara: "",
      opcoes: [],
      exibirNoFormulario: true,
      renderizarNoPdf: false,
      autoTipo: "",
      crmX: 0,
      crmY: 0,
      crmTamanho: 10,
      carimboX: 0,
      carimboY: 0,
      carimboLargura: 120,
      carimboAltura: 60
    })
  }

  return campos
}

function coletarMedicosModelo() {
  const blocos = document.querySelectorAll("#medicosModeloContainer .doctor-block")
  return Array.from(blocos).map(bloco => ({
    nome: bloco.querySelector(".medico-nome")?.value.trim() || "",
    crm: bloco.querySelector(".medico-crm")?.value.trim() || "",
    carimboPng: bloco.querySelector(".medico-carimboPng")?.value.trim() || "",
    assinaturaPng: bloco.querySelector(".medico-assinaturaPng")?.value.trim() || "",
    carimboX: Number(bloco.querySelector(".medico-carimboX")?.value || 0),
    carimboY: Number(bloco.querySelector(".medico-carimboY")?.value || 0),
    carimboLargura: Number(bloco.querySelector(".medico-carimboLargura")?.value || 140),
    carimboAltura: Number(bloco.querySelector(".medico-carimboAltura")?.value || 70),
    ativo: bloco.querySelector(".medico-ativo")?.value === "true"
  })).filter(m => m.nome)
}

function separarLista(texto) {
  return String(texto || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
}

async function salvarModeloCompleto() {
  if (!verificarAdmin()) return

  try {
    const modeloId = document.getElementById("modeloId")?.value.trim()
    const nome = document.getElementById("modeloNome")?.value.trim()
    const grupo = document.getElementById("modeloGrupo")?.value || "UPA"
    const tipo = document.getElementById("modeloTipo")?.value.trim() || "atestado"
    const estado = document.getElementById("modeloEstado")?.value.trim()
    const cidade = document.getElementById("modeloCidade")?.value.trim()
    const arquivoBase = document.getElementById("modeloArquivoBase")?.value.trim()
    const previewImagem = document.getElementById("modeloPreviewImagem")?.value.trim()
    const descricao = document.getElementById("modeloDescricao")?.value.trim()
    const custoCreditos = Number(document.getElementById("modeloCustoCreditos")?.value || 20)
    const ativo = document.getElementById("modeloAtivo")?.value === "true"

    if (!nome) {
      alert("Preencha o nome do modelo")
      return
    }

    if (!arquivoBase) {
      alert("Selecione o PDF base do modelo")
      return
    }

    const campos = coletarCamposModelo()
    const medicos = coletarMedicosModelo()

    const payloadModelo = {
      nome,
      grupo,
      tipo,
      estado,
      cidade,
      arquivoBase,
      previewImagem,
      previewWidth: obterLarguraPreview(),
      previewHeight: obterAlturaPreview(),
      descricao,
      custoCreditos,
      ativo,
      campos
    }

    let modeloSalvo = null

    if (modeloId) {
      const res = await fetch(`/api/modelos-editaveis/${modeloId}`, {
        method: "PUT",
        headers: {
          ...getAdminHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payloadModelo)
      })

      const data = await tratarRespostaAdmin(res)

      if (!data.ok) {
        alert(data.erro || "Erro ao atualizar modelo")
        return
      }

      modeloSalvo = data.modelo
    } else {
      const res = await fetch("/api/modelos-editaveis", {
        method: "POST",
        headers: {
          ...getAdminHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payloadModelo)
      })

      const data = await tratarRespostaAdmin(res)

      if (!data.ok) {
        alert(data.erro || "Erro ao criar modelo")
        return
      }

      modeloSalvo = data.modelo
    }

    await sincronizarMedicosDoModelo(modeloSalvo, medicos)

    alert("Modelo salvo com sucesso")
    fecharModalModelo()
    await carregarModelos()
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao salvar modelo")
  }
}

async function sincronizarMedicosDoModelo(modelo, medicosFormulario) {
  const atuais = obterMedicosDoModelo(modelo)

  for (const medico of atuais) {
    const resDelete = await fetch(`/api/medicos-modelos/${medico.id}`, {
      method: "DELETE",
      headers: getAdminHeaders()
    })
    await tratarRespostaAdmin(resDelete)
  }

  for (const medico of medicosFormulario) {
    const resPost = await fetch("/api/medicos-modelos", {
      method: "POST",
      headers: {
        ...getAdminHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        nome: medico.nome,
        crm: medico.crm,
        grupo: modelo.grupo,
        carimboPng: medico.carimboPng,
        assinaturaPng: medico.assinaturaPng,
        carimboX: medico.carimboX,
        carimboY: medico.carimboY,
        carimboLargura: medico.carimboLargura,
        carimboAltura: medico.carimboAltura,
        ativo: medico.ativo,
        modeloId: modelo.id,
        modeloNome: modelo.nome
      })
    })

    await tratarRespostaAdmin(resPost)
  }
}

async function editarModelo(modeloId) {
  if (!verificarAdmin()) return

  try {
    const res = await fetch(`/api/modelos-editaveis/${modeloId}`, {
      headers: getAdminHeaders()
    })

    const modelo = await tratarRespostaAdmin(res)

    limparFormularioModelo()

    setValor("modeloId", modelo.id || "")
    setValor("modeloNome", modelo.nome || "")
    setValor("modeloGrupo", modelo.grupo || "UPA")
    setValor("modeloTipo", modelo.tipo || "atestado")
    setValor("modeloEstado", modelo.estado || "")
    setValor("modeloCidade", modelo.cidade || "")
    setValor("modeloArquivoBase", modelo.arquivoBase || "")
    setValor("modeloPreviewImagem", modelo.previewImagem || "")
    setValor("modeloDescricao", modelo.descricao || "")
    setValor("modeloCustoCreditos", String(modelo.custoCreditos || 20))
    setValor("modeloAtivo", modelo.ativo ? "true" : "false")

    if (Array.isArray(modelo.campos) && modelo.campos.length) {
      modelo.campos.forEach(campo => adicionarCampoModelo(campo))
    } else {
      adicionarCampoModelo()
    }

    const medicosDoModelo = obterMedicosDoModelo(modelo)
    if (medicosDoModelo.length) {
      medicosDoModelo.forEach(medico => adicionarMedicoModelo(medico))
    } else {
      adicionarMedicoModelo()
    }

    const titulo = document.getElementById("tituloModalModelo")
    const modal = document.getElementById("modalModelo")

    if (titulo) titulo.innerText = "Editar Modelo"
    if (modal) modal.classList.add("active")

    atualizarPreviewModelo()
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao carregar modelo")
  }
}

async function alternarStatusModelo(modeloId, ativar) {
  if (!verificarAdmin()) return

  try {
    const rota = ativar
      ? `/api/modelos-editaveis/${modeloId}/ativar`
      : `/api/modelos-editaveis/${modeloId}/desativar`

    const res = await fetch(rota, {
      method: "POST",
      headers: getAdminHeaders()
    })

    const data = await tratarRespostaAdmin(res)

    if (!data.ok) {
      alert(data.erro || "Erro ao alterar status")
      return
    }

    await carregarModelos()
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao alterar status")
  }
}

async function excluirModelo(modeloId) {
  if (!verificarAdmin()) return

  const confirmar = confirm("Deseja excluir este modelo?")
  if (!confirmar) return

  try {
    const modelo = modelosCache.find(m => m.id === modeloId)

    const res = await fetch(`/api/modelos-editaveis/${modeloId}`, {
      method: "DELETE",
      headers: getAdminHeaders()
    })

    const data = await tratarRespostaAdmin(res)

    if (!data.ok) {
      alert(data.erro || "Erro ao excluir modelo")
      return
    }

    if (modelo) {
      const medicos = obterMedicosDoModelo(modelo)
      for (const medico of medicos) {
        const resDelete = await fetch(`/api/medicos-modelos/${medico.id}`, {
          method: "DELETE",
          headers: getAdminHeaders()
        })
        await tratarRespostaAdmin(resDelete)
      }
    }

    alert("Modelo excluído com sucesso")
    await carregarModelos()
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao excluir modelo")
  }
}

/* =========================
   UPLOADS
========================= */

async function uploadPdfModelo(input) {
  if (!verificarAdmin()) return

  const arquivo = input?.files?.[0]
  if (!arquivo) return

  const formData = new FormData()
  formData.append("arquivo", arquivo)

  try {
    const res = await fetch("/api/upload/modelo-pdf", {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData
    })

    const data = await tratarRespostaAdmin(res)

    if (!data.ok) {
      alert(data.erro || "Erro ao enviar PDF")
      input.value = ""
      return
    }

    setValor("modeloArquivoBase", data.caminho || "")
    input.value = ""
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao enviar PDF")
    input.value = ""
  }
}

async function uploadPreviewModelo(input) {
  if (!verificarAdmin()) return

  const arquivo = input?.files?.[0]
  if (!arquivo) return

  const formData = new FormData()
  formData.append("arquivo", arquivo)

  try {
    const res = await fetch("/api/upload/modelo-preview", {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData
    })

    const data = await tratarRespostaAdmin(res)

    if (!data.ok) {
      alert(data.erro || "Erro ao enviar imagem de prévia")
      input.value = ""
      return
    }

    setValor("modeloPreviewImagem", data.caminho || "")
    atualizarPreviewModelo()
    input.value = ""
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao enviar imagem de prévia")
    input.value = ""
  }
}

async function uploadCarimboMedico(input, campoTexto) {
  if (!verificarAdmin()) return

  const arquivo = input?.files?.[0]
  if (!arquivo) return

  const formData = new FormData()
  formData.append("arquivo", arquivo)

  try {
    const res = await fetch("/api/upload/carimbo", {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData
    })

    const data = await tratarRespostaAdmin(res)

    if (!data.ok) {
      alert(data.erro || "Erro ao enviar carimbo PNG")
      input.value = ""
      return
    }

    if (campoTexto) campoTexto.value = data.caminho || ""
    input.value = ""
    atualizarPreviewModelo()
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao enviar carimbo PNG")
    input.value = ""
  }
}

async function uploadAssinaturaMedico(input, campoTexto) {
  if (!verificarAdmin()) return

  const arquivo = input?.files?.[0]
  if (!arquivo) return

  const formData = new FormData()
  formData.append("arquivo", arquivo)

  try {
    const res = await fetch("/api/upload/assinatura", {
      method: "POST",
      headers: getAdminHeaders(),
      body: formData
    })

    const data = await tratarRespostaAdmin(res)

    if (!data.ok) {
      alert(data.erro || "Erro ao enviar assinatura PNG")
      input.value = ""
      return
    }

    if (campoTexto) campoTexto.value = data.caminho || ""
    input.value = ""
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao enviar assinatura PNG")
    input.value = ""
  }
}

/* =========================
   PREVIEW
========================= */

function alternarGradePreview() {
  previewGradeAtiva = !previewGradeAtiva
  const previewBox = document.getElementById("previewBox")
  if (!previewBox) return

  if (previewGradeAtiva) {
    previewBox.classList.add("grade")
  } else {
    previewBox.classList.remove("grade")
  }
}

function atualizarPreviewModelo() {
  const previewBox = document.getElementById("previewBox")
  const previewPlaceholder = document.getElementById("previewPlaceholder")
  if (!previewBox) return

  previewBox.querySelectorAll(".preview-field").forEach(el => el.remove())
  previewBox.querySelectorAll(".preview-medico").forEach(el => el.remove())

  const imagem = (document.getElementById("modeloPreviewImagem")?.value || "").trim()

  if (!imagem) {
    previewBox.style.backgroundImage = "none"
    if (previewPlaceholder) {
      previewPlaceholder.style.display = "flex"
      previewPlaceholder.innerText = "Selecione uma imagem de prévia para visualizar os campos aqui."
    }
    return
  }

  previewBox.style.backgroundImage = `url('${normalizarPathParaUrl(imagem)}')`
  if (previewPlaceholder) {
    previewPlaceholder.style.display = "none"
  }

  const blocos = document.querySelectorAll("#camposModeloContainer .field-block")
  blocos.forEach((bloco, index) => {
    const label = bloco.querySelector(".campo-label")?.value.trim() || `Campo ${index + 1}`
    const tipo = bloco.querySelector(".campo-tipo")?.value || "texto"
    const x = Number(bloco.querySelector(".campo-x")?.value || 0)
    const y = Number(bloco.querySelector(".campo-y")?.value || 0)
    const largura = Number(bloco.querySelector(".campo-largura")?.value || 220)
    const tamanho = Number(bloco.querySelector(".campo-tamanho")?.value || 10)

    atualizarResumoCampo(bloco)

    const item = document.createElement("div")
    item.className = "preview-field"
    item.style.left = `${x}px`
    item.style.top = `${y}px`
    item.style.fontSize = `${Math.max(tamanho, 8)}px`
    item.style.maxWidth = `${Math.max(largura, 80)}px`
    item.innerText = label
    item.setAttribute("data-preview-idx", String(index))
    item.title = `${label} • ${tipo}`

    if (campoSelecionadoPreview === index) {
      item.classList.add("selected")
      bloco.classList.add("active-preview")
    } else {
      bloco.classList.remove("active-preview")
    }

    item.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      selecionarCampoPreview(index, false)
    })

    item.addEventListener("mousedown", (e) => {
      iniciarDragPreview(e, index, item)
    })

    previewBox.appendChild(item)
  })

  const medicos = document.querySelectorAll("#medicosModeloContainer .doctor-block")
  medicos.forEach((bloco, index) => {
    const nome = bloco.querySelector(".medico-nome")?.value.trim() || `Médico ${index + 1}`
    const x = Number(bloco.querySelector(".medico-carimboX")?.value || 0)
    const y = Number(bloco.querySelector(".medico-carimboY")?.value || 0)
    const largura = Number(bloco.querySelector(".medico-carimboLargura")?.value || 140)
    const altura = Number(bloco.querySelector(".medico-carimboAltura")?.value || 70)

    const box = document.createElement("div")
    box.className = "preview-medico"
    box.style.left = `${x}px`
    box.style.top = `${y}px`
    box.style.width = `${Math.max(largura, 30)}px`
    box.style.height = `${Math.max(altura, 20)}px`
    box.innerText = `Carimbo:\n${nome}`
    previewBox.appendChild(box)
  })
}

function selecionarCampoPreview(index, deveScroll = true) {
  campoSelecionadoPreview = index

  const blocos = document.querySelectorAll("#camposModeloContainer .field-block")
  const itens = document.querySelectorAll("#previewBox .preview-field")

  blocos.forEach((bloco, i) => {
    bloco.classList.toggle("active-preview", i === index)
  })

  itens.forEach((item, i) => {
    item.classList.toggle("selected", i === index)
  })

  if (deveScroll && blocos[index]) {
    blocos[index].scrollIntoView({ behavior: "smooth", block: "center" })
  }
}

function iniciarDragPreview(event, index, item) {
  if (event.button !== 0) return

  event.preventDefault()
  event.stopPropagation()

  const blocos = Array.from(document.querySelectorAll("#camposModeloContainer .field-block"))
  const bloco = blocos[index]
  if (!bloco) return

  selecionarCampoPreview(index, false)

  const campoX = bloco.querySelector(".campo-x")
  const campoY = bloco.querySelector(".campo-y")
  const previewBox = document.getElementById("previewBox")
  if (!previewBox) return

  dragPreviewState = {
    index,
    bloco,
    item,
    previewBox,
    startMouseX: event.clientX,
    startMouseY: event.clientY,
    startX: Number(campoX?.value || 0),
    startY: Number(campoY?.value || 0)
  }

  item.classList.add("dragging")
  bloquearScrollEDragDaPagina()

  document.addEventListener("mousemove", moverDragPreview, { passive: false, capture: true })
  document.addEventListener("mouseup", finalizarDragPreview, { passive: false, capture: true })
}

function moverDragPreview(event) {
  if (!dragPreviewState) return

  event.preventDefault()
  event.stopPropagation()

  const previewRect = dragPreviewState.previewBox.getBoundingClientRect()

  const deltaX = event.clientX - dragPreviewState.startMouseX
  const deltaY = event.clientY - dragPreviewState.startMouseY

  let novoX = Math.round(dragPreviewState.startX + deltaX)
  let novoY = Math.round(dragPreviewState.startY + deltaY)

  novoX = Math.max(0, Math.min(novoX, Math.round(previewRect.width - 10)))
  novoY = Math.max(0, Math.min(novoY, Math.round(previewRect.height - 10)))

  const campoX = dragPreviewState.bloco.querySelector(".campo-x")
  const campoY = dragPreviewState.bloco.querySelector(".campo-y")

  if (campoX) campoX.value = novoX
  if (campoY) campoY.value = novoY

  dragPreviewState.item.style.left = `${novoX}px`
  dragPreviewState.item.style.top = `${novoY}px`
}

function finalizarDragPreview(event) {
  if (!dragPreviewState) return

  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  if (dragPreviewState.item) {
    dragPreviewState.item.classList.remove("dragging")
  }

  document.removeEventListener("mousemove", moverDragPreview, true)
  document.removeEventListener("mouseup", finalizarDragPreview, true)

  liberarBloqueiosDeDrag()
  dragPreviewState = null
  atualizarPreviewModelo()
}

function bloquearScrollEDragDaPagina() {
  document.body.style.userSelect = "none"
  document.body.style.webkitUserSelect = "none"
  document.body.style.overflow = "hidden"

  window.addEventListener("wheel", impedirEventoGlobal, { passive: false, capture: true })
  window.addEventListener("touchmove", impedirEventoGlobal, { passive: false, capture: true })
}

function liberarBloqueiosDeDrag() {
  document.body.style.userSelect = ""
  document.body.style.webkitUserSelect = ""
  document.body.style.overflow = ""

  window.removeEventListener("wheel", impedirEventoGlobal, true)
  window.removeEventListener("touchmove", impedirEventoGlobal, true)
}

function impedirEventoGlobal(event) {
  if (dragPreviewState) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function vincularEventosCampo(bloco) {
  if (!bloco) return

  bloco.addEventListener("click", (event) => {
    const alvo = event.target
    if (
      alvo.closest("input") ||
      alvo.closest("select") ||
      alvo.closest("textarea") ||
      alvo.closest("button")
    ) {
      return
    }

    const blocos = Array.from(document.querySelectorAll("#camposModeloContainer .field-block"))
    const index = blocos.indexOf(bloco)
    if (index >= 0) selecionarCampoPreview(index, true)
  })

  bloco.querySelectorAll("input, select, textarea").forEach(el => {
    el.addEventListener("input", () => {
      atualizarResumoCampo(bloco)
      atualizarPreviewModelo()
    })

    el.addEventListener("change", () => {
      atualizarResumoCampo(bloco)
      atualizarPreviewModelo()
    })

    el.addEventListener("mousedown", (event) => {
      event.stopPropagation()
    })

    el.addEventListener("click", (event) => {
      event.stopPropagation()
    })
  })
}

function vincularEventosMedico(bloco) {
  if (!bloco) return

  const btnCarimbo = bloco.querySelector(".btn-upload-carimbo")
  const inputCarimbo = bloco.querySelector(".medico-input-carimbo")
  const campoCarimbo = bloco.querySelector(".medico-carimboPng")

  const btnAssinatura = bloco.querySelector(".btn-upload-assinatura")
  const inputAssinatura = bloco.querySelector(".medico-input-assinatura")
  const campoAssinatura = bloco.querySelector(".medico-assinaturaPng")

  if (btnCarimbo && inputCarimbo) {
    btnCarimbo.addEventListener("click", () => inputCarimbo.click())
    inputCarimbo.addEventListener("change", () => uploadCarimboMedico(inputCarimbo, campoCarimbo))
  }

  if (btnAssinatura && inputAssinatura) {
    btnAssinatura.addEventListener("click", () => inputAssinatura.click())
    inputAssinatura.addEventListener("change", () => uploadAssinaturaMedico(inputAssinatura, campoAssinatura))
  }
}

function vincularEventosPreviewMedico(bloco) {
  bloco.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", atualizarPreviewModelo)
    el.addEventListener("change", atualizarPreviewModelo)
  })
}

/* =========================
   HELPERS
========================= */

function formatarData(data) {
  if (!data) return "-"
  const d = new Date(data)
  if (isNaN(d.getTime())) return data
  return d.toLocaleString("pt-BR")
}

function num(valor, fallback) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : fallback
}

function esc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function escAttr(texto) {
  return esc(texto)
}

function escapeAspas(texto) {
  return String(texto || "").replace(/'/g, "\\'")
}

function normalizarPathParaUrl(caminho) {
  if (!caminho) return ""
  return String(caminho)
    .replace(/^\.\//, "/")
    .replace(/\\/g, "/")
}

function obterLarguraPreview() {
  const previewBox = document.getElementById("previewBox")
  if (!previewBox) return 800
  return Math.round(previewBox.clientWidth || 800)
}

function obterAlturaPreview() {
  const previewBox = document.getElementById("previewBox")
  if (!previewBox) return 1000
  return Math.round(previewBox.clientHeight || 1000)
}