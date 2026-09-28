CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Cliente - Direto',
  industry text,
  city text,
  state text,
  phone text,
  website text,
  account_owner text,
  revenue numeric NOT NULL DEFAULT 0,
  employees integer NOT NULL DEFAULT 0,
  health text NOT NULL DEFAULT 'Verde',
  customer_status text NOT NULL DEFAULT 'Prospecção',
  risk_level text NOT NULL DEFAULT 'Baixo',
  branch_name text,
  lifetime_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  decision_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_account_id ON public.contacts(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO anon, authenticated;
GRANT ALL ON public.accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO anon, authenticated;
GRANT ALL ON public.contacts TO service_role;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_public_all" ON public.accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "contacts_public_all" ON public.contacts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();