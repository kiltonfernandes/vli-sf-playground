# VLI SF Playground 🚂

CRM de estudos em **português do Brasil** com interface no estilo **Salesforce Lightning**, construído com **TanStack Start** (React 19 + SSR), **Tailwind CSS 4** e componentes **shadcn/Radix UI**, com backend no **Supabase**.

## Objetos

Apenas dois objetos, como manda a regra do playground:

- 🏢 **Contas** (`accounts`)
- 👤 **Contatos** (`contacts`)

## Como rodar

```sh
npm i
npm run dev
```

> Configure as variáveis do Supabase copiando `.env.example` para `.env`.

## Deploy na Vercel

Todo push na `main` dispara deploy automático — o projeto já está configurado
com o plugin **Nitro**, que compila o servidor para o runtime da Vercel.

**Setup único:**

1. Na Vercel: **Add New → Project** e importe este repositório (o framework
   **TanStack Start** é detectado automaticamente).
2. Em **Environment Variables**, adicione (Production e Preview):

| Variável                        | Descrição                                                               |
| ------------------------------- | ----------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | URL do projeto Supabase (embutida no bundle no build)                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável do Supabase (embutida no bundle no build)              |
| `SUPABASE_URL`                  | Mesma URL, usada no SSR/server functions                                |
| `SUPABASE_PUBLISHABLE_KEY`      | Mesma chave, usada no SSR/server functions                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Opcional e sensível** — operações admin server-side; nunca no cliente |

3. Deploy. Pronto: commit → Vercel atualiza em ~1 minuto.

## Funcionalidades

- Listagens com `SfListView`, criação/edição com `SfRecordDialog` (visual SLDS)
- Gerador de dados fake (Faker pt-BR, seed determinística) com botão "Gerar" nos formulários
- Estilos centralizados em `src/styles.css` (classes `sf-*` / `slds-*`)

## Estrutura

| Caminho                      | Descrição                                            |
| ---------------------------- | ---------------------------------------------------- |
| `src/routes/`                | Páginas (file-based routing do TanStack Router)      |
| `src/components/`            | Componentes de UI (shadcn/Radix + componentes `Sf*`) |
| `src/lib/generators/`        | Geradores de dados Faker por objeto                  |
| `src/integrations/supabase/` | Clientes Supabase (browser, server e auth)           |
| `src/styles.css`             | Estilos Salesforce Lightning                         |

## Regras do playground

1. Interface no estilo Salesforce Lightning, reutilizando os estilos `sf-*` / `slds-*`.
2. Apenas contas e contatos — nenhum outro objeto sem pedido explícito.
3. Todo texto visível em pt-BR.
4. Listagens usam `SfListView`; criação/edição usa `SfRecordDialog`.
5. Todo objeto registra um gerador Faker em `src/lib/generators/`.
