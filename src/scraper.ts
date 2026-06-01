import axios from "axios";
import { logger } from "./logger.js";

const BASE = "https://www.allabolag.se";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
};

export interface CompanySearchResult {
  name: string;
  orgNumber: string;
  location: string;
  link: string;
  revenue?: string;
  employees?: string;
}

export interface CompanyInfo {
  name: string;
  orgNumber: string;
  location: string;
  status: string;
  revenue?: string;
  profit?: string;
  employees?: string;
  description?: string;
  phone?: string;
  email?: string;
  ceo?: string;
  industry?: string[];
}

function formatOrgNumber(orgnr: string | null | undefined): string {
  const digits = (orgnr ?? "").replace(/\D/g, "");
  return digits.length === 10
    ? `${digits.slice(0, 6)}-${digits.slice(6)}`
    : orgnr ?? "";
}

// allabolag.se is a Next.js SPA: the search results are not rendered into the
// HTML, they are embedded as JSON in <script id="__NEXT_DATA__"> and hydrated
// client-side. We parse that JSON directly instead of scraping the DOM.
function extractNextData(html: string): unknown {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error("allabolag.se layout changed: __NEXT_DATA__ not found");
  }
  return JSON.parse(match[1]);
}

interface RawCompany {
  name?: string;
  legalName?: string;
  orgnr?: string;
  status?: string;
  statusRemarks?: string[];
  revenue?: number | string | null;
  profit?: number | string | null;
  currency?: string | null;
  employees?: number | string | null;
  description?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  location?: { municipality?: string };
  visitorAddress?: { addressLine?: string; zipCode?: string; postPlace?: string };
  postalAddress?: { addressLine?: string; zipCode?: string; postPlace?: string };
  contactPerson?: { name?: string; role?: string };
  industries?: Array<{ name?: string }>;
}

async function fetchCompanies(query: string): Promise<RawCompany[]> {
  const url = `${BASE}/bransch-s%C3%B6k?q=${encodeURIComponent(query)}`;
  logger.log("Fetching:", url);
  const response = await axios.get(url, { headers: HEADERS });
  const data = extractNextData(response.data) as {
    props?: {
      pageProps?: {
        hydrationData?: {
          searchStore?: {
            companies?: { companies?: RawCompany[] };
            companiesByName?: { companies?: RawCompany[] };
          };
        };
      };
    };
  };
  const store = data?.props?.pageProps?.hydrationData?.searchStore ?? {};
  const companies =
    store?.companies?.companies ?? store?.companiesByName?.companies ?? [];
  logger.log("Companies parsed:", companies.length);
  return companies;
}

function locationOf(c: RawCompany): string {
  const addr = c.visitorAddress ?? c.postalAddress ?? {};
  return [addr.addressLine, addr.zipCode, addr.postPlace ?? c.location?.municipality]
    .filter(Boolean)
    .join(", ");
}

function moneyOf(
  value: number | string | null | undefined,
  currency: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return `${value} ${currency ?? "KSEK"}`;
}

function employeesOf(
  value: number | string | null | undefined,
): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

export async function searchCompanies(
  query: string,
): Promise<CompanySearchResult[]> {
  const companies = await fetchCompanies(query);
  return companies
    .map((c) => ({
      name: c.legalName || c.name || "",
      orgNumber: formatOrgNumber(c.orgnr),
      location: locationOf(c),
      // get-company-info re-queries by org number, so that is the stable handle
      link: formatOrgNumber(c.orgnr),
      revenue: moneyOf(c.revenue, c.currency),
      employees: employeesOf(c.employees),
    }))
    .filter((r) => r.name && r.orgNumber);
}

export async function getCompanyInfo(orgnr: string): Promise<CompanyInfo> {
  const digits = (orgnr ?? "").replace(/\D/g, "");
  const companies = await fetchCompanies(digits || orgnr);
  const company =
    companies.find((c) => (c.orgnr ?? "").replace(/\D/g, "") === digits) ??
    companies[0];
  if (!company) {
    throw new Error(`No company found for "${orgnr}"`);
  }
  const remarks = Array.isArray(company.statusRemarks)
    ? company.statusRemarks.join("; ")
    : "";
  return {
    name: company.legalName || company.name || "",
    orgNumber: formatOrgNumber(company.orgnr),
    location: locationOf(company),
    status: company.status || remarks || "Aktiv",
    revenue: moneyOf(company.revenue, company.currency),
    profit: moneyOf(company.profit, company.currency),
    employees: employeesOf(company.employees),
    description: company.description || undefined,
    phone: company.phone || company.mobile || undefined,
    email: company.email || undefined,
    ceo: company.contactPerson?.name
      ? `${company.contactPerson.name}${
          company.contactPerson.role ? ` (${company.contactPerson.role})` : ""
        }`
      : undefined,
    industry: Array.isArray(company.industries)
      ? company.industries
          .map((i) => i.name)
          .filter((n): n is string => Boolean(n))
      : undefined,
  };
}
