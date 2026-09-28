# Regras do projeto

- Interface no estilo Salesforce Lightning: os estilos `sf-*` / `slds-*` ficam em `src/styles.css` e são reutilizados por todas as páginas, para manter o visual consistente.
- Apenas dois objetos existem no CRM: contas (`accounts`) e contatos (`contacts`). Não criar outros objetos sem pedido explícito.
- Todo o texto visível ao usuário é em português do Brasil.
- Listagens usam `SfListView`; criação/edição usa `SfRecordDialog`.
- Camada de dados: Drizzle ORM + Turso (libSQL) em `src/lib/schema.ts` (tabelas) e `src/lib/db.ts` (cliente). O browser **nunca** acessa o banco direto — todo acesso passa pelas server functions de `src/lib/crud.ts`.
- Todo objeto deve registrar um gerador Faker (pt-BR, seed determinística) em `src/lib/generators/` (copiar `_template.ts` e registrar em `index.ts`); o SfRecordDialog mostra o botão "Gerar" automaticamente pela tabela.
