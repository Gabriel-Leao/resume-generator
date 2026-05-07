# 📄 Resume Generator

Gere currículos profissionais em PDF direto pelo navegador.
Interface web local — seus dados ficam salvos no seu computador, nunca vão para nenhum servidor.

---

## Estrutura do projeto

```
resume-generator/
├── fonts/              # fontes .ttf para o PDF (Inter já incluído)
├── output/             # PDFs gerados (criado automaticamente, gitignored)
├── static/
│   ├── style.css       # estilos da interface
│   └── main.js         # lógica do frontend
├── templates/
│   └── index.html      # interface web
├── app.py              # servidor Flask
├── engine.py           # geração do PDF (ReportLab)
├── data.json           # perfis salvos — criado automaticamente, gitignored
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
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

**3. Instale as dependências**

```bash
pip install -r requirements.txt
```

**4. Rode**

```bash
python app.py
```

A porta é escolhida automaticamente a partir da 5000. A escolhida aparece no terminal:

```
✅  Abrindo em http://localhost:5001
```

---

## Como usar

**Perfis**

Cada perfil é uma versão do seu currículo — você pode ter quantos quiser (ex: um por nível de senioridade, um por área). Eles ficam salvos em `data.json` na sua máquina.

1. Clique em **+ Novo perfil** na barra lateral
2. Preencha a identificação, informações pessoais e demais seções
3. Clique em **Salvar** — o botão só fica ativo quando há alterações não salvas
4. Clique em **Gerar PDF**

**Aparência**

Cada perfil tem suas próprias configurações de aparência: fonte, tamanhos, cores e badge de tempo. O badge calcula automaticamente a duração de cada experiência toda vez que você gera — nunca fica desatualizado.

**Seções personalizadas**

No final do editor há um botão para adicionar seções livres (ex: Certificações, Projetos, Voluntariado). Ao criar, você escolhe se quer replicar para todos os CVs. Ao excluir, idem.

**Preview**

Clique em **Preview** no canto superior direito para ver o CV em tempo real enquanto edita. No celular ou tablet, o preview abre em tela cheia pelo botão na barra inferior.

**Download**

No Chrome e Edge, você pode escolher onde salvar o PDF. Na primeira vez, o app pergunta se quer guardar essa pasta como padrão — próximos downloads vão direto para lá. Você pode alterar ou limpar essa configuração em **Configurações**.

---

## Campos obrigatórios

Para salvar ou gerar um PDF, os seguintes campos precisam estar preenchidos:

- Nome do perfil
- Nome completo
- Localização
- Telefone
- E-mail
- Resumo Profissional

---

## Fontes

O projeto já inclui **Inter** na pasta `fonts/` — ela é detectada automaticamente e usada como padrão no PDF.

Para adicionar outras fontes, coloque os arquivos `.ttf` na pasta `fonts/` e reinicie o servidor. Elas aparecerão no seletor de fonte dentro de Aparência. O engine procura automaticamente pelos arquivos `Regular`, `Bold` e `Italic` da família.

Se nenhuma fonte local for encontrada, o fallback é **Liberation Sans**.

---

## Responsivo

A interface funciona em desktop, tablet e celular.

- **Tablet / mobile**: a barra lateral vira um drawer deslizante acessível pelo botão de menu
- **Mobile**: uma barra inferior fixa dá acesso rápido a Perfis, Salvar, Gerar PDF e Preview
- **Preview no mobile**: abre em tela cheia com botão de fechar

---

## Configurações

O ícone de engrenagem no canto superior direito abre as configurações globais:

- **Tema** — claro ou escuro
- **Pasta de download** — define onde os PDFs são salvos (Chrome/Edge)
- **Perguntar sempre onde salvar** — ignora a pasta salva e abre o diálogo a cada geração

---

## Dados privados

`data.json` está no `.gitignore` — seus dados pessoais nunca são commitados. Cada pessoa que clonar o projeto começa com dados vazios.

---

## Dependências

- Python 3.8+
- `flask` — servidor web local
- `reportlab` — geração de PDF

```bash
pip install -r requirements.txt
```
