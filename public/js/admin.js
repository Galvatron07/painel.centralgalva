let graficoRecargasChart = null

function getAdminToken() {
  return localStorage.getItem("adminToken") || ""
}

function getAdminHeaders(extra = {}) {
  const token = getAdminToken()

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...extra
  }
}

async function tratarResposta(res) {
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

async function loginAdmin() {
  let email = document.getElementById("adminEmail").value.trim()
  let senha = document.getElementById("adminSenha").value.trim()

  if (!email || !senha) {
    alert("Preencha email e senha")
    return
  }

  try {
    let res = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, senha })
    })

    let data = await tratarResposta(res)

    if (data.ok && data.token) {
      localStorage.setItem("adminLogado", "true")
      localStorage.setItem("adminToken", data.token)
      localStorage.setItem("adminEmail", data.email || email)
      window.location = "admin-dashboard.html"
    } else {
      alert(data.erro || "Acesso negado")
    }
  } catch (error) {
    if (error.message !== "Sessão expirada") {
      alert(error.message || "Erro ao conectar com o servidor")
      console.error(error)
    }
  }
}

async function logoutAdmin() {
  try {
    const token = getAdminToken()

    if (token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: getAdminHeaders()
      })
    }
  } catch (error) {
    console.error("Erro ao finalizar sessão:", error)
  }

  localStorage.removeItem("adminLogado")
  localStorage.removeItem("adminToken")
  localStorage.removeItem("adminEmail")
  window.location = "admin-loguin.html"
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

async function verUsuarios() {
  if (!verificarAdmin()) return

  let tabela = document.getElementById("tabelaUsuarios")
  if (!tabela) return

  let tbody = tabela.querySelector("tbody")
  if (!tbody) return

  try {
    let res = await fetch("/api/usuarios", {
      headers: getAdminHeaders()
    })

    let usuarios = await tratarResposta(res)

    if (!Array.isArray(usuarios)) {
      throw new Error("Resposta inválida ao carregar usuários")
    }

    tbody.innerHTML = ""

    usuarios.forEach((u) => {
      let linha = document.createElement("tr")

      let statusTexto = u.ativo ? "Ativo" : "Inativo"
      let statusClasse = u.ativo ? "ativo" : "inativo"

      linha.innerHTML = `
        <td>${u.usuario || "-"}</td>
        <td>R$ ${Number(u.saldo || 0).toFixed(2).replace(".", ",")}</td>
        <td>${Number(u.documentos || 0)}</td>
        <td>R$ ${Number(u.recargaTotal || 0).toFixed(2).replace(".", ",")}</td>
        <td><span class="status ${statusClasse}">${statusTexto}</span></td>
        <td>
          <div class="acoes-wrap">
            <button class="btn-success" onclick="addSaldo('${u.usuario}')">+20</button>
            <button class="btn-secondary" onclick="verDocs('${u.usuario}', ${u.documentos || 0})">Docs</button>
            <button class="btn-secondary" onclick="verRecarga('${u.usuario}', ${u.recargaTotal || 0})">Recarga</button>
            <button class="btn-primary" onclick="ativarUsuario('${u.usuario}')">Ativar</button>
            <button class="btn-danger" onclick="bloquearUsuario('${u.usuario}')">Bloquear</button>
            <button class="btn-danger-outline" onclick="excluirUsuario('${u.usuario}')">Excluir</button>
          </div>
        </td>
      `

      tbody.appendChild(linha)
    })
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao carregar usuários")
  }
}

async function addSaldo(usuario) {
  if (!verificarAdmin()) return

  try {
    let res = await fetch("/api/addsaldo", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({
        usuario,
        valor: 20
      })
    })

    let data = await tratarResposta(res)

    if (data.ok) {
      alert("Saldo adicionado com sucesso")
      verUsuarios()
      carregarDashboard()
    } else {
      alert(data.erro || "Erro ao adicionar saldo")
    }
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao conectar com o servidor")
  }
}

function verDocs(usuario, totalDocs) {
  alert("Usuário: " + usuario + "\nDocumentos emitidos: " + (totalDocs || 0))
}

function verRecarga(usuario, totalRecarga) {
  alert(
    "Usuário: " +
      usuario +
      "\nTotal recargas: R$ " +
      Number(totalRecarga || 0).toFixed(2).replace(".", ",")
  )
}

async function bloquearUsuario(usuario) {
  if (!verificarAdmin()) return

  let confirmar = confirm("Deseja bloquear este usuário?")
  if (!confirmar) return

  try {
    let res = await fetch("/api/bloquear", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({ usuario })
    })

    let data = await tratarResposta(res)

    if (data.ok) {
      alert("Usuário bloqueado com sucesso")
      verUsuarios()
      carregarDashboard()
    } else {
      alert(data.erro || "Erro ao bloquear usuário")
    }
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao conectar com o servidor")
  }
}

async function ativarUsuario(usuario) {
  if (!verificarAdmin()) return

  let confirmar = confirm("Deseja ativar este usuário?")
  if (!confirmar) return

  try {
    let res = await fetch("/api/ativar", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({ usuario })
    })

    let data = await tratarResposta(res)

    if (data.ok) {
      alert("Usuário ativado com sucesso")
      verUsuarios()
      carregarDashboard()
    } else {
      alert(data.erro || "Erro ao ativar usuário")
    }
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao conectar com o servidor")
  }
}

