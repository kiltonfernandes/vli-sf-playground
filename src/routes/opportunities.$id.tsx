import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getOpportunityFull,
  listAccountOptions,
  listOpportunityQuotes,
  saveRecord,
  sendOpportunityToNetlex,
  createAddendumOpportunity,
  deleteRecord,
  deleteRecordsBulk,
  updateOpportunityTakeOrPay,
  createPostContractFromContract,
  sendSalesOrderToClient,
  registerAdjustmentCurve,
} from "@/lib/crud";
import { PostContractFormalization, PostContractHub } from "@/components/PostContract";
import {
  ADJUSTMENT_CURVE,
  CURVE_STATUS,
  SALES_ORDER,
  SALES_ORDER_STATUS,
  isPostContractInstrument,
  recordTypeFor,
} from "@/lib/post-contract";
import { SfShell } from "@/components/SfShell";
import { SfDeleteButton, SfRecordDialog, type FieldDef } from "@/components/SfRecordDialog";
import { SfBulkRecordDialog } from "@/components/SfBulkRecordDialog";
import { SfListView, type Column } from "@/components/SfListView";
import { fmtDate, fmtMoney } from "@/lib/format";
import { BusinessRulesChecklist, type BusinessRule } from "@/components/BusinessRulesChecklist";
import { parseTakeOrPayConfig, type TakeOrPayConfig } from "@/lib/take-or-pay";
import {
  MODAL_POLICIES,
  OPPORTUNITY_SEGMENTS,
  PORT,
  RAIL,
  isQuoteSegment,
  modalReadjustmentError,
  segmentHasModal,
  segmentModals,
} from "@/lib/segments";

const INSTRUMENTS = ["Contrato", "ACS", "Aditivo", SALES_ORDER, ADJUSTMENT_CURVE, "Outros Serviços"];
const STAGES = ["Prospecção", "Negociação", "Aprovação", "Formalização", "Fechado"];
const SEGMENTS = OPPORTUNITY_SEGMENTS;
const quoteFieldsFor = (instrument: string): FieldDef[] => [
  { name: "name", label: "Nome da Cotação", required: true },
  {
    name: "record_type",
    label: "Tipo de Cotação",
    type: "select",
    options: [recordTypeFor(instrument)],
    required: true,
  },
  { name: "seed", label: "Seed", type: "number", required: true },
];

export const Route = createFileRoute("/opportunities/$id")({
  head: () => ({
    meta: [
      { title: "Oportunidade | CRM" },
      { name: "description", content: "Detalhes da oportunidade." },
    ],
  }),
  component: OpportunityRecordPage,
});

function OpportunityRecordPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creatingAddendum, setCreatingAddendum] = useState(false);
  const [creatingKind, setCreatingKind] = useState("");
  const [postBusy, setPostBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("quotes");
  const [bulkQuoteRows, setBulkQuoteRows] = useState<any[] | null>(null);
  const [editingQuote, setEditingQuote] = useState(false);
  const [quoteToEdit, setQuoteToEdit] = useState<any | null>(null);
  const [pathOpen, setPathOpen] = useState(true);
  const [pathBusy, setPathBusy] = useState(false);
  const [pathMessage, setPathMessage] = useState("");
  const [netlexBusy, setNetlexBusy] = useState(false);
  const [netlexModalOpen, setNetlexModalOpen] = useState(false);
  const [sentContract, setSentContract] = useState<any | null>(null);
  const [netlexError, setNetlexError] = useState("");
  const [topDraft, setTopDraft] = useState<TakeOrPayConfig | null>(null);
  const [topBusy, setTopBusy] = useState(false);
  const [topError, setTopError] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["opportunity-full", id],
    queryFn: () => getOpportunityFull({ data: { id } }),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-min"],
    queryFn: async () => (await listAccountOptions()) as { id: string; name: string }[],
  });
  const accountIdByName = useMemo(
    () => new Map(accounts.map((account) => [account.name, account.id])),
    [accounts],
  );
  const { data: quoteRows = [], refetch: refetchQuotes } = useQuery({
    queryKey: ["opportunity-quotes", id],
    queryFn: async () => (await listOpportunityQuotes({ data: { opportunityId: id } })) as any[],
    enabled: !!id,
  });

  if (isLoading)
    return (
      <SfShell>
        <div style={{ padding: 32 }}>Carregando oportunidade…</div>
      </SfShell>
    );
  if (!data?.opportunity)
    return (
      <SfShell>
        <div style={{ padding: 32 }}>
          Oportunidade não encontrada.{" "}
          <Link to="/opportunities" style={{ color: "#0176d3" }}>
            Voltar
          </Link>
        </div>
      </SfShell>
    );

  const opportunity = data.opportunity;
  const account = data.account;
  const savedTop = parseTakeOrPayConfig(opportunity.take_or_pay_config);
  const inheritedTop = opportunity.instrument_type === "Aditivo" && data.baseContract
    ? (data.netlexContract?.document?.takeOrPay?.config ?? null) as TakeOrPayConfig | null
    : null;
  const topConfig = topDraft ?? savedTop ?? inheritedTop ?? {
    auditDate: "", billingDate: "", compensationMode: "individual" as const,
    calculationBasis: "volume" as const, pairs: [], groups: [],
  };
  const hasTopTolerance = !!data.takeOrPayState?.hasTolerances || !!inheritedTop;
  const hasSyncedQuote = quoteRows.some(
    (quote) => !!quote.is_synced && quote.status === "Sincronizada",
  );
  const syncedQuote = quoteRows.find(
    (quote) => !!quote.is_synced && quote.status === "Sincronizada",
  );
  const priceApproved =
    !!syncedQuote && ["Ok", "Aprovada"].includes(String(syncedQuote.price_status));
  const netlexContract = data.netlexContract ?? sentContract;
  const baseContract = data.baseContract;
  const addenda = (data.addenda ?? []) as any[];
  const isAddendum = opportunity.instrument_type === "Aditivo";
  const isPostContract = isPostContractInstrument(opportunity.instrument_type);
  const isSalesOrder = opportunity.instrument_type === SALES_ORDER;
  const postDocument = (data.postContractDocument ?? null) as any | null;
  const postStatus = String(postDocument?.status ?? "");
  const postFormalized = isSalesOrder
    ? postStatus === SALES_ORDER_STATUS.approved
    : postStatus === CURVE_STATUS.registered;
  const derived = isAddendum || isPostContract;
  const netlexInstrument = ["Contrato", "ACS", "Aditivo"].includes(opportunity.instrument_type);
  const netlexSigned = netlexContract?.status === "Assinatura";
  const inFormalization = ["Formalização", "Fechado"].includes(opportunity.stage);
  const baseContractSigned = !derived || baseContract?.status === "Assinatura";
  const canSendContract =
    opportunity.stage === "Formalização" &&
    netlexInstrument &&
    baseContractSigned &&
    !netlexContract &&
    priceApproved &&
    isOpportunityTermValid(opportunity) &&
    !!opportunity.contracting_parties?.trim() &&
    !!opportunity.vli_entity?.trim();
  const opportunityRules: BusinessRule[] = [
    {
      label: "Conta de gestão vinculada",
      passed: !!account,
      detail: account?.name ?? "Vincule uma Conta de gestão à Oportunidade.",
      explanation:
        "A Conta de gestão identifica o cliente responsável pela negociação. Os Itens da Cotação precisam usar Fluxos Planejados pertencentes a essa mesma Conta; isso evita misturar operações de clientes diferentes.",
    },
    {
      label: "Instrumento aceito para Cotação",
      passed: ["Contrato", "ACS"].includes(opportunity.instrument_type) || (derived && !!baseContract),
      detail: ["Contrato", "ACS"].includes(opportunity.instrument_type)
        ? opportunity.instrument_type
        : derived
          ? baseContract
            ? `${opportunity.instrument_type} do contrato Nº ${baseContract.netlex_number}`
            : `Crie ${isAddendum ? "o aditivo" : `a ${String(opportunity.instrument_type).toLowerCase()}`} a partir de um Contrato em Assinatura.`
          : "O fluxo atual aceita Contrato, ACS, Aditivo, Ordem de Vendas ou Curva de Ajuste.",
      explanation:
        "Neste escopo ferroviário, a Cotação atende Contrato, ACS, Aditivo, Ordem de Vendas e Curva de Ajuste. Os três últimos nunca nascem soltos: são criados no hub Pós-contrato de um Contrato em Assinatura (ACS não gera nenhum deles). Só o Aditivo altera o contrato; ordem de vendas e curva reutilizam as condições vigentes.",
    },
    ...(isPostContract
      ? [
          {
            label: "Contrato-base em Assinatura",
            passed: baseContract?.status === "Assinatura",
            detail: baseContract
              ? `Nº ${baseContract.netlex_number} · ${baseContract.status}`
              : "Sem contrato-base vinculado.",
            explanation: isSalesOrder
              ? "A ordem de vendas é uma venda pontual sobre um contrato vigente: herda vigência, tarifa (CBS ou líquida), reajuste e Take or Pay. Ela não altera os itens do contrato; mudança permanente continua sendo Aditivo."
              : "A curva de ajuste redistribui volumes já previstos entre meses da vigência (ex.: quebra de safra). Os preços e os itens do contrato não mudam e o total de cada fluxo precisa se manter.",
          },
        ]
      : []),
    ...(isAddendum
      ? [
          {
            label: "Contrato original em Assinatura",
            passed: baseContract?.status === "Assinatura",
            detail: baseContract
              ? `Nº ${baseContract.netlex_number} · ${baseContract.status}`
              : "Sem contrato original vinculado.",
            explanation:
              "O aditivo modifica um contrato que já existe; o contrato original continua valendo. Ele precisa estar em Assinatura no NetLex. Quando o aditivo chegar em Assinatura, as mudanças são aplicadas no contrato original e a versão anterior fica guardada no histórico.",
          },
        ]
      : []),
    {
      label: "Segmento atendido pela Cotação",
      passed: isQuoteSegment(opportunity.segment),
      detail: opportunity.segment ?? "Selecione Ferroviário, Portuário ou Ferroviário + Portuário.",
      explanation:
        "A jornada de Item e Agenda atende Ferroviário (ANTT), Portuário (ANTAQ) e Ferroviário + Portuário, com regras por modal: o ferro exige FRETE e Base Diesel; o porto usa serviços de terminal, não tem produto obrigatório e não aceita Base Diesel. Rodoviário ainda não está disponível.",
    },
    {
      label: "Vigência preenchida e válida",
      passed: isOpportunityTermValid(opportunity),
      detail: isOpportunityTermValid(opportunity)
        ? `${fmtDate(opportunity.contract_start)} a ${fmtDate(opportunity.contract_end)}`
        : opportunity.instrument_type === "ACS"
          ? "Preencha as datas e mantenha a vigência abaixo de 12 meses."
          : "Preencha início e fim da vigência em ordem válida.",
      explanation:
        "A data inicial e a final definem o intervalo em que as Agendas podem ocorrer. Para Contrato, informe uma vigência válida com início antes ou no fim. Para ACS, a duração deve ser inferior a 12 meses. As Agendas da Cotação precisam ficar dentro desse intervalo.",
    },
    ...(segmentHasModal(opportunity.segment, RAIL) || !isQuoteSegment(opportunity.segment)
      ? [
          {
            label: "Dia de aplicação do diesel definido",
            passed: [1, 10, 20].includes(Number(opportunity.application_day)),
            detail: `Dia atual: ${opportunity.application_day ?? "não definido"}`,
            explanation:
              "Somente ferro. O dia de aplicação aceito é 1, 10 ou 20. Ele determina o dia efetivo da Data Base Diesel nas Agendas ferroviárias; ao montar a data, o Playground usa este valor da Oportunidade em vez do dia digitado. O porto não usa Base Diesel.",
          },
        ]
      : []),
    ...(segmentHasModal(opportunity.segment, RAIL) || !isQuoteSegment(opportunity.segment)
      ? [
          {
            label: "Reajuste anual ferroviário configurado",
            passed: !isTermOver365Days(opportunity) || !modalReadjustmentError(RAIL, opportunity),
            detail: !isTermOver365Days(opportunity)
              ? "Percentuais anuais não exigidos para esta vigência."
              : `Diesel ${Number(opportunity.diesel_pct).toFixed(2)}% + IGP-M ${Number(opportunity.igpm_pct).toFixed(2)}% + IPCA ${Number(opportunity.ipca_pct).toFixed(2)}%; primeiro reajuste ${opportunity.first_readjustment_date || "pendente"}.`,
            explanation:
              "Em contratos com vigência superior a 365 dias, os percentuais de Diesel, IGP-M e IPCA do ferro precisam somar exatamente 100%, e a data do primeiro reajuste deve estar preenchida dentro da vigência. Esses dados são configurados aqui e conferidos novamente no screenflow da Cotação.",
          },
        ]
      : []),
    ...(segmentHasModal(opportunity.segment, PORT)
      ? [
          {
            label: "Reajuste anual portuário configurado",
            passed: !isTermOver365Days(opportunity) || !modalReadjustmentError(PORT, opportunity),
            detail: !isTermOver365Days(opportunity)
              ? "Percentuais anuais não exigidos para esta vigência."
              : `IGP-M ${Number(opportunity.port_igpm_pct ?? 0).toFixed(2)}% + IPCA ${Number(opportunity.port_ipca_pct ?? 0).toFixed(2)}% (sem diesel); primeiro reajuste ${opportunity.first_readjustment_date || "pendente"}.`,
            explanation:
              "O porto tem configuração de reajuste própria (IGP-M/IPCA_Harbor no Salesforce) e não usa diesel. Acima de 365 dias, IGP-M + IPCA do porto precisam somar 100%. O padrão do Playground é IGP-M 100%, valor citado no KT e ainda não confirmado. Pela regulação da ANTAQ, o reajuste de preços do terminal é informado ao cliente com 30 dias de antecedência.",
          },
        ]
      : []),
    {
      label: "Oportunidade em Negociação",
      passed: STAGES.indexOf(opportunity.stage) >= STAGES.indexOf("Negociação"),
      detail:
        STAGES.indexOf(opportunity.stage) >= STAGES.indexOf("Negociação")
          ? `Etapa atual: ${opportunity.stage}`
          : "Avance a Oportunidade para criar a Cotação.",
      explanation:
        "A Cotação só pode ser preparada quando a Oportunidade estiver em Negociação ou em uma etapa posterior permitida. Avance a etapa da Oportunidade para habilitar a criação de Itens e Agendas.",
    },
    {
      label: "Cotação concluída e sincronizada",
      passed: hasSyncedQuote,
      detail: hasSyncedQuote
        ? "A Oportunidade pode avançar para Aprovação."
        : "Conclua e sincronize uma Cotação para liberar Aprovação.",
      explanation:
        "Para liberar o avanço de Negociação para Aprovação, pelo menos uma Cotação precisa passar pela validação, ser concluída e sincronizada com esta Oportunidade. A sincronização atualiza o estado que o Path usa para permitir a próxima etapa.",
    },
    {
      label: "Preço aprovado para formalização",
      passed: priceApproved,
      detail: !syncedQuote
        ? "Sincronize uma Cotação."
        : priceApproved
          ? syncedQuote.price_status === "Aprovada"
            ? "Aprovação registrada."
            : "Sem aprovação adicional necessária."
          : "A Cotação ainda tem validação ou aprovação pendente.",
      explanation:
        "Uma Cotação sem alçada (Ok) ou aprovada pelo Perfil Aprovador pode avançar para Formalização. A aprovação concede a exceção de preço e não deve ser bloqueada pela validação do preço de mercado.",
    },
    ...(opportunity.instrument_type === "Contrato" ? [{
      label: "Take or Pay compatível com as Agendas",
      passed: !hasTopTolerance || !!savedTop || !!inheritedTop,
      detail: hasTopTolerance ? (savedTop || inheritedTop ? "Configuração salva com as tolerâncias da Cotação." : "Configure Take or Pay antes de avançar.") : "Sem tolerâncias de Take or Pay nas Agendas.",
      explanation: "Qualquer tolerância positiva em volume ou tarifa nas Agendas exige configuração de Take or Pay. O Contrato registra datas, regra de compensação e fluxos; a apuração financeira ocorre fora deste app. Ferro e porto viram registros separados (ex.: 15 fluxos ferro + 1 porto = 2 registros): pares e grupos não podem misturar modais.",
    }] : []),
    {
      label: "Partes contratuais preenchidas",
      passed: !!opportunity.contracting_parties?.trim() && !!opportunity.vli_entity?.trim(),
      detail:
        opportunity.contracting_parties?.trim() && opportunity.vli_entity?.trim()
          ? "Contratante e entidade VLI informadas."
          : "Informe Contratante(s) e Entidade contratada VLI nos Detalhes.",
      explanation:
        "A minuta deve identificar a parte cliente que contrata e a empresa VLI prestadora. O devedor solidário é opcional.",
    },
    ...(inFormalization && isPostContract
      ? isSalesOrder
        ? [
            {
              label: "Ordem enviada ao contato aprovador",
              passed: !!postDocument,
              detail: postDocument
                ? `Nº ${postDocument.netlex_number} · ${postDocument.document?.contact?.name ?? "contato"}`
                : "Escolha o contato aprovador e use “Enviar ordem ao cliente”.",
              explanation:
                "Na Formalização a ordem de vendas vira um contrato simplificado com referência ao contrato-base. O contato aprovador (com e-mail) recebe a proposta e tem 7 dias para aprovar no portal do cliente.",
            },
            {
              label: "Aprovada pelo cliente no portal",
              passed: postStatus === SALES_ORDER_STATUS.approved,
              detail: postDocument ? postStatus : "Disponível depois do envio.",
              explanation:
                "O cliente aprova em Gestão de Contratos → Ordem de vendas no portal (Experience Cloud, simulado aqui). Se a semana passar sem aprovação, a proposta expira e precisa ser reenviada.",
            },
          ]
        : [
            {
              label: "Curva registrada",
              passed: postStatus === CURVE_STATUS.registered,
              detail: postDocument ? `Nº ${postDocument.netlex_number} · ${postStatus}` : "Use “Registrar curva”.",
              explanation:
                "A curva não passa pelo NetLex: é um registro operacional vinculado ao contrato. Depois de registrada, a Oportunidade pode ser fechada.",
            },
          ]
      : []),
    ...(inFormalization && !isPostContract
      ? [
          {
            label: "Formalizar no NetLex",
            passed: !!netlexContract,
            detail: netlexContract
              ? `Documento Nº ${netlexContract.netlex_number} enviado.`
              : "Use “Enviar ao NetLex” no topo desta página.",
            explanation:
              "Na Formalização, Contrato, ACS e Aditivo passam pelo NetLex. O envio gera o número do documento com o status inicial “Análise jurídica”. No aditivo, o NetLex recebe somente as mudanças (RAT), não o contrato inteiro.",
          },
          {
            label: "Status Assinatura no NetLex",
            passed: netlexSigned,
            detail: netlexSigned
              ? "Documento em Assinatura. A Oportunidade pode ser fechada."
              : netlexContract
                ? `Status atual: ${netlexContract.status}. Abra o documento no NetLex e mude para Assinatura.`
                : "Disponível depois do envio ao NetLex.",
            explanation:
              "O fechamento da Oportunidade depende do retorno do NetLex. Abra o documento e use “Mover para Assinatura” (simula o analista do NetLex). Só então o Path libera Formalização → Fechado.",
          },
        ]
      : []),
  ];
  const fields: FieldDef[] = [
    { name: "name", label: "Nome da oportunidade", required: true },
    {
      name: "account_name",
      label: "Conta de gestão",
      type: "select",
      options: accounts.map((entry) => entry.name),
      required: true,
    },
    {
      name: "instrument_type",
      label: "Tipo de instrumento",
      type: "select",
      options: isPostContract ? INSTRUMENTS : INSTRUMENTS.filter((entry) => !isPostContractInstrument(entry)),
      required: true,
    },
    { name: "stage", label: "Estágio", type: "select", options: STAGES, required: true },
    { name: "segment", label: "Segmento", type: "select", options: SEGMENTS },
    { name: "amount", label: "Valor da oportunidade", type: "number" },
    { name: "close_date", label: "Data de fechamento", type: "date" },
    { name: "contract_start", label: "Início da vigência", type: "date" },
    { name: "contract_end", label: "Fim da vigência", type: "date" },
    { name: "first_readjustment_date", label: "Data do primeiro reajuste", type: "date" },
    {
      name: "application_day",
      label: "Dia de aplicação",
      type: "select",
      options: ["1", "10", "20"],
      required: true,
    },
    { name: "diesel_pct", label: "Reajuste diesel (%)", type: "number" },
    { name: "igpm_pct", label: "Reajuste IGP-M (%)", type: "number" },
    { name: "ipca_pct", label: "Reajuste IPCA (%)", type: "number" },
    { name: "port_igpm_pct", label: "Reajuste portuário IGP-M (%)", type: "number" },
    { name: "port_ipca_pct", label: "Reajuste portuário IPCA (%)", type: "number" },
    { name: "contracting_parties", label: "Contratante(s)" },
    { name: "vli_entity", label: "Entidade contratada VLI" },
    { name: "joint_debtor", label: "Devedor solidário" },
    {
      name: "integration_tariff",
      label: "Tarifa padrão para novas Cotações",
      type: "select",
      options: ["CBS", "Líquida"],
    },
  ];
  const defaults = {
    name: opportunity.name ?? "",
    account_name: account?.name ?? "",
    instrument_type: opportunity.instrument_type ?? "Contrato",
    stage: opportunity.stage ?? "Prospecção",
    segment: opportunity.segment ?? "",
    amount: opportunity.amount ?? 0,
    close_date: opportunity.close_date ?? "",
    contract_start: opportunity.contract_start ?? "",
    contract_end: opportunity.contract_end ?? "",
    first_readjustment_date: opportunity.first_readjustment_date ?? "",
    application_day: String(opportunity.application_day ?? 10),
    diesel_pct: opportunity.diesel_pct ?? 0,
    igpm_pct: opportunity.igpm_pct ?? 0,
    ipca_pct: opportunity.ipca_pct ?? 0,
    port_igpm_pct: opportunity.port_igpm_pct ?? 100,
    port_ipca_pct: opportunity.port_ipca_pct ?? 0,
    contracting_parties: opportunity.contracting_parties ?? "",
    vli_entity: opportunity.vli_entity ?? "",
    joint_debtor: opportunity.joint_debtor ?? "",
    integration_tariff: opportunity.integration_tariff ?? "Líquida",
  };
  const transform = (form: Record<string, any>) => {
    const { account_name, take_or_pay: _legacyTop, take_or_pay_config: _topConfig, ...rest } = form;
    return {
      ...rest,
      application_day: Number(rest.application_day ?? 10),
      account_id: accountIdByName.get(account_name),
    };
  };

  const quoteDefinitions =
    isQuoteSegment(opportunity.segment) &&
    (["Contrato", "ACS"].includes(opportunity.instrument_type) || (derived && !!baseContract))
      ? [
          {
            key: "quotes",
            label: "Cotações",
            table: "quotes",
            load: async (parentId: string) =>
              (await listOpportunityQuotes({ data: { opportunityId: parentId } })) as any[],
            columns: [
              {
                key: "quote",
                label: "Número",
                render: (row: any) => (
                  <Link
                    to="/quotes/$id"
                    params={{ id: row.id }}
                    style={{ color: "#0176d3", fontWeight: 600 }}
                  >
                    {row.quote_number}
                  </Link>
                ),
                sortValue: (row: any) => row.quote_number ?? "",
              },
              {
                key: "name",
                label: "Nome",
                render: (row: any) => (
                  <Link to="/quotes/$id" params={{ id: row.id }} style={{ color: "#0176d3" }}>
                    {row.name}
                  </Link>
                ),
                sortValue: (row: any) => row.name,
              },
              {
                key: "status",
                label: "Status",
                render: (row: any) => (row.is_synced ? "Sincronizada" : row.status),
                sortValue: (row: any) => row.status,
              },
              {
                key: "seed",
                label: "Seed",
                render: (row: any) => String(row.seed),
                sortValue: (row: any) => Number(row.seed),
              },
            ],
            fields: [
              { name: "name", label: "Nome da Cotação", required: true },
              {
                name: "record_type",
                label: "Tipo de Cotação",
                type: "select" as const,
                options: [recordTypeFor(opportunity.instrument_type)],
                required: true,
              },
              { name: "seed", label: "Seed", type: "number" as const },
            ],
            createDefaults: () => ({
              name: `${opportunity.name} · ${opportunity.segment}`,
              record_type: recordTypeFor(opportunity.instrument_type),
              status: "Rascunho",
              is_synced: 0,
              seed: 20260929,
            }),
            rowDefaults: (row: any) => ({
              name: row.name,
              record_type: row.record_type,
              seed: row.seed,
            }),
            transform: (form: Record<string, any>, parentId: string) => ({
              ...form,
              opportunity_id: parentId,
              status: "Rascunho",
              is_synced: 0,
              seed: Number(form.seed || 20260929),
            }),
            refreshKeys: (parentId: string) => [["quotes"], ["opportunity-full", parentId]],
            defaultVisible: true,
          },
        ]
      : [];
  const quoteColumns: Column<any>[] = [
    {
      key: "number",
      label: "Número",
      render: (row) => (
        <Link
          to="/quotes/$id"
          params={{ id: row.id }}
          style={{ color: "#0176d3", fontWeight: 600 }}
        >
          {row.quote_number}
        </Link>
      ),
      sortValue: (row) => row.quote_number ?? "",
    },
    {
      key: "name",
      label: "Nome",
      render: (row) => (
        <Link to="/quotes/$id" params={{ id: row.id }}>
          {row.name}
        </Link>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (row.is_synced ? "Sincronizada" : row.status),
      sortValue: (row) => row.status,
    },
    {
      key: "seed",
      label: "Seed",
      render: (row) => String(row.seed),
      sortValue: (row) => Number(row.seed),
    },
  ];
  const selectedTab = quoteDefinitions.length ? activeTab : "details";
  const openQuoteForm = (mode: "single" | "bulk") => {
    const open = () => (mode === "single" ? setEditingQuote(true) : setBulkQuoteRows([]));
    if (opportunity.stage === "Negociação") {
      open();
      return;
    }
    if (opportunity.stage !== "Prospecção") {
      toast.error("Cotação indisponível nesta etapa", {
        description: "A oportunidade precisa estar em Negociação para criar ou editar cotações.",
      });
      return;
    }
    toast("Avance a oportunidade para criar a Cotação", {
      description: "A criação de Cotações exige uma oportunidade em Negociação.",
      action: {
        label: "Avançar e continuar",
        onClick: () => {
          void (async () => {
            try {
              await saveRecord({
                data: { table: "opportunities", recordId: id, data: { stage: "Negociação" } },
              });
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
                qc.invalidateQueries({ queryKey: ["opportunities"] }),
                qc.invalidateQueries({ queryKey: ["account-full", opportunity.account_id] }),
              ]);
              toast.success("Oportunidade avançada para Negociação");
              setPathMessage("Etapa atualizada para Negociação.");
              open();
            } catch (error) {
              toast.error("Não foi possível avançar a oportunidade", {
                description: error instanceof Error ? error.message : "Tente novamente.",
              });
            }
          })();
        },
      },
    });
  };

  return (
    <SfShell>
      <div
        className="sf-page-header"
        style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
      >
        <div>
          <div className="sf-ph-eyebrow">Oportunidade</div>
          <h1 className="sf-ph-title">{opportunity.name}</h1>
          <div className="sf-ph-sub">
            {opportunity.instrument_type} · {opportunity.stage} ·{" "}
            {account ? (
              <Link to="/accounts/$id" params={{ id: account.id }} style={{ color: "#0176d3" }}>
                {account.name}
              </Link>
            ) : (
              "Sem conta"
            )}
          </div>
        </div>
        <div className="sf-ph-actions" style={{ marginLeft: "auto", flexWrap: "wrap" }}>
          <Link to="/opportunities" className="sf-btn">
            ← Voltar
          </Link>
          <button className="sf-btn sf-btn--brand" onClick={() => setEditing(true)}>
            Editar
          </button>
          {opportunity.stage === "Formalização" &&
            netlexInstrument &&
            !netlexContract && (
              <button
                className="sf-btn sf-btn--brand"
                disabled={!canSendContract}
                title={
                  canSendContract
                    ? "Enviar a Cotação aprovada e os dados contratuais ao NetLex simulado."
                    : "Conclua a aprovação de preços, a vigência e o preenchimento das partes contratuais."
                }
                onClick={() => {
                  setNetlexError("");
                  setNetlexModalOpen(true);
                }}
              >
                Enviar ao NetLex
              </button>
            )}
          <SfDeleteButton table="opportunities" id={id} redirectTo="/opportunities" />
        </div>
      </div>

      <OpportunityPath
        stage={opportunity.stage}
        hasSyncedQuote={hasSyncedQuote}
        priceApproved={priceApproved}
        netlexSigned={isPostContract ? postFormalized : netlexSigned}
        rules={opportunityRules}
        opportunityId={id}
        accountName={account?.name ?? "—"}
        instrument={opportunity.instrument_type}
        segment={opportunity.segment ?? "—"}
        closeDate={opportunity.close_date ? fmtDate(opportunity.close_date) : "—"}
        open={pathOpen}
        busy={pathBusy}
        message={pathMessage}
        onToggle={() => setPathOpen((value) => !value)}
        onEdit={() => setEditing(true)}
        onAdvance={async () => {
          setPathBusy(true);
          setPathMessage("");
          const nextStage =
            opportunity.stage === "Prospecção"
              ? "Negociação"
              : opportunity.stage === "Negociação"
                ? "Aprovação"
                : opportunity.stage === "Aprovação"
                  ? "Formalização"
                  : "Fechado";
          try {
            await saveRecord({
              data: { table: "opportunities", recordId: id, data: { stage: nextStage } },
            });
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
              qc.invalidateQueries({ queryKey: ["opportunities"] }),
              qc.invalidateQueries({ queryKey: ["account-full", opportunity.account_id] }),
            ]);
            setPathMessage(`Etapa atualizada para ${nextStage}.`);
          } catch (error) {
            setPathMessage(
              error instanceof Error ? error.message : "Não foi possível atualizar a etapa.",
            );
          } finally {
            setPathBusy(false);
          }
        }}
      />

      <div className="sf-highlights">
        <Highlight label="Conta de gestão" value={account?.name ?? "—"} />
        <Highlight label="Tipo de instrumento" value={opportunity.instrument_type} />
        <Highlight label="Estágio" value={opportunity.stage} />
        <Highlight label="Segmento" value={opportunity.segment ?? "—"} />
        <Highlight label="Valor" value={fmtMoney(Number(opportunity.amount))} />
        <Highlight
          label="Fechamento previsto"
          value={opportunity.close_date ? fmtDate(opportunity.close_date) : "—"}
        />
      </div>
      {isPostContract ? (
        <PostContractFormalization
          instrument={opportunity.instrument_type}
          stage={opportunity.stage}
          baseContract={baseContract}
          document={postDocument}
          contacts={(data.contacts ?? []) as any[]}
          busy={postBusy}
          onSend={async (contactId) => {
            setPostBusy(true);
            try {
              const result = await sendSalesOrderToClient({ data: { opportunityId: id, contactId } });
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
                qc.invalidateQueries({ queryKey: ["opportunities"] }),
              ]);
              toast.success(result.resent ? "Ordem de vendas reenviada" : "Ordem de vendas enviada ao cliente", {
                description: "O contato aprovador tem 7 dias para aprovar no portal.",
              });
            } catch (error) {
              toast.error("Não foi possível enviar a ordem de vendas", {
                description: error instanceof Error ? error.message : undefined,
              });
            } finally {
              setPostBusy(false);
            }
          }}
          onRegister={async () => {
            setPostBusy(true);
            try {
              await registerAdjustmentCurve({ data: { opportunityId: id } });
              await qc.invalidateQueries({ queryKey: ["opportunity-full", id] });
              toast.success("Curva de ajuste registrada", { description: "Os itens do contrato não foram alterados." });
            } catch (error) {
              toast.error("Não foi possível registrar a curva", {
                description: error instanceof Error ? error.message : undefined,
              });
            } finally {
              setPostBusy(false);
            }
          }}
          onClose={async () => {
            try {
              await saveRecord({ data: { table: "opportunities", recordId: id, data: { stage: "Fechado" } } });
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
                qc.invalidateQueries({ queryKey: ["opportunities"] }),
              ]);
              toast.success("Oportunidade fechada");
            } catch (error) {
              toast.error("Não foi possível fechar", {
                description: error instanceof Error ? error.message : undefined,
              });
            }
          }}
        />
      ) : (
      <FormalizationBanner
        stage={opportunity.stage}
        instrument={opportunity.instrument_type}
        contract={netlexContract}
        baseContract={baseContract}
        addenda={addenda}
        canSend={canSendContract}
        blockers={opportunityRules.filter((rule) => !rule.passed && !["Formalizar no NetLex", "Status Assinatura no NetLex"].includes(rule.label)).map((rule) => rule.label)}
        creatingAddendum={creatingAddendum}
        onSend={() => {
          setNetlexError("");
          setNetlexModalOpen(true);
        }}
        onClose={async () => {
          try {
            await saveRecord({ data: { table: "opportunities", recordId: id, data: { stage: "Fechado" } } });
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
              qc.invalidateQueries({ queryKey: ["opportunities"] }),
            ]);
            toast.success("Oportunidade fechada");
          } catch (error) {
            toast.error("Não foi possível fechar", {
              description: error instanceof Error ? error.message : undefined,
            });
          }
        }}
        onCreateAddendum={async () => {
          if (!netlexContract) return;
          setCreatingAddendum(true);
          try {
            const result = await createAddendumOpportunity({ data: { contractId: netlexContract.id } });
            await qc.invalidateQueries({ queryKey: ["opportunities"] });
            toast.success("Oportunidade de aditivo criada", {
              description: "Ela herda partes, vigência, reajustes e Agendas do contrato.",
            });
            await navigate({ to: "/opportunities/$id", params: { id: result.id } });
          } catch (error) {
            toast.error("Não foi possível criar o aditivo", {
              description: error instanceof Error ? error.message : undefined,
            });
          } finally {
            setCreatingAddendum(false);
          }
        }}
      />
      )}
      {opportunity.instrument_type === "Contrato" && netlexContract && netlexSigned && (
        <PostContractHub
          contract={netlexContract}
          addenda={addenda}
          postContract={(data.postContract ?? []) as any[]}
          busyKind={creatingKind}
          onCreate={async (kind) => {
            setCreatingKind(kind);
            try {
              if (kind === "Aditivo") {
                const result = await createAddendumOpportunity({ data: { contractId: netlexContract.id } });
                await qc.invalidateQueries({ queryKey: ["opportunities"] });
                toast.success("Oportunidade de aditivo criada", {
                  description: "Ela herda partes, vigência, reajustes e Agendas do contrato.",
                });
                await navigate({ to: "/opportunities/$id", params: { id: result.id } });
                return;
              }
              const result = await createPostContractFromContract({ data: { contractId: netlexContract.id, kind } });
              await qc.invalidateQueries({ queryKey: ["opportunities"] });
              toast.success(kind === SALES_ORDER ? "Ordem de vendas criada" : "Curva de ajuste criada", {
                description:
                  kind === SALES_ORDER
                    ? "A Cotação já nasce em Negociação com as condições do contrato."
                    : "A Cotação já nasce com as Agendas do contrato. Use “Mover volume”.",
              });
              await navigate({ to: "/quotes/$id", params: { id: result.quoteId } });
            } catch (error) {
              toast.error("Não foi possível criar", {
                description: error instanceof Error ? error.message : undefined,
              });
            } finally {
              setCreatingKind("");
            }
          }}
        />
      )}

      <div style={{ padding: 24 }}>
        <div
          role="tablist"
          aria-label="Seções da oportunidade"
          style={{ display: "flex", gap: 24, borderBottom: "1px solid #c9c9c9", marginBottom: 20 }}
        >
          {[
            ...(quoteDefinitions.length ? [{ id: "quotes", label: "Cotações" }] : []),
            { id: "details", label: "Detalhes" },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`opportunity-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.id}
              aria-controls={`opportunity-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "12px 4px",
                marginBottom: -1,
                border: 0,
                borderBottom:
                  selectedTab === tab.id ? "3px solid #0176d3" : "3px solid transparent",
                background: "transparent",
                color: selectedTab === tab.id ? "#014486" : "#444",
                fontWeight: selectedTab === tab.id ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {quoteDefinitions.length > 0 && (
          <section
            id="opportunity-panel-quotes"
            role="tabpanel"
            aria-labelledby="opportunity-tab-quotes"
            hidden={selectedTab !== "quotes"}
          >
            {opportunity.instrument_type === "Contrato" && hasTopTolerance && !savedTop && !inheritedTop && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 16,
                  padding: "14px 16px",
                  border: "1px solid #f5b700",
                  borderRadius: 4,
                  background: "#fff8e1",
                  color: "#5c4300",
                }}
              >
                <div>
                  <strong>Take or Pay precisa ser configurado</strong>
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    A Cotação tem tolerâncias de volume ou tarifa. Configure as datas e a regra de compensação antes de avançar a Oportunidade para Aprovação.
                  </div>
                </div>
                <button
                  type="button"
                  className="sf-btn sf-btn--brand"
                  onClick={() => setActiveTab("details")}
                >
                  Configurar agora
                </button>
              </div>
            )}
            <div className="sf-card">
              <div
                className="sf-card-header"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span>Cotações ({quoteRows.length})</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="sf-btn" onClick={() => openQuoteForm("bulk")}>
                    Criar em lote
                  </button>
                  <button className="sf-btn sf-btn--brand" onClick={() => openQuoteForm("single")}>
                    Nova Cotação
                  </button>
                </div>
              </div>
              <SfListView
                rows={quoteRows}
                columns={quoteColumns}
                rowKey={(row) => String(row.id)}
                itemLabel="cotações"
                bulkActions={[
                  { label: "Editar selecionadas", onRun: (rows) => setBulkQuoteRows(rows) },
                  {
                    label: "Excluir selecionadas",
                    variant: "danger",
                    onRun: async (rows) => {
                      if (!confirm(`Excluir ${rows.length} cotações selecionadas?`)) return;
                      await deleteRecordsBulk({
                        data: { table: "quotes", ids: rows.map((row) => String(row.id)) },
                      });
                      await refetchQuotes();
                    },
                  },
                ]}
                rowActions={[
                  { label: "Editar", onRun: (row) => setQuoteToEdit(row) },
                  {
                    label: "Excluir",
                    onRun: async (row) => {
                      if (!confirm(`Excluir a cotação “${row.name}”?`)) return;
                      await deleteRecord({ data: { table: "quotes", id: String(row.id) } });
                      await refetchQuotes();
                      await qc.invalidateQueries({ queryKey: ["quotes"] });
                    },
                  },
                ]}
              />
            </div>
          </section>
        )}

        <section
          id="opportunity-panel-details"
          role="tabpanel"
          aria-labelledby="opportunity-tab-details"
          hidden={selectedTab !== "details"}
          style={{
            display: selectedTab === "details" ? "grid" : undefined,
            gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)",
            gap: 16,
          }}
        >
          <Card title="Detalhes da oportunidade">
            <div className="sf-fields">
              <Field label="Nome" value={opportunity.name} />
              <Field label="Tipo de instrumento" value={opportunity.instrument_type} />
              <Field label="Estágio" value={opportunity.stage} />
              <Field label="Segmento" value={opportunity.segment ?? "—"} />
              <Field label="Valor da oportunidade" value={fmtMoney(Number(opportunity.amount))} />
              <Field
                label="Data de fechamento prevista"
                value={opportunity.close_date ? fmtDate(opportunity.close_date) : "—"}
              />
              <Field
                label="Início da vigência"
                value={opportunity.contract_start ? fmtDate(opportunity.contract_start) : "—"}
              />
              <Field
                label="Fim da vigência"
                value={opportunity.contract_end ? fmtDate(opportunity.contract_end) : "—"}
              />
              {(segmentHasModal(opportunity.segment, RAIL) || !isQuoteSegment(opportunity.segment)) && (
                <>
                  <Field label="Reajuste diesel (ferro)" value={`${opportunity.diesel_pct}%`} />
                  <Field label="Dia de aplicação (ferro)" value={String(opportunity.application_day ?? 10)} />
                  <Field label="Reajuste IGP-M (ferro)" value={`${opportunity.igpm_pct}%`} />
                  <Field label="Reajuste IPCA (ferro)" value={`${opportunity.ipca_pct}%`} />
                </>
              )}
              {segmentHasModal(opportunity.segment, PORT) && (
                <>
                  <Field label="Reajuste IGP-M (porto)" value={`${opportunity.port_igpm_pct ?? 100}%`} />
                  <Field label="Reajuste IPCA (porto)" value={`${opportunity.port_ipca_pct ?? 0}%`} />
                  <Field label="Diesel (porto)" value="Não se aplica" />
                </>
              )}
              <Field
                label="Primeiro reajuste"
                value={
                  opportunity.first_readjustment_date
                    ? fmtDate(opportunity.first_readjustment_date)
                    : "—"
                }
              />
              <Field label="Contratante(s)" value={opportunity.contracting_parties ?? "—"} />
              <Field label="Entidade VLI" value={opportunity.vli_entity ?? "—"} />
              <Field label="Devedor solidário" value={opportunity.joint_debtor ?? "—"} />
              <Field
                label="Tarifa padrão para novas Cotações"
                value={opportunity.integration_tariff}
              />
              <Field label="Take or Pay" value={savedTop ? "Configurado" : hasTopTolerance ? "Pendente: há tolerâncias" : "Não aplicável"} />
            </div>
          </Card>
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <Card title="Take or Pay">
              <div style={{ padding: 16, display: "grid", gap: 12 }}>
                {opportunity.instrument_type === "ACS" ? (
                  <p style={{ margin: 0 }}>ACS não admite Take or Pay nem tolerâncias nas Agendas.</p>
                ) : isPostContract ? (
                  <p style={{ margin: 0 }}>
                    Herdado do contrato-base{baseContract ? ` Nº ${baseContract.netlex_number}` : ""}. {isSalesOrder ? "A ordem de vendas" : "A curva de ajuste"} não cria nem altera Take or Pay; a apuração segue a regra do contrato.
                  </p>
                ) : opportunity.instrument_type !== "Contrato" && !isAddendum ? (
                  <p style={{ margin: 0 }}>Disponível para Contrato e aditivo de Contrato.</p>
                ) : (
                  <>
                    <p style={{ margin: 0, color: "#444" }}>
                {hasTopTolerance ? "As Agendas têm tolerâncias. Preencha e salve os parâmetros antes de avançar." : savedTop ? "Configuração salva. Sem tolerâncias nas Agendas sincronizadas no momento." : "Sem tolerâncias nas Agendas sincronizadas. Adicione uma tolerância na Cotação para ativar Take or Pay."}
                    </p>
                    {segmentModals(opportunity.segment).length > 1 && (
                      <p style={{ margin: 0, color: "#444" }}>
                        {MODAL_POLICIES[RAIL].icon} Ferro e {MODAL_POLICIES[PORT].icon} porto geram registros de Take or Pay separados: compense apenas fluxos do mesmo modal.
                      </p>
                    )}
                    <label>Data de apuração<input type="date" value={topConfig.auditDate} onChange={(e) => setTopDraft({ ...topConfig, auditDate: e.target.value })} /></label>
                    <label>Data de faturamento<input type="date" value={topConfig.billingDate} onChange={(e) => setTopDraft({ ...topConfig, billingDate: e.target.value })} /></label>
                    <label>Modelo de compensação<select value={topConfig.compensationMode} onChange={(e) => setTopDraft({ ...topConfig, compensationMode: e.target.value as TakeOrPayConfig["compensationMode"], pairs: [], groups: [] })}>
                      <option value="individual">Sem compensação entre fluxos</option><option value="all-flows">Todos os fluxos em conjunto</option><option value="flow-pairs">Pares de fluxos</option><option value="groups">Grupos de fluxos</option>
                    </select></label>
                    <label>Base de compensação<select value={topConfig.calculationBasis} onChange={(e) => setTopDraft({ ...topConfig, calculationBasis: e.target.value as TakeOrPayConfig["calculationBasis"] })}>
                      <option value="volume">Volume</option><option value="tariff">Tarifa</option><option value="both">Volume e tarifa</option>
                    </select></label>
                    {topConfig.compensationMode === "flow-pairs" && <div style={{ display: "grid", gap: 8 }}>
                      {topConfig.pairs.map((pair, index) => <div key={index} style={{ display: "grid", gap: 6, border: "1px solid #ddd", padding: 8 }}>
                        <select aria-label="Fluxo compensado" value={pair.compensatedFlowId} onChange={(e) => setTopDraft({ ...topConfig, pairs: topConfig.pairs.map((row, i) => i === index ? { ...row, compensatedFlowId: e.target.value } : row) })}>{data.takeOrPayFlows.map((flow: any) => <option key={flow.id} value={flow.id}>{flow.label}</option>)}</select>
                        <select aria-label="Fluxo compensador" value={pair.compensatingFlowId} onChange={(e) => setTopDraft({ ...topConfig, pairs: topConfig.pairs.map((row, i) => i === index ? { ...row, compensatingFlowId: e.target.value } : row) })}>{data.takeOrPayFlows.map((flow: any) => <option key={flow.id} value={flow.id}>{flow.label}</option>)}</select>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>Proporção <input aria-label="Unidades compensadas" type="number" min="0.01" step="0.01" value={pair.ratioFrom} onChange={(e) => setTopDraft({ ...topConfig, pairs: topConfig.pairs.map((row, i) => i === index ? { ...row, ratioFrom: Number(e.target.value) } : row) })} /> : <input aria-label="Unidades compensadoras" type="number" min="0.01" step="0.01" value={pair.ratioTo} onChange={(e) => setTopDraft({ ...topConfig, pairs: topConfig.pairs.map((row, i) => i === index ? { ...row, ratioTo: Number(e.target.value) } : row) })} /><button type="button" onClick={() => setTopDraft({ ...topConfig, pairs: topConfig.pairs.filter((_, i) => i !== index) })}>Remover</button></div>
                      </div>)}
                      <button type="button" disabled={!data.takeOrPayFlows.length} onClick={() => setTopDraft({ ...topConfig, pairs: [...topConfig.pairs, { compensatedFlowId: data.takeOrPayFlows[0].id, compensatingFlowId: data.takeOrPayFlows[0].id, ratioFrom: 1, ratioTo: 1 }] })}>+ Adicionar par</button>
                    </div>}
                    {topConfig.compensationMode === "groups" && <div style={{ display: "grid", gap: 8 }}>
                      {topConfig.groups.map((group, index) => <div key={index} style={{ border: "1px solid #ddd", padding: 8 }}>
                        <input aria-label="Nome do grupo" placeholder="Nome do grupo" value={group.name} onChange={(e) => setTopDraft({ ...topConfig, groups: topConfig.groups.map((row, i) => i === index ? { ...row, name: e.target.value } : row) })} />
                        {data.takeOrPayFlows.map((flow: any) => <label key={flow.id} style={{ display: "block" }}><input type="checkbox" checked={group.flowIds.includes(flow.id)} onChange={(e) => setTopDraft({ ...topConfig, groups: topConfig.groups.map((row, i) => i === index ? { ...row, flowIds: e.target.checked ? [...row.flowIds, flow.id] : row.flowIds.filter((id) => id !== flow.id) } : row) })} /> {flow.label}</label>)}
                        <button type="button" onClick={() => setTopDraft({ ...topConfig, groups: topConfig.groups.filter((_, i) => i !== index) })}>Remover grupo</button>
                      </div>)}
                      <button type="button" onClick={() => setTopDraft({ ...topConfig, groups: [...topConfig.groups, { name: "", flowIds: [] }] })}>+ Adicionar grupo</button>
                    </div>}
                    {topError && <p role="alert" style={{ color: "#ba0517", margin: 0 }}>{topError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" disabled={topBusy || (!hasTopTolerance && !savedTop)} onClick={() => void (async () => { setTopBusy(true); setTopError(""); try { await updateOpportunityTakeOrPay({ data: { id, config: topConfig } }); setTopDraft(null); await qc.invalidateQueries({ queryKey: ["opportunity-full", id] }); toast.success("Take or Pay salvo"); } catch (e) { setTopError(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setTopBusy(false); } })()}>{topBusy ? "Salvando…" : "Salvar Take or Pay"}</button>
                      {savedTop && <button type="button" disabled={topBusy} onClick={() => void (async () => { setTopBusy(true); try { await updateOpportunityTakeOrPay({ data: { id, config: null } }); setTopDraft(null); await qc.invalidateQueries({ queryKey: ["opportunity-full", id] }); } catch (e) { setTopError(e instanceof Error ? e.message : "Não foi possível remover."); } finally { setTopBusy(false); } })()}>Remover configuração</button>}
                    </div>
                    <small>A apuração e qualquer compensação financeira acontecem fora deste aplicativo.</small>
                  </>
                )}
              </div>
            </Card>
            <Card title="Conta de gestão">
              {account ? (
                <div className="sf-fields">
                  <Field label="Conta" value={account.name} />
                  <Field label="Setor" value={account.industry ?? "—"} />
                  <Field
                    label="Local"
                    value={[account.city, account.state].filter(Boolean).join(", ") || "—"}
                  />
                </div>
              ) : (
                <div style={{ padding: 16 }}>Sem conta vinculada.</div>
              )}
            </Card>
          </div>
        </section>
      </div>
      {editingQuote && (
        <SfRecordDialog
          title="Nova Cotação"
          table="quotes"
          fields={quoteFieldsFor(opportunity.instrument_type)}
          defaults={{
            name: `${opportunity.name} · ${opportunity.segment}`,
            record_type: recordTypeFor(opportunity.instrument_type),
            status: "Rascunho",
            is_synced: 0,
            seed: 20260929,
          }}
          transform={(form) => ({
            ...form,
            opportunity_id: id,
            seed: Number(form.seed || 20260929),
          })}
          onClose={() => setEditingQuote(false)}
          onSaved={async () => {
            setEditingQuote(false);
            await refetchQuotes();
            await qc.invalidateQueries({ queryKey: ["quotes"] });
          }}
        />
      )}
      {quoteToEdit && (
        <SfRecordDialog
          title={`Editar ${quoteToEdit.name}`}
          table="quotes"
          recordId={quoteToEdit.id}
          fields={quoteFieldsFor(opportunity.instrument_type)}
          defaults={{
            name: quoteToEdit.name,
            record_type: quoteToEdit.record_type,
            seed: quoteToEdit.seed,
          }}
          transform={(form) => ({
            ...form,
            opportunity_id: id,
            seed: Number(form.seed || 20260929),
          })}
          onClose={() => setQuoteToEdit(null)}
          onSaved={async () => {
            setQuoteToEdit(null);
            await refetchQuotes();
            await qc.invalidateQueries({ queryKey: ["quotes"] });
          }}
        />
      )}
      {bulkQuoteRows !== null && (
        <SfBulkRecordDialog
          table="quotes"
          fields={quoteFieldsFor(opportunity.instrument_type)}
          defaults={{
            opportunity_id: id,
            name: `${opportunity.name} · ${opportunity.segment}`,
            record_type: recordTypeFor(opportunity.instrument_type),
            status: "Rascunho",
            is_synced: 0,
            seed: 20260929,
          }}
          rows={bulkQuoteRows.length ? bulkQuoteRows : undefined}
          transform={(form) => ({
            ...form,
            opportunity_id: id,
            seed: Number(form.seed || 20260929),
          })}
          onClose={() => setBulkQuoteRows(null)}
          onSaved={async () => {
            setBulkQuoteRows(null);
            await refetchQuotes();
            await qc.invalidateQueries({ queryKey: ["quotes"] });
          }}
        />
      )}
      {editing && (
        <SfRecordDialog
          title={`Editar ${opportunity.name}`}
          table="opportunities"
          recordId={id}
          fields={fields}
          defaults={defaults}
          transform={transform}
          onClose={() => setEditing(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["opportunity-full", id] });
            qc.invalidateQueries({ queryKey: ["opportunities"] });
            qc.invalidateQueries({ queryKey: ["account-full", opportunity.account_id] });
          }}
        />
      )}
      {netlexModalOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !netlexBusy)
              setNetlexModalOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0,0,0,.48)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="netlex-modal-title"
            style={{
              width: "min(560px, 100%)",
              background: "white",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 12px 48px rgba(0,0,0,.25)",
              position: "relative",
            }}
          >
            <button
              type="button"
              aria-label="Fechar"
              disabled={netlexBusy}
              onClick={() => setNetlexModalOpen(false)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                border: 0,
                background: "transparent",
                fontSize: 24,
                cursor: netlexBusy ? "not-allowed" : "pointer",
                color: "#555",
              }}
            >
              ×
            </button>
            <h2 id="netlex-modal-title" style={{ margin: "0 28px 8px 0", fontSize: 20 }}>
              {isAddendum ? "Enviar aditivo ao NetLex" : "Enviar ao NetLex"}
            </h2>
            <p style={{ margin: "0 0 20px", color: "#5c5c5c", fontSize: 14 }}>
              A Cotação aprovada e os dados contratuais serão reunidos em uma minuta demonstrativa.
            </p>
            {netlexBusy ? (
              <div style={{ textAlign: "center", padding: "20px 8px" }} role="status">
                <div className="netlex-upload-animation" aria-hidden="true">
                  <span>📄</span>
                  <span>↑</span>
                  <span>⚖️</span>
                </div>
                <strong>Enviando documento…</strong>
                <div style={{ color: "#5c5c5c", fontSize: 13, marginTop: 6 }}>
                  Preparando condições comerciais, agendas e partes contratuais.
                </div>
              </div>
            ) : netlexContract ? (
              <div role="status" style={{ padding: 12, borderRadius: 8, background: "#f0f9f1" }}>
                <strong>Contrato criado</strong>
                <div style={{ margin: "6px 0 14px" }}>
                  Nº {netlexContract.netlex_number} · {netlexContract.status}
                </div>
                <a
                  className="sf-btn sf-btn--brand"
                  href={`/netlex/contracts/${netlexContract.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir contrato ↗
                </a>
              </div>
            ) : (
              <>
                {netlexError && (
                  <div role="alert" style={{ color: "#ba0517", marginBottom: 14 }}>
                    {netlexError}
                  </div>
                )}
                <div
                  style={{
                    padding: 12,
                    background: "#f8f8f8",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#444",
                  }}
                >
                  Cliente: <strong>{account?.name ?? "—"}</strong>
                  <br />
                  Vigência:{" "}
                  <strong>
                    {fmtDate(opportunity.contract_start)} a {fmtDate(opportunity.contract_end)}
                  </strong>
                  <br />
                  Cotação: <strong>{syncedQuote?.quote_number ?? "—"}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                  <button className="sf-btn" onClick={() => setNetlexModalOpen(false)}>
                    Cancelar
                  </button>
                  <button
                    className="sf-btn sf-btn--brand"
                    disabled={!canSendContract}
                    onClick={() => {
                      void (async () => {
                        setNetlexBusy(true);
                        setNetlexError("");
                        try {
                          const [response] = await Promise.all([
                            sendOpportunityToNetlex({ data: { opportunityId: id } }),
                            new Promise((resolve) => window.setTimeout(resolve, 1400)),
                          ]);
                          setSentContract(response.contract);
                          await Promise.all([
                            qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
                            qc.invalidateQueries({ queryKey: ["opportunities"] }),
                          ]);
                          toast.success(`${isAddendum ? "Aditivo" : opportunity.instrument_type === "ACS" ? "ACS" : "Contrato"} preparado no NetLex simulado`, {
                            description: `Número ${response.contract.netlex_number} · aguardando retorno.`,
                          });
                        } catch (error) {
                          setNetlexError(
                            error instanceof Error
                              ? error.message
                              : "Não foi possível preparar o contrato.",
                          );
                        } finally {
                          setNetlexBusy(false);
                        }
                      })();
                    }}
                  >
                    Enviar minuta
                  </button>
                </div>
              </>
            )}
            <div style={{ color: "#706e6b", fontSize: 11, marginTop: 16 }}>
              Simulação local — nenhum documento é enviado ao NetLex real.
            </div>
          </section>
        </div>
      )}
    </SfShell>
  );
}

function OpportunityPath({
  stage,
  hasSyncedQuote,
  priceApproved,
  netlexSigned,
  rules,
  accountName,
  instrument,
  segment,
  closeDate,
  open,
  busy,
  message,
  onToggle,
  onEdit,
  onAdvance,
}: {
  stage: string;
  hasSyncedQuote: boolean;
  priceApproved: boolean;
  netlexSigned: boolean;
  rules: BusinessRule[];
  opportunityId?: string;
  accountName: string;
  instrument: string;
  segment: string;
  closeDate: string;
  open: boolean;
  busy: boolean;
  message: string;
  onToggle: () => void;
  onEdit: () => void;
  onAdvance: () => void;
}) {
  const activeIndex = Math.max(0, STAGES.indexOf(stage));
  const canAdvance =
    stage === "Prospecção" ||
    (stage === "Negociação" && hasSyncedQuote) ||
    (stage === "Aprovação" && hasSyncedQuote && priceApproved) ||
    (stage === "Formalização" && netlexSigned);
  return (
    <section className="sf-path-card" aria-label="Caminho da oportunidade">
      <button
        className="sf-path-collapse"
        aria-label={open ? "Recolher caminho" : "Expandir caminho"}
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? "⌃" : "⌄"}
      </button>
      {open && (
        <>
          <div className="sf-path-main">
            <div className="sf-path-steps" role="list" aria-label="Etapas">
              {STAGES.map((item, index) => (
                <div
                  key={item}
                  role="listitem"
                  aria-current={index === activeIndex ? "step" : undefined}
                  className={
                    "sf-path-step" +
                    (index < activeIndex ? " is-complete" : "") +
                    (index === activeIndex ? " is-current" : "")
                  }
                >
                  <span className="sf-path-check">{index < activeIndex ? "✓" : ""}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <button
              className="sf-btn sf-btn--brand sf-path-action"
              disabled={!canAdvance || busy}
              onClick={onAdvance}
            >
              {busy
                ? "Salvando…"
                : stage === "Aprovação"
                  ? "✓  Liberar para Formalização"
                  : stage === "Formalização"
                    ? "✓  Fechar oportunidade"
                    : stage === "Fechado"
                      ? "✓  Oportunidade fechada"
                      : "✓  Marcar etapa como concluída"}
            </button>
          </div>
          <div className="sf-path-panels">
            <div className="sf-path-keyfields">
              <div className="sf-path-panel-heading">
                <span>Campos principais</span>
                <button className="sf-link" onClick={onEdit}>
                  Editar
                </button>
              </div>
              <div className="sf-path-field">
                <span>Conta de gestão</span>
                <strong>{accountName}</strong>
              </div>
              <div className="sf-path-field">
                <span>Tipo de instrumento</span>
                <strong>{instrument}</strong>
              </div>
              <div className="sf-path-field">
                <span>Segmento</span>
                <strong>{segment}</strong>
              </div>
              <div className="sf-path-field">
                <span>Fechamento previsto</span>
                <strong>{closeDate}</strong>
              </div>
            </div>
            <BusinessRulesChecklist rules={rules} />
          </div>
          {message && (
            <div className="sf-path-message" role="status">
              {message}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FormalizationBanner({
  stage,
  instrument,
  contract,
  baseContract,
  addenda,
  canSend,
  blockers,
  creatingAddendum,
  onSend,
  onClose,
  onCreateAddendum,
}: {
  stage: string;
  instrument: string;
  contract: any | null;
  baseContract: any | null;
  addenda: any[];
  canSend: boolean;
  blockers: string[];
  creatingAddendum: boolean;
  onSend: () => void;
  onClose: () => void;
  onCreateAddendum: () => void;
}) {
  const isAddendum = instrument === "Aditivo";
  const netlexInstrument = ["Contrato", "ACS", "Aditivo"].includes(instrument);
  const openLink = (target: any, label = "Abrir no NetLex ↗") => (
    <a className="sf-btn" href={`/netlex/contracts/${target.id}`} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
  const baseLine = isAddendum && baseContract && (
    <div className="sf-next-step-detail">
      Aditivo ao contrato{" "}
      <a href={`/netlex/contracts/${baseContract.id}`} target="_blank" rel="noreferrer" style={{ color: "#0176d3" }}>
        Nº {baseContract.netlex_number}
      </a>{" "}
      · {baseContract.status}
    </div>
  );
  if (!contract) {
    if (stage !== "Formalização") {
      if (!isAddendum || !baseContract) return null;
      return (
        <div className="sf-next-step">
          <div>
            <div className="sf-next-step-eyebrow">Aditivo</div>
            <div className="sf-next-step-title">Mudanças sobre o contrato Nº {baseContract.netlex_number}</div>
            <div className="sf-next-step-detail">
              A Cotação começa com as Agendas do contrato (Manter). Altere, exclua ou inclua Agendas; o NetLex recebe só o que mudou.
            </div>
          </div>
          <div className="sf-next-step-actions">{openLink(baseContract, "Contrato original ↗")}</div>
        </div>
      );
    }
    if (!netlexInstrument) return null;
    return (
      <div className={"sf-next-step" + (canSend ? "" : " is-warning")}>
        <div>
          <div className="sf-next-step-eyebrow">Formalização · próximo passo</div>
          <div className="sf-next-step-title">
            {isAddendum ? "Enviar o aditivo ao NetLex" : `Enviar ${instrument === "ACS" ? "o ACS" : "o contrato"} ao NetLex`}
          </div>
          <div className="sf-next-step-detail">
            {canSend
              ? "Tudo pronto. O envio gera o número do documento com status “Análise jurídica”."
              : `Pendências: ${blockers.join(" · ") || "confira as regras de negócio"}.`}
          </div>
          {baseLine}
        </div>
        <div className="sf-next-step-actions">
          <button className="sf-btn sf-btn--brand" disabled={!canSend} onClick={onSend}>
            Enviar ao NetLex
          </button>
        </div>
      </div>
    );
  }
  const signed = contract.status === "Assinatura";
  return (
    <div className={"sf-next-step" + (signed ? " is-success" : " is-warning")}>
      <div>
        <div className="sf-next-step-eyebrow">
          {isAddendum ? "Aditivo" : instrument === "ACS" ? "ACS" : "Contrato"} NetLex · simulação
        </div>
        <div className="sf-next-step-title">
          Nº {contract.netlex_number} · {contract.status}
        </div>
        <div className="sf-next-step-detail">
          {!signed
            ? "Próximo passo: abra o documento no NetLex e mude o status para Assinatura."
            : stage === "Formalização"
              ? "Documento em Assinatura. Feche a Oportunidade para concluir a Formalização."
              : isAddendum
                ? "Aditivo em Assinatura: as mudanças já foram aplicadas no contrato original."
                : instrument === "Contrato"
                  ? "Contrato em Assinatura. Use o hub Pós-contrato abaixo para aditivo, ordem de vendas ou curva de ajuste."
                  : "Documento em Assinatura. ACS não gera aditivo."}
        </div>
        {baseLine}
      </div>
      <div className="sf-next-step-actions">
        {openLink(contract)}
        {signed && stage === "Formalização" && (
          <button className="sf-btn sf-btn--brand" onClick={onClose}>
            ✓ Fechar oportunidade
          </button>
        )}
      </div>
    </div>
  );
}

function isOpportunityTermValid(opportunity: any) {
  if (!opportunity.contract_start || !opportunity.contract_end) return false;
  const start = new Date(`${opportunity.contract_start}T00:00:00Z`);
  const end = new Date(`${opportunity.contract_end}T00:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return false;
  if (opportunity.instrument_type !== "ACS") return true;
  const limit = new Date(start);
  limit.setUTCMonth(limit.getUTCMonth() + 12);
  return end < limit;
}

function isTermOver365Days(opportunity: any) {
  if (!opportunity?.contract_start || !opportunity?.contract_end) return false;
  const start = Date.parse(`${opportunity.contract_start}T00:00:00Z`);
  const end = Date.parse(`${opportunity.contract_end}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && end - start > 365 * 86400000;
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="sf-highlight">
      <div className="sf-highlight-label">{label}</div>
      <div className="sf-highlight-value">{value}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sf-card">
      <div className="sf-card-header">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="sf-field">
      <div className="sf-field-label">{label}</div>
      <div className="sf-field-value">{value}</div>
    </div>
  );
}
