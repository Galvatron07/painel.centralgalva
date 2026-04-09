function toggleSubmenu(id, botao) {
  const alvo = document.getElementById(id)
  if (!alvo) return

  const estavaAberto = alvo.classList.contains("open")
  alvo.classList.toggle("open")

  if (botao) {
    const seta = botao.querySelector(".nav-arrow")
    if (seta) {
      seta.style.transform = estavaAberto ? "rotate(0deg)" : "rotate(90deg)"
    }
  }
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

function formatarSaldoSidebar(valor) {
  return "R$ " + Number(valor || 0).toFixed(2).replace(".", ",")
}

function carregarSaldoSidebar() {
  const usuario = getUsuarioSidebar()
  if (!usuario) return

  const saldoEl = document.getElementById("saldoSidebar")
  if (saldoEl) {
    saldoEl.innerText = formatarSaldoSidebar(usuario.saldo || 0)
  }
}

function limparSessaoUsuario() {
  localStorage.removeItem("usuario")
  localStorage.removeItem("usuarioLogado")
  localStorage.removeItem("usuarioToken")
}

function abrirSidebarMobile() {
  const sidebar = document.getElementById("sidebar")
  const overlay = document.getElementById("sidebarOverlay")

  if (sidebar) {
    sidebar.classList.add("show")
  }

  if (overlay) {
    overlay.classList.add("show")
  }

  document.body.classList.add("sidebar-open")
}

function fecharSidebarMobile() {
  const sidebar = document.getElementById("sidebar")
  const overlay = document.getElementById("sidebarOverlay")

  if (sidebar) {
    sidebar.classList.remove("show")
  }

  if (overlay) {
    overlay.classList.remove("show")
  }

  document.body.classList.remove("sidebar-open")
}

function alternarSidebarMobile() {
  const sidebar = document.getElementById("sidebar")
  if (!sidebar) return

  if (sidebar.classList.contains("show")) {
    fecharSidebarMobile()
  } else {
    abrirSidebarMobile()
  }
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

window.addEventListener("resize", function () {
  if (window.innerWidth > 900) {
    fecharSidebarMobile()
  }
})

window.addEventListener("load", function () {
  carregarSaldoSidebar()

  const linksSidebar = document.querySelectorAll(".sidebar a")
  linksSidebar.forEach(function (link) {
    link.addEventListener("click", function () {
      if (window.innerWidth <= 900) {
        fecharSidebarMobile()
      }
    })
  })
})