async function excluirUsuario(usuario) {
  if (!verificarAdmin()) return

  let confirmar = confirm("Deseja excluir este usuário? Essa ação não poderá ser desfeita.")
  if (!confirmar) return

  try {
    let res = await fetch("/api/excluir-usuario", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({ usuario })
    })

    let data = await tratarResposta(res)

    if (data.ok) {
      alert("Usuário excluído com sucesso")
      verUsuarios()
      carregarDashboard()
    } else {
      alert(data.erro || "Erro ao excluir usuário")
    }
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao conectar com o servidor")
  }
}

async function criarUsuario() {
  if (!verificarAdmin()) return

  let email = document.getElementById("novoEmail").value.trim()
  let senha = document.getElementById("novaSenha").value.trim()
  let saldo = document.getElementById("novoSaldo").value.trim() || 0

  if (!email || !senha) {
    alert("Preencha email e senha")
    return
  }

  try {
    let resUsuarios = await fetch("/api/usuarios", {
      headers: getAdminHeaders()
    })

    let usuarios = await tratarResposta(resUsuarios)

    if (!Array.isArray(usuarios)) {
      throw new Error("Resposta inválida ao carregar usuários")
    }

    let existe = usuarios.find(u => (u.usuario || "").toLowerCase() === email.toLowerCase())
    if (existe) {
      alert("Esse usuário já existe")
      return
    }

    usuarios.push({
      usuario: email,
      senha: senha,
      saldo: Number(saldo),
      documentos: 0,
      recargaTotal: 0,
      ativo: true
    })

    let resSalvar = await fetch("/api/salvar-usuarios", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({ usuarios })
    })

    let dataSalvar = await tratarResposta(resSalvar)

    if (dataSalvar.ok) {
      alert("Usuário criado com sucesso")
      document.getElementById("novoEmail").value = ""
      document.getElementById("novaSenha").value = ""
      document.getElementById("novoSaldo").value = ""
      verUsuarios()
      carregarDashboard()
    } else {
      alert(dataSalvar.erro || "Erro ao criar usuário")
    }
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao conectar com o servidor")
  }
}

async function carregarDashboard() {
  if (!verificarAdmin()) return

  try {
    let res = await fetch("/api/usuarios", {
      headers: getAdminHeaders()
    })

    let usuarios = await tratarResposta(res)

    if (!Array.isArray(usuarios)) {
      throw new Error("Resposta inválida ao carregar dashboard")
    }

    let totalDocs = 0
    let ativos = 0
    let inativos = 0
    let recargas = 0

    usuarios.forEach(u => {
      totalDocs += Number(u.documentos || 0)

      if (u.ativo) {
        ativos++
      } else {
        inativos++
      }

      recargas += Number(u.recargaTotal || 0)
    })

    let elTotalDocs = document.getElementById("totalDocs")
    let elAtivos = document.getElementById("usuariosAtivos")
    let elInativos = document.getElementById("usuariosInativos")
    let elRecargas = document.getElementById("recargas30")

    if (elTotalDocs) elTotalDocs.innerText = totalDocs
    if (elAtivos) elAtivos.innerText = ativos
    if (elInativos) elInativos.innerText = inativos
    if (elRecargas) elRecargas.innerText = "R$ " + recargas.toFixed(2).replace(".", ",")

    mostrarTopUsuarios([...usuarios])
    renderizarGraficoRecargas(usuarios)
  } catch (error) {
    console.error(error)
    alert(error.message || "Erro ao carregar dashboard")
  }
}

function mostrarTopUsuarios(usuarios) {
  usuarios.sort((a, b) => Number(b.documentos || 0) - Number(a.documentos || 0))

  let top = usuarios.slice(0, 3)
  let lista = document.getElementById("topUsuarios")

  if (!lista) return

  lista.innerHTML = ""

  top.forEach(u => {
    let li = document.createElement("li")
    li.innerText = (u.usuario || "-") + " - " + Number(u.documentos || 0) + " documentos"
    lista.appendChild(li)
  })
}

function renderizarGraficoRecargas(usuarios) {
  const canvas = document.getElementById("graficoRecargas")
  if (!canvas || typeof Chart === "undefined") return

  const labels = usuarios.map(u => u.usuario || "-")
  const valores = usuarios.map(u => Number(u.recargaTotal || 0))

  const ctx = canvas.getContext("2d")

  if (graficoRecargasChart) {
    graficoRecargasChart.destroy()
  }

  graficoRecargasChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Recargas (R$)",
          data: valores,
          backgroundColor: "rgba(56, 189, 248, 0.75)",
          borderColor: "rgba(56, 189, 248, 1)",
          borderWidth: 1.5,
          borderRadius: 10,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#e5eefc"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#cbd5e1"
          },
          grid: {
            color: "rgba(255,255,255,0.05)"
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#cbd5e1",
            callback: function(value) {
              return "R$ " + value
            }
          },
          grid: {
            color: "rgba(255,255,255,0.05)"
          }
        }
      }
    }
  })
}