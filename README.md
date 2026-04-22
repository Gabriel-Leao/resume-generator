# 📄 Resume Generator

Gere currículos profissionais em PDF direto pelo navegador.  
Interface web local — seus dados ficam salvos no seu computador, nunca vão para nenhum servidor.

---

## Estrutura do projeto

```
resume-generator/
├── fonts/              # coloque os .ttf aqui (ver Fonte customizada)
├── output/             # PDFs gerados (criado automaticamente, gitignored)
├── templates/
│   └── index.html      # interface web
├── app.py              # servidor Flask
├── engine.py           # geração do PDF (ReportLab)
├── data.json           # seus dados salvos — criado automaticamente, gitignored
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Setup

**1. Clone o repositório**
```bash
git clone https://github.com/seu-usuario/resume-generator
cd resume-generator
```

**2. Crie e ative o ambiente virtual**
```bash
# Criar
python -m venv .venv

# Ativar — macOS / Linux
source .venv/bin/activate

# Ativar — Windows
.venv\Scripts\activate
```

> O `.venv` é o equivalente do `node_modules` — isola as dependências por projeto.  
> Está no `.gitignore`, então cada pessoa cria o seu após clonar.

**3. Instale as dependências**
```bash
pip install -r requirements.txt
```

**4. Rode**
```bash
python app.py
```

A porta é escolhida automaticamente a partir da 5000. Se já estiver em uso, tenta 5001, 5002, e assim por diante. A porta escolhida aparece no terminal:

```
✅  Abrindo em http://localhost:5001
```

**5. Abra no navegador**

Use o endereço exibido no terminal. No macOS, prefira `http://127.0.0.1:PORTA` caso `localhost` não funcione.

---

## Como usar

1. Clique em **+ Novo perfil** na barra lateral
2. Preencha o **Nome do perfil** (como vai aparecer na sidebar, ex: "Gabriel — Pleno") e as informações pessoais
3. Clique em **Salvar** — os dados ficam em `data.json` na sua máquina
4. Ative ou desative o **badge de tempo** conforme preferir
5. Clique em **Gerar PDF** — o download começa automaticamente

Você pode ter quantos perfis quiser (ex: um por nível de senioridade).  
O badge de duração é calculado automaticamente toda vez que você gera — nunca fica desatualizado.

---

## Campos obrigatórios

Os seguintes campos precisam ser preenchidos para salvar ou gerar um PDF:

- Nome do perfil
- Nome completo
- Localização
- Telefone
- E-mail
- Resumo Profissional

---

## Fonte customizada (Inter recomendado)

O padrão é **Liberation Sans** — sans-serif limpa, sem instalação necessária.

Para usar Inter:

1. Baixe em [rsms.me/inter](https://rsms.me/inter/)
2. Coloque estes 3 arquivos na pasta `fonts/`:
   - `Inter-Regular.ttf`
   - `Inter-Bold.ttf`
   - `Inter-Italic.ttf`
3. Reinicie o servidor — detectado automaticamente.

---

## Dados privados

`data.json` está no `.gitignore` — seus dados pessoais (telefone, e-mail, etc.) **nunca são commitados**.  
Cada pessoa que clonar o projeto começa com dados vazios e preenche os seus.

---

## Dependências

- Python 3.8+
- `flask` — servidor web local
- `reportlab` — geração de PDF

```bash
pip install -r requirements.txt
```
