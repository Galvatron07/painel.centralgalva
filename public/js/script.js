function mostrarCadastro() {
  document.getElementById("login").style.display = "none"
  document.getElementById("cadastro").style.display = "block"
}

function mostrarLogin() {
  document.getElementById("login").style.display = "block"
  document.getElementById("cadastro").style.display = "none"
}

function limparSessaoUsuario() {
  localStorage.removeItem("usuario")
  localStorage.removeItem("usuarioLogado")
  localStorage.removeItem("usuarioToken")
}

async function tratarRespostaLogin(res) {
  let data = {}

  try {
    data = await res.json()
  } catch (error) {
    data = {}
  }

  if (!res.ok) {
    throw new Error(data.erro || "Não foi possível concluir a requisição")
  }

  return data
}

async function login() {
  let usuario = document.getElementById("emailLogin").value.trim()
  let senha = document.getElementById("senhaLogin").value.trim()

  if (!usuario || !senha) {
    alert("Preencha usuário e senha")
    return
  }

  try {
    let res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        usuario: usuario,
        senha: senha
      })
    })

    let resp = await tratarRespostaLogin(res)
    console.log("[LOGIN PAINEL FRONT]", { status: res.status, resposta: resp })

    if (resp.erro) {
      alert(resp.erro || "Não foi possível fazer login")
      return
    }

    if (!resp.token) {
      alert("O servidor não retornou o token de acesso.")
      return
    }

    const usuarioFinal = {
      usuario: resp.usuario || usuario,
      senha: resp.senha || "",
      saldo: Number(resp.saldo || 0),
      documentos: Number(resp.documentos || 0),
      ativo: resp.ativo !== false,
      recargaTotal: Number(resp.recargaTotal || 0),
      token: resp.token,
      tokenExpiraEm: resp.tokenExpiraEm || ""
    }

    localStorage.setItem("usuario", JSON.stringify(usuarioFinal))
    localStorage.setItem("usuarioLogado", usuarioFinal.usuario)
    localStorage.setItem("usuarioToken", resp.token)

    window.location.href = "dashboard.html"
  } catch (error) {
    console.error("[ERRO LOGIN FRONT]", error)
    limparSessaoUsuario()
    alert(error.message || "Erro ao conectar com o servidor")
  }
}

async function cadastro() {
  let usuario = document.getElementById("emailCadastro").value.trim().toLowerCase()
  let senha = document.getElementById("senhaCadastro").value.trim()

  if (!usuario || !senha) {
    alert("Preencha usuário e senha")
    return
  }

  try {
    let res = await fetch("/api/cadastro", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: usuario,
        senha: senha
      })
    })

    let resp = await tratarRespostaLogin(res)
    console.log("[CADASTRO FRONT]", { status: res.status, resposta: resp })

    if (resp.erro) {
      alert(resp.erro || "Não foi possível criar a conta")
      return
    }

    alert(resp.mensagem || "Conta criada com sucesso. Aguarde a ativação pelo administrador.")

    document.getElementById("emailCadastro").value = ""
    document.getElementById("senhaCadastro").value = ""

    mostrarLogin()
  } catch (error) {
    console.error("[ERRO CADASTRO FRONT]", error)
    alert(error.message || "Erro ao conectar com o servidor")
  }
}