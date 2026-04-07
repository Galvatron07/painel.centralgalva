function toggleSubmenu(id) {
  const alvo = document.getElementById(id)
  if (!alvo) return
  alvo.classList.toggle("open")
}

function getUsuarioSidebar() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"))
    if (usuario && typeof usuario === "object") {
      return usuario
    }
    return null
  } catch (error) {
    return null
  }
}

function getUsuarioToken() {
  const usuario = getUsuarioSidebar()

  if (usuario && usuario.token) {
    return String(usuario.token).trim()
  }

  return localStorage.getItem("usuarioToken") || ""
}

function carregarSaldoSidebar() {
  const usuario = getUsuarioSidebar()
  if (!usuario) return

  const saldoEl = document.getElementById("saldoSidebar")
  if (saldoEl) {
    const saldo = Number(usuario.saldo || 0).toFixed(2).replace(".", ",")
    saldoEl.innerText = "R$ " + saldo
  }
}

function limparSessaoUsuario() {
  localStorage.removeItem("usuario")
  localStorage.removeItem("usuarioLogado")
  localStorage.removeItem("usuarioToken")
}

async function logout() {
  try {
    const token = getUsuarioToken()

    if (token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        }
      })
    }
  } catch (error) {
    console.error("Erro ao finalizar sessão:", error)
  }

  limparSessaoUsuario()
  window.location.href = "login.html"
}

window.addEventListener("load", function () {
  carregarSaldoSidebar()
})